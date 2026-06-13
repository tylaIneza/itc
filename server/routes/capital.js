const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { createAuditLog } = require('../utils/audit');
const { successResponse, errorResponse } = require('../utils/helpers');

router.get('/', authenticate, hasPermission('add_capital_injection'), async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [injections, total] = await Promise.all([
      prisma.capitalInjection.findMany({
        include: { user: { select: { fullName: true } } },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.capitalInjection.count(),
    ]);

    const summary = await prisma.capitalInjection.aggregate({ _sum: { amount: true } });
    return successResponse(res, { injections, total, totalAmount: summary._sum.amount || 0 });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch capital injections', 500);
  }
});

router.post('/', authenticate, hasPermission('add_capital_injection'), async (req, res) => {
  try {
    const { amount, description, date } = req.body;
    if (!amount || !description || !date) return errorResponse(res, 'Missing required fields', 400);

    const injection = await prisma.capitalInjection.create({
      data: {
        amount: parseFloat(amount),
        description,
        date: new Date(date),
        addedBy: req.userId,
      },
      include: { user: { select: { fullName: true } } },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'ADD_CAPITAL_INJECTION',
      module: 'Capital',
      entityId: injection.id,
      newValues: { amount, description },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('role-Admin').emit('capital:added', { injection });
    return successResponse(res, injection, 'Capital injection recorded', 201);
  } catch (err) {
    return errorResponse(res, 'Failed to add capital injection', 500);
  }
});

module.exports = router;
