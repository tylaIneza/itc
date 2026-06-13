const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { createAuditLog } = require('../utils/audit');
const { successResponse, errorResponse, isWorkingDay, isSaturday, getWorkingDaysInMonth } = require('../utils/helpers');
const { startOfMonth, endOfMonth, startOfYear, endOfYear, format, eachMonthOfInterval, parseISO } = require('date-fns');

// Convert a local Date to UTC midnight date (avoids timezone shift for @db.Date fields)
function toUtcDate(date) {
  const str = format(date, 'yyyy-MM-dd');
  return new Date(`${str}T00:00:00.000Z`);
}

function toDateStr(date) {
  return format(date, 'yyyy-MM-dd');
}

// GET /api/co-opera/config
router.get('/config', authenticate, async (req, res) => {
  try {
    let config = await prisma.coOperaConfig.findFirst();
    if (!config) {
      config = await prisma.coOperaConfig.create({
        data: { targetAmount: 17500, minimumAmount: 17500, startDate: new Date('2026-06-14T00:00:00.000Z') },
      });
    }
    // Normalize Decimal fields to numbers for frontend
    return successResponse(res, {
      ...config,
      targetAmount: parseFloat(config.targetAmount),
      minimumAmount: parseFloat(config.minimumAmount),
      startDate: toDateStr(new Date(config.startDate)),
    });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch co-opera config', 500);
  }
});

// PUT /api/co-opera/config
router.put('/config', authenticate, hasPermission('edit_co_opera_amount'), async (req, res) => {
  try {
    const { targetAmount, reason } = req.body;
    if (!targetAmount || parseFloat(targetAmount) < 17500) {
      return errorResponse(res, 'Target amount must be at least 17,500 FRW', 400);
    }

    const config = await prisma.coOperaConfig.findFirst();
    const oldAmount = config?.targetAmount || 17500;

    const updated = await prisma.coOperaConfig.upsert({
      where: { id: config?.id || 1 },
      update: { targetAmount: parseFloat(targetAmount) },
      create: { targetAmount: parseFloat(targetAmount), minimumAmount: 17500, startDate: new Date('2026-06-14T00:00:00.000Z') },
    });

    await prisma.coOperaAdjustment.create({
      data: {
        oldAmount: parseFloat(oldAmount),
        newAmount: parseFloat(targetAmount),
        reason: reason || 'Amount adjusted',
        adjustedBy: req.userId,
      },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'ADJUST_CO_OPERA_AMOUNT',
      module: 'Co-opera',
      oldValues: { targetAmount: oldAmount },
      newValues: { targetAmount },
      ipAddress: req.ip,
    });

    const normalizedConfig = {
      ...updated,
      targetAmount: parseFloat(updated.targetAmount),
      minimumAmount: parseFloat(updated.minimumAmount),
      startDate: toDateStr(new Date(updated.startDate)),
    };
    if (global.io) global.io.to('all-users').emit('co-opera:config-updated', { config: normalizedConfig });
    return successResponse(res, normalizedConfig, 'Co-opera target updated');
  } catch (err) {
    return errorResponse(res, 'Failed to update co-opera config', 500);
  }
});

// GET /api/co-opera/today
router.get('/today', authenticate, async (req, res) => {
  try {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayUtc = new Date(`${todayStr}T00:00:00.000Z`);

    const [record, config] = await Promise.all([
      prisma.coOpera.findFirst({
        where: { date: todayUtc },
        include: { user: { select: { fullName: true } } },
      }),
      prisma.coOperaConfig.findFirst(),
    ]);

    const isSat = isSaturday(new Date());
    const startDateStr = config?.startDate ? toDateStr(new Date(config.startDate)) : '2026-06-14';
    const notStarted = todayStr < startDateStr;
    const targetAmount = parseFloat(config?.targetAmount || 17500);

    // Normalize record Decimal fields
    const normalizedRecord = record ? {
      ...record,
      amount: parseFloat(record.amount),
      revenueToday: parseFloat(record.revenueToday),
      businessMoney: parseFloat(record.businessMoney),
    } : null;

    return successResponse(res, {
      record: normalizedRecord,
      isSaturday: isSat,
      notStarted,
      startDate: startDateStr,
      targetAmount,
      date: todayStr,
      canRecord: !isSat && !record && !notStarted,
    });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch today co-opera', 500);
  }
});

