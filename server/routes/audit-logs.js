const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

router.get('/', authenticate, hasPermission('view_audit_logs'), async (req, res) => {
  try {
    const { userId, module, action, startDate, endDate, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (userId) where.userId = parseInt(userId);
    if (module) where.module = { contains: module };
    if (action) where.action = { contains: action };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { fullName: true, email: true } } },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return successResponse(res, { logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch audit logs', 500);
  }
});

module.exports = router;
