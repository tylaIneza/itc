const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { createAuditLog } = require('../utils/audit');
const { successResponse, errorResponse } = require('../utils/helpers');

// GET /api/users
router.get('/', authenticate, hasPermission('edit_users'), async (req, res) => {
  try {
    const { search, roleId, isActive, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (search) {
      where.OR = [
        { fullName: { contains: search } },
        { email: { contains: search } },
        { phoneNumber: { contains: search } },
      ];
    }
    if (roleId) where.roleId = parseInt(roleId);
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          role: true,
          branch: true,
          permissions: { include: { permission: true } },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    const safeUsers = users.map(({ password, ...u }) => u);
    return successResponse(res, { users: safeUsers, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch users', 500);
  }
});

// GET /api/users/roles
router.get('/roles', authenticate, async (req, res) => {
  try {
    const roles = await prisma.role.findMany();
    return successResponse(res, roles);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch roles', 500);
  }
});

// GET /api/users/permissions
router.get('/permissions', authenticate, async (req, res) => {
  try {
    const permissions = await prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { name: 'asc' }] });
    return successResponse(res, permissions);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch permissions', 500);
  }
});

// POST /api/users
router.post('/', authenticate, hasPermission('create_users'), async (req, res) => {
  try {
    const { fullName, email, phoneNumber, password, roleId, branchId, permissionIds, forcePasswordChange } = req.body;
    if (!fullName || !email || !phoneNumber || !password || !roleId) {
      return errorResponse(res, 'Missing required fields', 400);
    }

    const exists = await prisma.user.findFirst({
      where: { OR: [{ email: email.toLowerCase() }, { phoneNumber }] },
    });
    if (exists) return errorResponse(res, 'Email or phone number already exists', 409);

    const hashed = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    const user = await prisma.user.create({
      data: {
        fullName,
        email: email.toLowerCase(),
        phoneNumber,
        password: hashed,
        roleId: parseInt(roleId),
        branchId: branchId ? parseInt(branchId) : null,
        forcePasswordChange: forcePasswordChange || false,
      },
      include: { role: true, branch: true },
    });

    // Assign permissions
    if (permissionIds && permissionIds.length > 0) {
      await prisma.userPermission.createMany({
        data: permissionIds.map(pid => ({
          userId: user.id,
          permissionId: parseInt(pid),
          grantedBy: req.userId,
        })),
        skipDuplicates: true,
      });
    }

    await createAuditLog({
      userId: req.userId,
      action: 'CREATE_USER',
      module: 'Users',
      entityId: user.id,
      entityType: 'User',
      newValues: { fullName, email, roleId },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('role-Admin').emit('user:created', { user: { ...user, password: undefined } });

    const { password: _, ...safeUser } = user;
    return successResponse(res, safeUser, 'User created successfully', 201);
  } catch (err) {
    console.error(err);
    return errorResponse(res, 'Failed to create user', 500);
  }
});

// GET /api/users/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        role: true,
        branch: true,
        permissions: { include: { permission: true } },
      },
    });
    if (!user) return errorResponse(res, 'User not found', 404);
    const { password: _, ...safeUser } = user;
    return successResponse(res, safeUser);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch user', 500);
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, hasPermission('edit_users'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { fullName, email, phoneNumber, roleId, branchId, isActive } = req.body;

    const old = await prisma.user.findUnique({ where: { id: userId } });
    if (!old) return errorResponse(res, 'User not found', 404);

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(fullName && { fullName }),
        ...(email && { email: email.toLowerCase() }),
        ...(phoneNumber && { phoneNumber }),
        ...(roleId && { roleId: parseInt(roleId) }),
        ...(branchId !== undefined && { branchId: branchId ? parseInt(branchId) : null }),
        ...(isActive !== undefined && { isActive }),
      },
      include: { role: true, branch: true },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'EDIT_USER',
      module: 'Users',
      entityId: userId,
      entityType: 'User',
      oldValues: { fullName: old.fullName, email: old.email },
      newValues: { fullName: user.fullName, email: user.email },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('role-Admin').emit('user:updated', { userId });

    const { password: _, ...safeUser } = user;
    return successResponse(res, safeUser, 'User updated successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to update user', 500);
  }
});

// PUT /api/users/:id/permissions
router.put('/:id/permissions', authenticate, hasPermission('manage_permissions'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { permissionIds } = req.body;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorResponse(res, 'User not found', 404);

    const oldPerms = await prisma.userPermission.findMany({
      where: { userId },
      include: { permission: true },
    });

    // Delete all and recreate
    await prisma.userPermission.deleteMany({ where: { userId } });
    if (permissionIds && permissionIds.length > 0) {
      await prisma.userPermission.createMany({
        data: permissionIds.map(pid => ({
          userId,
          permissionId: parseInt(pid),
          grantedBy: req.userId,
        })),
        skipDuplicates: true,
      });
    }

    await createAuditLog({
      userId: req.userId,
      action: 'PERMISSION_CHANGE',
      module: 'Users',
      entityId: userId,
      entityType: 'User',
      oldValues: { permissions: oldPerms.map(p => p.permission.name) },
      newValues: { permissionIds },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to(`user-${userId}`).emit('permissions:updated', { userId });

    return successResponse(res, null, 'Permissions updated successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to update permissions', 500);
  }
});

// POST /api/users/:id/reset-password
router.post('/:id/reset-password', authenticate, hasPermission('edit_users'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { newPassword, forceChange } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return errorResponse(res, 'Password must be at least 8 characters', 400);
    }

    const hashed = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed, forcePasswordChange: forceChange !== false },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'RESET_PASSWORD',
      module: 'Users',
      entityId: userId,
      entityType: 'User',
      ipAddress: req.ip,
    });

    return successResponse(res, null, 'Password reset successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to reset password', 500);
  }
});

// DELETE /api/users/:id/delete (hard delete)
router.delete('/:id/delete', authenticate, hasPermission('delete_users'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.userId) return errorResponse(res, 'Cannot delete your own account', 400);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return errorResponse(res, 'User not found', 404);

    await prisma.userPermission.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });

    await createAuditLog({
      userId: req.userId,
      action: 'DELETE_USER',
      module: 'Users',
      entityId: userId,
      entityType: 'User',
      oldValues: { fullName: user.fullName, email: user.email },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('role-Admin').emit('user:deleted', { userId });

    return successResponse(res, null, 'User deleted successfully');
  } catch (err) {
    if (err.code === 'P2003') {
      return errorResponse(res, 'Cannot delete user with existing records. Deactivate them instead.', 409);
    }
    return errorResponse(res, 'Failed to delete user', 500);
  }
});

// DELETE /api/users/:id (deactivate)
router.delete('/:id', authenticate, hasPermission('deactivate_users'), async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (userId === req.userId) return errorResponse(res, 'Cannot deactivate own account', 400);

    await prisma.user.update({ where: { id: userId }, data: { isActive: false } });

    await createAuditLog({
      userId: req.userId,
      action: 'DEACTIVATE_USER',
      module: 'Users',
      entityId: userId,
      entityType: 'User',
      ipAddress: req.ip,
    });

    // Notify the deactivated user's socket so they get logged out immediately
    if (global.io) global.io.to(`user-${userId}`).emit('user:deactivated', { userId });

    return successResponse(res, null, 'User deactivated successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to deactivate user', 500);
  }
});

module.exports = router;