// POST /api/co-opera/record
router.post('/record', authenticate, hasPermission('record_co_opera'), async (req, res) => {
  try {
    const { amount, revenueToday, date, notes } = req.body;
    const recordDateStr = date ? format(new Date(date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd');
    const recordDateUtc = new Date(`${recordDateStr}T00:00:00.000Z`);

    if (isSaturday(new Date(recordDateStr))) {
      return errorResponse(res, 'Co-opera cannot be recorded on Saturdays because the shop is closed.', 400);
    }

    const config = await prisma.coOperaConfig.findFirst();
    const minAmount = parseFloat(config?.minimumAmount || 17500);
    const startDateStr = config?.startDate ? toDateStr(new Date(config.startDate)) : '2026-06-14';

    if (recordDateStr < startDateStr) {
      return errorResponse(res, `Co-opera recording starts on ${format(new Date(startDateStr), 'MMMM d, yyyy')}`, 400);
    }

    if (!amount || parseFloat(amount) < minAmount) {
      return errorResponse(res, `Co-opera amount must be at least ${minAmount.toLocaleString()} FRW`, 400);
    }

    if (!revenueToday) return errorResponse(res, 'Revenue today is required', 400);

    // Check for existing record on this date
    const existing = await prisma.coOpera.findFirst({ where: { date: recordDateUtc } });
    if (existing) return errorResponse(res, 'Co-opera already recorded for this date', 409);

    const businessMoney = parseFloat(revenueToday) - parseFloat(amount);

    const record = await prisma.coOpera.create({
      data: {
        date: recordDateUtc,
        amount: parseFloat(amount),
        revenueToday: parseFloat(revenueToday),
        businessMoney,
        recordedBy: req.userId,
        notes,
      },
      include: { user: { select: { fullName: true } } },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'RECORD_CO_OPERA',
      module: 'Co-opera',
      entityId: record.id,
      entityType: 'CoOpera',
      newValues: { date: recordDateStr, amount, revenueToday, businessMoney },
      ipAddress: req.ip,
    });

    const normalizedRecord = {
      ...record,
      amount: parseFloat(record.amount),
      revenueToday: parseFloat(record.revenueToday),
      businessMoney: parseFloat(record.businessMoney),
    };

    if (global.io) {
      global.io.to('all-users').emit('co-opera:recorded', { record: normalizedRecord });
      global.io.to('role-Admin').emit('dashboard:refresh', {});
    }

    return successResponse(res, normalizedRecord, 'Co-opera recorded successfully', 201);
  } catch (err) {
    console.error('Co-opera error:', err);
    return errorResponse(res, 'Failed to record co-opera', 500);
  }
});

// GET /api/co-opera/history
router.get('/history', authenticate, hasPermission('view_co_opera_history'), async (req, res) => {
  try {
    const { startDate, endDate, page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const where = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    const [records, total] = await Promise.all([
      prisma.coOpera.findMany({
        where,
        include: { user: { select: { fullName: true } } },
        skip,
        take: parseInt(limit),
        orderBy: { date: 'desc' },
      }),
      prisma.coOpera.count({ where }),
    ]);

    const normalized = records.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      revenueToday: parseFloat(r.revenueToday),
      businessMoney: parseFloat(r.businessMoney),
    }));
    return successResponse(res, { records: normalized, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch co-opera history', 500);
  }
});

// GET /api/co-opera/monthly-summary
router.get('/monthly-summary', authenticate, async (req, res) => {
  try {
    const { year, month } = req.query;
    const now = new Date();
    const nowStr = format(now, 'yyyy-MM-dd');
    const y = parseInt(year || now.getFullYear());
    const m = parseInt(month || (now.getMonth() + 1));

    const monthStartUtc = new Date(`${y}-${String(m).padStart(2, '0')}-01T00:00:00.000Z`);
    const monthEndUtc = new Date(`${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}T23:59:59.999Z`);

    const config = await prisma.coOperaConfig.findFirst();
    const startDateStr = config?.startDate ? toDateStr(new Date(config.startDate)) : '2026-06-14';

    // Working days in month up to today, on or after co-opera start date — string comparison avoids TZ issues
    const workingDays = getWorkingDaysInMonth(y, m)
      .map(d => toDateStr(d))
      .filter(d => d <= nowStr && d >= startDateStr);

    const records = await prisma.coOpera.findMany({
      where: { date: { gte: monthStartUtc, lte: monthEndUtc } },
      include: { user: { select: { fullName: true } } },
      orderBy: { date: 'asc' },
    });

    const normalizedRecords = records.map(r => ({
      ...r,
      amount: parseFloat(r.amount),
      revenueToday: parseFloat(r.revenueToday),
      businessMoney: parseFloat(r.businessMoney),
    }));

    const recordedDays = normalizedRecords.length;
    const expectedDays = workingDays.length;
    const missingDays = Math.max(0, expectedDays - recordedDays);
    const totalCoOpera = normalizedRecords.reduce((sum, r) => sum + r.amount, 0);
    const totalRevenue = normalizedRecords.reduce((sum, r) => sum + r.revenueToday, 0);
    const totalBusinessMoney = normalizedRecords.reduce((sum, r) => sum + r.businessMoney, 0);

    let status;
    if (nowStr < startDateStr) {
      status = 'NOT_STARTED';
    } else if (missingDays === 0 && recordedDays > 0) {
      status = 'COMPLETE';
    } else if (missingDays === 0 && recordedDays === 0) {
      status = 'ON_TRACK'; // No days have passed yet this month since start date
    } else {
      status = 'INCOMPLETE';
    }

    return successResponse(res, {
      year: y,
      month: m,
      expectedDays,
      recordedDays,
      missingDays,
      totalCoOpera,
      totalRevenue,
      totalBusinessMoney,
      records: normalizedRecords,
      startDate: startDateStr,
      status,
    });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch monthly summary', 500);
  }
});

// GET /api/co-opera/yearly-summary
router.get('/yearly-summary', authenticate, async (req, res) => {
  try {
    const year = parseInt(req.query.year || new Date().getFullYear());
    const months = [];

    for (let m = 1; m <= 12; m++) {
      const start = new Date(year, m - 1, 1);
      const end = new Date(year, m, 0, 23, 59, 59);
      const result = await prisma.coOpera.aggregate({
        where: { date: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: { id: true },
      });
      months.push({
        month: m,
        monthName: format(start, 'MMMM'),
        totalCoOpera: parseFloat(result._sum.amount || 0),
        recordedDays: result._count.id,
      });
    }

    const annualTotal = months.reduce((sum, m) => sum + m.totalCoOpera, 0);
    return successResponse(res, { year, months, annualTotal });
  } catch (err) {
    return errorResponse(res, 'Failed to fetch yearly summary', 500);
  }
});

// GET /api/co-opera/adjustments
router.get('/adjustments', authenticate, hasPermission('view_co_opera_history'), async (req, res) => {
  try {
    const adjustments = await prisma.coOperaAdjustment.findMany({
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return successResponse(res, adjustments);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch adjustments', 500);
  }
});

// PUT /api/co-opera/:id - fix record (admin only)
router.put('/:id', authenticate, hasPermission('fix_co_opera_records'), async (req, res) => {
  try {
    const recordId = parseInt(req.params.id);
    const { amount, revenueToday, notes, isExcused } = req.body;

    const old = await prisma.coOpera.findUnique({ where: { id: recordId } });
    if (!old) return errorResponse(res, 'Record not found', 404);

    const businessMoney = revenueToday ? parseFloat(revenueToday) - parseFloat(amount || old.amount) : old.businessMoney;

    const record = await prisma.coOpera.update({
      where: { id: recordId },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(revenueToday && { revenueToday: parseFloat(revenueToday), businessMoney }),
        ...(notes !== undefined && { notes }),
        ...(isExcused !== undefined && { isExcused }),
      },
      include: { user: { select: { fullName: true } } },
    });

    await createAuditLog({
      userId: req.userId,
      action: 'FIX_CO_OPERA_RECORD',
      module: 'Co-opera',
      entityId: recordId,
      oldValues: { amount: old.amount, revenueToday: old.revenueToday },
      newValues: { amount: record.amount, revenueToday: record.revenueToday },
      ipAddress: req.ip,
    });

    const normalizedRecord = {
      ...record,
      amount: parseFloat(record.amount),
      revenueToday: parseFloat(record.revenueToday),
      businessMoney: parseFloat(record.businessMoney),
    };
    if (global.io) global.io.to('all-users').emit('co-opera:updated', { record: normalizedRecord });
    return successResponse(res, normalizedRecord, 'Co-opera record updated');
  } catch (err) {
    return errorResponse(res, 'Failed to update co-opera record', 500);
  }
});

module.exports = router;
