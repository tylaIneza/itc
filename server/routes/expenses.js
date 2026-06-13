const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { createAuditLog } = require('../utils/audit');
const { successResponse, errorResponse } = require('../utils/helpers');

// GET /api/expenses
router.get('/', authenticate, async (req, res) => {
  try {
    const { startDate, endDate, categoryId, userId, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (categoryId) where.categoryId = parseInt(categoryId);
    if (userId) where.userId = parseInt(userId);
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          category: true,
          user: { select: { fullName: true, id: true } },
          editRequests: {
            where: { status: 'PENDING' },
            include: { requester: { select: { fullName: true } } },
          },
        },
        skip,
        take: parseInt(limit),
        orderBy: { createdAt: 'desc' },
      }),
      prisma.expense.count({ where }),
    ]);

    return successResponse(res, { expenses, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch expenses', 500);
  }
});

// GET /api/expenses/summary
router.get('/summary', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = { status: 'APPROVED' };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }
    const result = await prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { id: true } });
    return successResponse(res, { total: result._sum.amount || 0, count: result._count.id });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch expense summary', 500);
  }
});

// POST /api/expenses
router.post('/', authenticate, hasPermission('create_expense'), async (req, res) => {
  try {
    const { categoryId, amount, description, date } = req.body;
    if (!categoryId || !amount || !description || !date) {
      return errorResponse(res, 'Missing required fields', 400);
    }

    const expense = await prisma.expense.create({
      data: {
        categoryId: parseInt(categoryId),
        userId: req.userId,
        amount: parseFloat(amount),
        description,
        date: new Date(date),
        status: 'APPROVED',
      },
      include: { category: true, user: { select: { fullName: true } } },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'CREATE_EXPENSE',
      module: 'Expenses',
      entityId: expense.id,
      entityType: 'Expense',
      newValues: { amount, description, date },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('role-Admin').emit('expense:created', { expense });
    return successResponse(res, expense, 'Expense created', 201);
  } catch (err) {
    return errorResponse(res, 'Failed to create expense', 500);
  }
});

// PUT /api/expenses/:id
router.put('/:id', authenticate, hasPermission('edit_expense'), async (req, res) => {
  try {
    const expenseId = parseInt(req.params.id);
    const { categoryId, amount, description, date } = req.body;
    const old = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!old) return errorResponse(res, 'Expense not found', 404);

    const expense = await prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...(categoryId && { categoryId: parseInt(categoryId) }),
        ...(amount && { amount: parseFloat(amount) }),
        ...(description && { description }),
        ...(date && { date: new Date(date) }),
      },
      include: { category: true, user: { select: { fullName: true } } },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'EDIT_EXPENSE',
      module: 'Expenses',
      entityId: expenseId,
      entityType: 'Expense',
      oldValues: { amount: old.amount, description: old.description },
      newValues: { amount: expense.amount, description: expense.description },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('role-Admin').emit('expense:updated', { expense });
    return successResponse(res, expense, 'Expense updated');
  } catch (err) {
    return errorResponse(res, 'Failed to update expense', 500);
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', authenticate, hasPermission('delete_expense'), async (req, res) => {
  try {
    const expenseId = parseInt(req.params.id);
    const old = await prisma.expense.findUnique({ where: { id: expenseId } });
    if (!old) return errorResponse(res, 'Expense not found', 404);

    await prisma.expense.delete({ where: { id: expenseId } });

    await createAuditLog({
      userId: req.userId,
      action: 'DELETE_EXPENSE',
      module: 'Expenses',
      entityId: expenseId,
      entityType: 'Expense',
      oldValues: { amount: old.amount, description: old.description },
      ipAddress: req.ip,
    });

    if (global.io) global.io.to('role-Admin').emit('expense:deleted', { expenseId });
    return successResponse(res, null, 'Expense deleted');
  } catch (err) {
    return errorResponse(res, 'Failed to delete expense', 500);
  }
});

// POST /api/expenses/:id/request-edit
router.post('/:id/request-edit', authenticate, async (req, res) => {
  try {
    const expenseId = parseInt(req.params.id);
    const { newAmount, newDescription, reason } = req.body;
    if (!reason) return errorResponse(res, 'Reason is required', 400);

    const request = await prisma.expenseEditRequest.create({
      data: {
        expenseId,
        requestedBy: req.userId,
        newAmount: parseFloat(newAmount),
        newDescription,
        reason,
        status: 'PENDING',
      },
      include: { expense: true, requester: { select: { fullName: true } } },
    });

    if (global.io) global.io.to('role-Admin').emit('expense:edit-requested', { request });
    return successResponse(res, request, 'Edit request submitted', 201);
  } catch (err) {
    return errorResponse(res, 'Failed to submit edit request', 500);
  }
});

// PUT /api/expenses/requests/:id
router.put('/requests/:id', authenticate, hasPermission('approve_expense_requests'), async (req, res) => {
  try {
    const requestId = parseInt(req.params.id);
    const { status } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status)) return errorResponse(res, 'Invalid status', 400);

    const request = await prisma.expenseEditRequest.update({
      where: { id: requestId },
      data: { status, reviewedBy: req.userId, reviewedAt: new Date() },
      include: { expense: true },
    });

    if (status === 'APPROVED') {
      await prisma.expense.update({
        where: { id: request.expenseId },
        data: {
          ...(request.newAmount && { amount: request.newAmount }),
          ...(request.newDescription && { description: request.newDescription }),
        },
      });
    }

    await createAuditLog({
      userId: req.userId,
      action: `${status}_EXPENSE_REQUEST`,
      module: 'Expenses',
      entityId: request.expenseId,
      entityType: 'Expense',
      ipAddress: req.ip,
    });

    return successResponse(res, request, `Request ${status.toLowerCase()}`);
  } catch (err) {
    return errorResponse(res, 'Failed to process request', 500);
  }
});

// GET /api/expenses/requests
router.get('/requests/pending', authenticate, hasPermission('approve_expense_requests'), async (req, res) => {
  try {
    const requests = await prisma.expenseEditRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        expense: { include: { category: true } },
        requester: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return successResponse(res, requests);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch requests', 500);
  }
});

module.exports = router;
