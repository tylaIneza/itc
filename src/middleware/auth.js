const jwt    = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { role: true, company: true },
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'User not found or inactive' });
    }
    if (user.company_id && !user.company?.is_active) {
      return res.status(403).json({ error: 'This company account has been suspended' });
    }

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { role_permissions: { some: { role_id: user.role_id } } },
          { user_permissions: { some: { user_id: user.id } } },
        ],
      },
      select: { name: true },
    });

    req.user = {
      id:                  user.id,
      name:                user.name,
      email:               user.email,
      role_id:             user.role_id,
      is_active:           user.is_active,
      role:                user.role.name,
      company_id:          user.company_id,
      branch_id:           user.branch_id,
      effective_branch_id: user.branch_id,
      permissions:         permissions.map(p => p.name),
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const requireSuperAdmin = (req, res, next) => {
  if (req.user?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
};

// Blocks any request from an account with no company (i.e. superadmin) from
// reaching business-data routes — defense in depth on top of superadmin
// simply never being routed here.
const requireCompanyScope = (req, res, next) => {
  if (!req.user?.company_id) {
    return res.status(403).json({ error: 'This account has no access to company data' });
  }
  next();
};

const requireAdminOrManager = (req, res, next) => {
  if (!['admin', 'manager'].includes(req.user?.role)) {
    return res.status(403).json({ error: 'Admin or Manager access required' });
  }
  next();
};

const requirePermission = (permission) => (req, res, next) => {
  if (!req.user?.permissions?.includes(permission)) {
    return res.status(403).json({ error: `Permission required: ${permission}` });
  }
  next();
};

const notAdmin = (req, res, next) => {
  if (req.user?.role === 'admin') {
    return res.status(403).json({ error: 'Admins cannot perform this action' });
  }
  next();
};

const sellerOnly = (req, res, next) => {
  if (req.user?.role !== 'seller') {
    return res.status(403).json({ error: 'Only sellers can perform this action' });
  }
  next();
};

module.exports = {
  authenticate, requireAdmin, requireAdminOrManager, requirePermission, notAdmin, sellerOnly,
  requireSuperAdmin, requireCompanyScope,
};
