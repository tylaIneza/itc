const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

// GET /api/reports/sales
router.get('/sales', authenticate, hasPermission('view_reports'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = {};
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59');
    }

    const sales = await prisma.sale.findMany({
      where,
      include: {
        user: { select: { fullName: true } },
        items: { include: { product: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const summary = await prisma.sale.aggregate({ where, _sum: { totalAmount: true }, _count: { id: true } });
    return successResponse(res, { sales, summary: { total: summary._sum.totalAmount || 0, count: summary._count.id } });
  } catch (err) {
    return errorResponse(res, 'Failed to generate sales report', 500);
  }
});

// GET /api/reports/expenses
router.get('/expenses', authenticate, hasPermission('view_reports'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        category: true,
        user: { select: { fullName: true } },
      },
      orderBy: { date: 'desc' },
    });

    const summary = await prisma.expense.aggregate({ where, _sum: { amount: true }, _count: { id: true } });
    return successResponse(res, { expenses, summary: { total: summary._sum.amount || 0, count: summary._count.id } });
  } catch (err) {
    return errorResponse(res, 'Failed to generate expense report', 500);
  }
});

// GET /api/reports/co-opera
router.get('/co-opera', authenticate, hasPermission('view_reports'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const where = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const records = await prisma.coOpera.findMany({
      where,
      include: { user: { select: { fullName: true } } },
      orderBy: { date: 'desc' },
    });

    const summary = await prisma.coOpera.aggregate({
      where,
      _sum: { amount: true, revenueToday: true, businessMoney: true },
      _count: { id: true },
    });

    return successResponse(res, {
      records,
      summary: {
        totalCoOpera: parseFloat(summary._sum.amount || 0),
        totalRevenue: parseFloat(summary._sum.revenueToday || 0),
        totalBusinessMoney: parseFloat(summary._sum.businessMoney || 0),
        recordedDays: summary._count.id,
      },
    });
  } catch (err) {
    return errorResponse(res, 'Failed to generate co-opera report', 500);
  }
});

// GET /api/reports/profit
router.get('/profit', authenticate, hasPermission('view_reports'), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateSalesWhere = {}, dateExpWhere = {}, dateCoOperaWhere = {};
    if (startDate || endDate) {
      if (startDate) {
        dateSalesWhere.gte = new Date(startDate);
        dateExpWhere.gte = new Date(startDate);
        dateCoOperaWhere.gte = new Date(startDate);
      }
      if (endDate) {
        dateSalesWhere.lte = new Date(endDate + 'T23:59:59');
        dateExpWhere.lte = new Date(endDate);
        dateCoOperaWhere.lte = new Date(endDate);
      }
    }

    const [salesAgg, expenseAgg, coOperaAgg, capitalAgg] = await Promise.all([
      prisma.sale.aggregate({ where: Object.keys(dateSalesWhere).length ? { createdAt: dateSalesWhere } : {}, _sum: { totalAmount: true } }),
      prisma.expense.aggregate({ where: Object.keys(dateExpWhere).length ? { date: dateExpWhere } : {}, _sum: { amount: true } }),
      prisma.coOpera.aggregate({ where: Object.keys(dateCoOperaWhere).length ? { date: dateCoOperaWhere } : {}, _sum: { amount: true, businessMoney: true } }),
      prisma.capitalInjection.aggregate({ _sum: { amount: true } }),
    ]);

    const revenue = parseFloat(salesAgg._sum.totalAmount || 0);
    const expenses = parseFloat(expenseAgg._sum.amount || 0);
    const coOpera = parseFloat(coOperaAgg._sum.amount || 0);
    const businessMoney = parseFloat(coOperaAgg._sum.businessMoney || 0);
    const totalCapital = parseFloat(capitalAgg._sum.amount || 0);
    const grossProfit = revenue - expenses;
    const netProfit = grossProfit - coOpera;

    return successResponse(res, {
      revenue,
      expenses,
      coOpera,
      businessMoney,
      grossProfit,
      netProfit,
      totalCapital,
      profitMargin: revenue > 0 ? ((netProfit / revenue) * 100).toFixed(2) : 0,
    });
  } catch (err) {
    return errorResponse(res, 'Failed to generate profit report', 500);
  }
});

module.exports = router;
