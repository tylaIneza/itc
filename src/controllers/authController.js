const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { auditLog } = require('../middleware/audit');

const generateToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

exports.login = async (req, res) => {
  const { identifier, email, password } = req.body;
  const loginId = (identifier || email || '').trim();
  if (!loginId || !password) {
    return res.status(400).json({ error: 'Email/phone and password are required' });
  }

  try {
    const isPhone = /^[+\d][\d\s\-().]{5,}$/.test(loginId);
    const user = await prisma.user.findFirst({
      where: {
        is_active: true,
        ...(isPhone
          ? { phone: loginId }
          : { email: loginId.toLowerCase() }),
      },
      include: { role: true, company: true },
    });

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.company_id && !user.company?.is_active) {
      return res.status(403).json({ error: 'This company account has been suspended' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await auditLog({
        userId: user.id, userName: user.name, branchId: user.branch_id, action: 'LOGIN_FAILED',
        module: 'AUTH', description: 'Failed login attempt',
        ipAddress: req.ip, userAgent: req.headers['user-agent'],
      });
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { last_login: new Date() } });

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { role_permissions: { some: { role_id: user.role_id } } },
          { user_permissions: { some: { user_id: user.id } } },
        ],
      },
      select: { name: true },
    });

    await auditLog({
      userId: user.id, userName: user.name, branchId: user.branch_id, action: 'LOGIN',
      module: 'AUTH', description: 'User logged in',
      ipAddress: req.ip, userAgent: req.headers['user-agent'],
    });

    const token = generateToken({ ...user, role: user.role.name });
    res.json({
      token,
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        role:        user.role.name,
        company_id:  user.company_id,  // null = superadmin (no company)
        branch_id:   user.branch_id,
        permissions: permissions.map(p => p.name),
        avatar_url:  user.avatar_url,
        last_login:  user.last_login,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.logout = async (req, res) => {
  await auditLog({
    userId: req.user.id, userName: req.user.name, branchId: req.user.branch_id, action: 'LOGOUT',
    module: 'AUTH', description: 'User logged out',
    ipAddress: req.ip, userAgent: req.headers['user-agent'],
  });
  res.json({ message: 'Logged out successfully' });
};

exports.me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { role: true },
    });
    res.json({
      user: {
        id:          user.id,
        name:        user.name,
        email:       user.email,
        phone:       user.phone,
        company_id:  user.company_id,
        branch_id:   user.branch_id,
        avatar_url:  user.avatar_url,
        last_login:  user.last_login,
        created_at:  user.created_at,
        role:        user.role.name,
        permissions: req.user.permissions,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.changePassword = async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password || new_password.length < 8) {
    return res.status(400).json({ error: 'Invalid password data. Minimum 8 characters.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await prisma.user.update({ where: { id: req.user.id }, data: { password_hash: hash } });

    await auditLog({
      userId: req.user.id, userName: req.user.name, action: 'PASSWORD_CHANGED',
      module: 'AUTH', description: 'Password changed', ipAddress: req.ip,
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
