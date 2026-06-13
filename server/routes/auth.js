const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { createAuditLog } = require('../utils/audit');
const { successResponse, errorResponse } = require('../utils/helpers');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password) {
      return errorResponse(res, 'Email/phone and password are required', 400);
    }

    // Find by email OR phone
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: identifier.toLowerCase().trim() },
          { phoneNumber: identifier.trim() },
        ],
      },
      include: {
        role: true,
        branch: true,
        permissions: { include: { permission: true } },
      },
    });

    if (!user) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    if (!user.isActive) {
      return errorResponse(res, 'Account is deactivated. Contact admin.', 403);
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return errorResponse(res, 'Invalid credentials', 401);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    const token = jwt.sign(
      { userId: user.id, roleId: user.roleId },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    await createAuditLog({
      userId: user.id,
      action: 'LOGIN',
      module: 'Auth',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const { password: _, ...userWithoutPassword } = user;
    return successResponse(res, {
      token,
      user: userWithoutPassword,
      forcePasswordChange: user.forcePasswordChange,
    }, 'Login successful');
  } catch (err) {
    console.error('Login error:', err);
    return errorResponse(res, 'Login failed', 500);
  }
});

// POST /api/auth/logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    await createAuditLog({
      userId: req.userId,
      action: 'LOGOUT',
      module: 'Auth',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });
    return successResponse(res, null, 'Logged out successfully');
  } catch (err) {
    return errorResponse(res, 'Logout failed', 500);
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const { password: _, ...user } = req.user;
    return successResponse(res, user);
  } catch (err) {
    return errorResponse(res, 'Failed to get user', 500);
  }
});

// POST /api/auth/change-password
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return errorResponse(res, 'Current and new password required', 400);
    }
    if (newPassword.length < 8) {
      return errorResponse(res, 'Password must be at least 8 characters', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return errorResponse(res, 'Current password is incorrect', 400);
    }

    const hashed = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    await prisma.user.update({
      where: { id: req.userId },
      data: { password: hashed, forcePasswordChange: false },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'CHANGE_PASSWORD',
      module: 'Auth',
      ipAddress: req.ip,
    });

    return successResponse(res, null, 'Password changed successfully');
  } catch (err) {
    return errorResponse(res, 'Failed to change password', 500);
  }
});

module.exports = router;
