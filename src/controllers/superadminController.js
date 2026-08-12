const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { auditLog } = require('../middleware/audit');
const { buildReport } = require('../lib/reportQuery');

// branch_id IN (...) filter across every branch a company owns (a company
// may have more than one branch even though createCompany only makes one).
const bSqlList = (branchIds, alias) => {
  if (!branchIds.length) return 'AND 1=0';
  const col = alias ? `${alias}.branch_id` : 'branch_id';
  return `AND ${col} IN (${branchIds.join(',')})`;
};

const slugify = (name) =>
  name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

async function uniqueSlug(baseName) {
  const base = slugify(baseName) || 'company';
  let slug = base;
  let n = 1;
  while (await prisma.company.findUnique({ where: { slug } })) {
    n += 1;
    slug = `${base}-${n}`;
  }
  return slug;
}

exports.listCompanies = async (req, res) => {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { users: true } },
        branches: { select: { id: true, name: true } },
      },
    });
    res.json({
      companies: companies.map(c => ({
        id:         c.id,
        name:       c.name,
        slug:       c.slug,
        is_active:  c.is_active,
        created_at: c.created_at,
        user_count: c._count.users,
        branch:     c.branches[0]?.name || null,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createCompany = async (req, res) => {
  const { company_name, admin_name, admin_email, admin_password } = req.body;
  if (!company_name || !admin_name || !admin_email || !admin_password) {
    return res.status(400).json({ error: 'Company name, admin name, admin email, and admin password are required' });
  }
  if (admin_password.length < 8) {
    return res.status(400).json({ error: 'Admin password must be at least 8 characters' });
  }

  const email = admin_email.toLowerCase().trim();

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(409).json({ error: 'Admin email already in use' });

    const adminRole = await prisma.role.findUnique({ where: { name: 'admin' } });
    if (!adminRole) return res.status(500).json({ error: 'Admin role not seeded' });

    const slug = await uniqueSlug(company_name);
    const passwordHash = await bcrypt.hash(admin_password, 12);

    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: company_name.trim(), slug },
      });
      const branch = await tx.branch.create({
        data: { company_id: company.id, name: `${company_name.trim()} Main` },
      });
      const admin = await tx.user.create({
        data: {
          name:          admin_name.trim(),
          email,
          password_hash: passwordHash,
          role_id:       adminRole.id,
          company_id:    company.id,
          branch_id:     branch.id,
        },
      });
      return { company, branch, admin };
    });

    await auditLog({
      userId: req.user.id, userName: req.user.name, action: 'CREATE_COMPANY',
      module: 'SUPERADMIN', entityType: 'company', entityId: result.company.id,
      description: `Created company: ${result.company.name} (admin: ${email})`,
      newValues: { company_name, admin_email: email },
    });

    res.status(201).json({
      message: 'Company created',
      company: { id: result.company.id, name: result.company.name, slug: result.company.slug },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getCompanyDashboard = async (req, res) => {
  const companyId = parseInt(req.params.id);
  const { period = 'weekly', start_date, end_date } = req.query;
  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      include: {
        branches: { select: { id: true, name: true } },
        _count:   { select: { users: true } },
      },
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const branchIds = company.branches.map(b => b.id);

    const [report, stockStats] = await Promise.all([
      buildReport({ branchClause: (alias) => bSqlList(branchIds, alias), period, start_date, end_date }),
      prisma.$queryRawUnsafe(
        `SELECT COUNT(*) as total_products, COALESCE(SUM(quantity),0) as total_items,
                SUM(CASE WHEN quantity <= low_stock_threshold THEN 1 ELSE 0 END) as low_stock_count
         FROM products WHERE is_active = 1 ${bSqlList(branchIds, '')}`),
    ]);

    res.json({
      company: {
        id:         company.id,
        name:       company.name,
        slug:       company.slug,
        is_active:  company.is_active,
        user_count: company._count.users,
        branches:   company.branches,
      },
      ...report,
      stock_stats: {
        total_products: Number(stockStats[0].total_products),
        total_items:    Number(stockStats[0].total_items),
        low_stock_count: Number(stockStats[0].low_stock_count),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getAuditLogs = async (req, res) => {
  try {
    const { company_id, module, action, start_date, end_date, page = 1, limit = 50 } = req.query;
    const where = {};

    if (company_id) where.branch = { company_id: parseInt(company_id) };
    if (module)      where.module = module;
    if (action)      where.action = { contains: action };
    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at.gte = new Date(start_date);
      if (end_date)   where.created_at.lte = new Date(end_date + 'T23:59:59');
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip, take,
        include: { branch: { select: { company: { select: { name: true } } } } },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      logs: logs.map(({ branch, ...log }) => ({
        ...log,
        company_name: branch?.company?.name || 'Platform',
      })),
      total, page: parseInt(page), limit: take,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.toggleActive = async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const company = await prisma.company.findUnique({ where: { id } });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const updated = await prisma.company.update({
      where: { id },
      data: { is_active: !company.is_active },
    });

    await auditLog({
      userId: req.user.id, userName: req.user.name, action: 'TOGGLE_COMPANY_ACTIVE',
      module: 'SUPERADMIN', entityType: 'company', entityId: id,
      description: `${updated.is_active ? 'Activated' : 'Suspended'} company: ${updated.name}`,
    });

    res.json({ message: 'Company updated', is_active: updated.is_active });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
