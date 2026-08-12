const prisma = require('../lib/prisma');

exports.getAll = async (req, res) => {
  try {
    const { user_id, module, action, start_date, end_date, page = 1, limit = 50 } = req.query;
    const where = { branch: { company_id: req.user.company_id } };

    if (user_id)    where.user_id = parseInt(user_id);
    if (module)     where.module  = module;
    if (action)     where.action  = { contains: action };
    if (start_date || end_date) {
      where.created_at = {};
      if (start_date) where.created_at.gte = new Date(start_date);
      if (end_date)   where.created_at.lte = new Date(end_date + 'T23:59:59');
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const take  = parseInt(limit);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({ logs, total, page: parseInt(page), limit: take });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getModules = async (req, res) => {
  const logs = await prisma.auditLog.findMany({
    where:   { branch: { company_id: req.user.company_id } },
    select:  { module: true },
    distinct: ['module'],
    orderBy: { module: 'asc' },
  });
  res.json({ modules: logs.map(l => l.module) });
};
