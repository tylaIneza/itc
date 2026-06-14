const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');
const { format, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } = require('date-fns');

// GET /api/dashboard/overview
router.get('/overview', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const roleName = req.user.role.name;
    const isAdminOrManager = roleName === 'Admin' || roleName === 'Manager';
    const userSaleFilter = isAdminOrManager ? {} : { userId: req.userId };

    const [todaySales, weekSales, monthSales, todayExpenses, coOperaToday, totalCapital, lowStockCount, allTimeRevenue, allTimeExpenses, allTimeCoOpera] = await Promise.all([
      prisma.sale.aggregate({ where: { ...userSaleFilter, createdAt: { gte: todayStart, lte: todayEnd } }, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.sale.aggregate({ where: { ...userSaleFilter, createdAt: { gte: weekStart, lte: todayEnd } }, _sum: { totalAmount: true } }),
      prisma.sale.aggregate({ where: { ...userSaleFilter, createdAt: { gte: monthStart, lte: todayEnd } }, _sum: { totalAmount: true } }),
      prisma.expense.aggregate({ where: { date: { gte: todayStart, lte: todayEnd }, status: 'APPROVED' }, _sum: { amount: true } }),
      prisma.coOpera.findFirst({ where: { date: todayStart } }),
      prisma.capitalInjection.aggregate({ _sum: { amount: true } }),
      prisma.product.count({ where: { isActive: true, quantity: { lte: 5 } } }),
      prisma.sale.aggregate({ where: userSaleFilter, _sum: { totalAmount: true } }),
      prisma.expense.aggregate({ where: { status: 'APPROVED' }, _sum: { amount: true } }),
      prisma.coOpera.aggregate({ _sum: { amount: true } }),
    ]);

    const revenueToday = parseFloat(todaySales._sum.totalAmount || 0);
    const expensesToday = parseFloat(todayExpenses._sum.amount || 0);
    const coOperaAmount = coOperaToday ? parseFloat(coOperaToday.amount) : 0;
    const businessMoney = coOperaToday ? parseFloat(coOperaToday.businessMoney) : revenueToday - expensesToday;
    const netProfit = revenueToday - expensesToday - coOperaAmount;

    const capital = parseFloat(totalCapital._sum.amount || 0);
    const totalRevenue = parseFloat(allTimeRevenue._sum.totalAmount || 0);
    const totalExpenses = parseFloat(allTimeExpenses._sum.amount || 0);
    const totalCoOpera = parseFloat(allTimeCoOpera._sum.amount || 0);
    const totalBusinessBalance = capital + totalRevenue - totalExpenses - totalCoOpera;

    return successResponse(res, {
      today: {
        revenue: revenueToday,
        salesCount: todaySales._count.id,
        expenses: expensesToday,
        coOpera: coOperaAmount,
        businessMoney,
        netProfit,
      },
      week: { revenue: parseFloat(weekSales._sum.totalAmount || 0) },
      month: { revenue: parseFloat(monthSales._sum.totalAmount || 0) },
      totalCapital: capital,
      totalBusinessBalance,
      lowStockCount,
      coOperaToday,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return errorResponse(res, 'Failed to fetch dashboard data', 500);
  }
});

// GET /api/dashboard/revenue-chart
router.get('/revenue-chart', authenticate, async (req, res) => {
  try {
    const days = parseInt(req.query.days || '7');
    const data = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayStart = startOfDay(date);
      const dayEnd = endOfDay(date);

      const result = await prisma.sale.aggregate({
        where: { createdAt: { gte: dayStart, lte: dayEnd } },
        _sum: { totalAmount: true },
        _count: { id: true },
      });

      data.push({
        date: format(date, 'MMM dd'),
        revenue: parseFloat(result._sum.totalAmount || 0),
        sales: result._count.id,
      });
    }

    return successResponse(res, data);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch revenue chart', 500);
  }
});

// GET /api/dashboard/top-products
router.get('/top-products', authenticate, async (req, res) => {
  try {
    const { limit = 5, days = 30 } = req.query;
    const startDate = subDays(new Date(), parseInt(days));

    const topProducts = await prisma.saleItem.groupBy({
      by: ['productId'],
      where: { sale: { createdAt: { gte: startDate } } },
      _sum: { quantity: true, totalPrice: true },
      orderBy: { _sum: { totalPrice: 'desc' } },
      take: parseInt(limit),
    });

    const enriched = await Promise.all(topProducts.map(async (item) => {
      const product = await prisma.product.findUnique({
        where: { id: item.productId },
        select: { name: true, category: { select: { name: true } } },
      });
      return {
        productId: item.productId,
        name: product?.name || 'Unknown',
        category: product?.category?.name || '',
        quantity: item._sum.quantity,
        revenue: parseFloat(item._sum.totalPrice || 0),
      };
    }));

    return successResponse(res, enriched);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch top products', 500);
  }
});

// GET /api/dashboard/user-analytics
// Admin/Manager: returns analytics for every active user
// Other roles: returns analytics for themselves only
router.get('/user-analytics', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const monthStart = startOfMonth(now);

    const roleName = req.user.role.name;
    const isAdminOrManager = roleName === 'Admin' || roleName === 'Manager';

    // Determine which users to include
    const users = isAdminOrManager
      ? await prisma.user.findMany({ where: { isActive: true }, select: { id: true, fullName: true, role: { select: { name: true } } }, orderBy: { fullName: 'asc' } })
      : [{ id: req.userId, fullName: req.user.fullName, role: req.user.role }];

    // Aggregate sales for all three periods in one query each
    const [salesToday, salesWeek, salesMonth, expToday, expWeek, expMonth] = await Promise.all([
      prisma.sale.groupBy({ by: ['userId'], where: { createdAt: { gte: todayStart, lte: todayEnd } }, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.sale.groupBy({ by: ['userId'], where: { createdAt: { gte: weekStart, lte: todayEnd } }, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.sale.groupBy({ by: ['userId'], where: { createdAt: { gte: monthStart, lte: todayEnd } }, _sum: { totalAmount: true }, _count: { id: true } }),
      prisma.expense.groupBy({ by: ['userId'], where: { date: { gte: todayStart, lte: todayEnd }, status: 'APPROVED' }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['userId'], where: { date: { gte: weekStart, lte: todayEnd }, status: 'APPROVED' }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['userId'], where: { date: { gte: monthStart, lte: todayEnd }, status: 'APPROVED' }, _sum: { amount: true } }),
    ]);

    const pick = (rows, userId) => rows.find(r => r.userId === userId);

    const result = users.map(u => ({
      userId: u.id,
      fullName: u.fullName,
      role: u.role?.name || '',
      daily: {
        revenue: parseFloat(pick(salesToday, u.id)?._sum.totalAmount || 0),
        salesCount: pick(salesToday, u.id)?._count.id || 0,
        expenses: parseFloat(pick(expToday, u.id)?._sum.amount || 0),
      },
      weekly: {
        revenue: parseFloat(pick(salesWeek, u.id)?._sum.totalAmount || 0),
        salesCount: pick(salesWeek, u.id)?._count.id || 0,
        expenses: parseFloat(pick(expWeek, u.id)?._sum.amount || 0),
      },
      monthly: {
        revenue: parseFloat(pick(salesMonth, u.id)?._sum.totalAmount || 0),
        salesCount: pick(salesMonth, u.id)?._count.id || 0,
        expenses: parseFloat(pick(expMonth, u.id)?._sum.amount || 0),
      },
    }));

    return successResponse(res, result);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch user analytics', 500);
  }
});

// GET /api/dashboard/recent-transactions
router.get('/recent-transactions', authenticate, async (req, res) => {
  try {
    const sales = await prisma.sale.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { fullName: true } },
        items: { include: { product: { select: { name: true } } } },
      },
    });
    return successResponse(res, sales);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch recent transactions', 500);
  }
});

module.exports = router;
