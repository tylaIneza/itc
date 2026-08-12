const prisma = require('../lib/prisma');
const { auditLog } = require('../middleware/audit');

const canApprove = (user) =>
  user.role === 'admin' || user.permissions?.includes('can_approve_expenses');

// ── EXPENSES ─────────────────────────────────────────────────────────────────

exports.getAll = async (req, res) => {
  try {
    const { category_id, start_date, end_date, page = 1, limit = 20 } = req.query;
    const branchId = req.user.effective_branch_id;
    const where = {};

    if (branchId !== null) where.branch_id = branchId;
    if (req.user.role === 'seller') where.created_by = req.user.id;
    if (category_id) where.category_id  = parseInt(category_id);
    if (start_date)  where.expense_date = { ...where.expense_date, gte: new Date(start_date) };
    if (end_date)    where.expense_date = { ...where.expense_date, lte: new Date(end_date) };

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [expenses, total, aggregate] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          category: true,
          creator:  { select: { name: true } },
          edit_requests: {
            where: { status: 'pending' },
            select: { id: true },
          },
        },
        orderBy: [{ expense_date: 'desc' }, { created_at: 'desc' }],
        skip,
        take,
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({ where, _sum: { amount: true } }),
    ]);

    res.json({
      expenses: expenses.map(e => ({
        ...e,
        category_name:    e.category.name,
        category_color:   e.category.color,
        created_by_name:  e.creator.name,
        pending_requests: e.edit_requests.length,
        category:         undefined,
        creator:          undefined,
        edit_requests:    undefined,
      })),
      total,
      total_amount: Number(aggregate._sum.amount) || 0,
      page:         parseInt(page),
      limit:        take,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const expense = await prisma.expense.findUnique({
      where:   { id: parseInt(req.params.id) },
      include: { category: true, creator: { select: { name: true } } },
    });
    if (!expense) return res.status(404).json({ error: 'Expense not found' });

    const editRequests = await prisma.expenseEditRequest.findMany({
      where:   { expense_id: expense.id },
      include: {
        requester: { select: { name: true } },
        reviewer:  { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
    });

    res.json({
      expense: {
        ...expense,
        category_name:   expense.category.name,
        created_by_name: expense.creator.name,
        category:        undefined,
        creator:         undefined,
      },
      edit_requests: editRequests.map(er => ({
        ...er,
        requested_by_name: er.requester.name,
        reviewed_by_name:  er.reviewer?.name || null,
        requester:         undefined,
        reviewer:          undefined,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.create = async (req, res) => {
  const { title, amount, category_id, expense_date, description } = req.body;
  if (!title || !amount || !category_id || !expense_date)
    return res.status(400).json({ error: 'Title, amount, category, and date are required' });

  const branchId = req.user.effective_branch_id;
  if (branchId === null) {
    return res.status(400).json({ error: 'Select a branch before recording an expense' });
  }

  try {
    const expense = await prisma.expense.create({
      data: {
        title,
        amount:       parseFloat(amount),
        category_id:  parseInt(category_id),
        branch_id:    branchId,
        expense_date: new Date(expense_date),
        description:  description || null,
        created_by:   req.user.id,
      },
    });
    await auditLog({
      userId: req.user.id, userName: req.user.name, branchId,
      action: 'CREATE_EXPENSE', module: 'EXPENSES', entityType: 'expense', entityId: expense.id,
      description: `Expense created: ${title} — ${amount}`,
      newValues: { title, amount, category_id, expense_date },
    });
    res.status(201).json({ message: 'Expense recorded', id: expense.id });
  } catch (err) {
    console.error('[Expense create error]', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
};

exports.update = async (req, res) => {
  const { title, amount, category_id, expense_date, description } = req.body;
  const id = parseInt(req.params.id);

  try {
    const old = await prisma.expense.findUnique({ where: { id } });
    if (!old) return res.status(404).json({ error: 'Expense not found' });

    if (canApprove(req.user)) {
      await prisma.expense.update({
        where: { id },
        data: {
          title:        title        ?? old.title,
          amount:       amount       != null ? parseFloat(amount) : old.amount,
          category_id:  category_id  != null ? parseInt(category_id) : old.category_id,
          expense_date: expense_date != null ? new Date(expense_date) : old.expense_date,
          description:  description  ?? old.description,
        },
      });
      await auditLog({
        userId: req.user.id, userName: req.user.name, branchId: old.branch_id,
        action: 'UPDATE_EXPENSE', module: 'EXPENSES', entityType: 'expense', entityId: id,
        description: `Direct edit by ${req.user.role}: ${old.title}`,
        oldValues: old, newValues: req.body,
      });
      return res.json({ message: 'Expense updated', requires_approval: false });
    }

    const proposed = {
      title:        title        ?? old.title,
      amount:       amount       ?? old.amount,
      category_id:  category_id  ?? old.category_id,
      expense_date: expense_date ?? old.expense_date,
      description:  description  ?? old.description,
    };

    await prisma.expenseEditRequest.updateMany({
      where:  { expense_id: id, requested_by: req.user.id, status: 'pending' },
      data:   { status: 'rejected', review_note: 'Superseded by new request' },
    });

    const request = await prisma.expenseEditRequest.create({
      data: { expense_id: id, requested_by: req.user.id, proposed },
    });

    await auditLog({
      userId: req.user.id, userName: req.user.name, branchId: old.branch_id,
      action: 'REQUEST_EXPENSE_EDIT', module: 'EXPENSES', entityType: 'expense', entityId: id,
      description: `Edit request submitted for: ${old.title}`,
      newValues: proposed,
    });

    res.json({
      message:          'Edit request submitted and awaiting approval',
      requires_approval: true,
      request_id:       request.id,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.remove = async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const old = await prisma.expense.findUnique({ where: { id }, select: { title: true, branch_id: true } });
    if (!old) return res.status(404).json({ error: 'Expense not found' });
    await prisma.expense.delete({ where: { id } });
    await auditLog({
      userId: req.user.id, userName: req.user.name, branchId: old.branch_id,
      action: 'DELETE_EXPENSE', module: 'EXPENSES', entityType: 'expense', entityId: id,
      description: `Deleted expense: ${old.title}`,
    });
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getCategories = async (req, res) => {
  const categories = await prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
  res.json({ categories });
};

// ── APPROVAL REQUESTS ─────────────────────────────────────────────────────────

exports.getApprovalRequests = async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 30 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);
    const branchId = req.user.effective_branch_id;

    const where = {
      status,
      ...(branchId !== null ? { expense: { branch_id: branchId } } : {}),
    };

    const [requests, total] = await Promise.all([
      prisma.expenseEditRequest.findMany({
        where,
        include: {
          expense:   { include: { category: true } },
          requester: { select: { name: true } },
          reviewer:  { select: { name: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      prisma.expenseEditRequest.count({ where }),
    ]);

    res.json({
      requests: requests.map(r => ({
        ...r,
        expense_title:          r.expense.title,
        expense_current_amount: Number(r.expense.amount),
        category_name:          r.expense.category.name,
        requested_by_name:      r.requester.name,
        reviewed_by_name:       r.reviewer?.name || null,
        expense:   undefined,
        requester: undefined,
        reviewer:  undefined,
      })),
      total,
      page: parseInt(page),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.reviewRequest = async (req, res) => {
  const id = parseInt(req.params.id);
  const { action, review_note } = req.body;

  if (!['approve', 'reject'].includes(action))
    return res.status(400).json({ error: 'action must be approve or reject' });

  try {
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    const request = await prisma.$transaction(async (tx) => {
      const req_ = await tx.expenseEditRequest.findUnique({
        where:   { id },
        include: { expense: true },
      });
      if (!req_)                  throw Object.assign(new Error('Request not found'),       { status: 404 });
      if (req_.status !== 'pending') throw Object.assign(new Error('Request already reviewed'), { status: 400 });

      await tx.expenseEditRequest.update({
        where: { id },
        data:  { status: newStatus, reviewed_by: req.user.id, review_note: review_note || null, reviewed_at: new Date() },
      });

      if (action === 'approve') {
        const p = req_.proposed;
        await tx.expense.update({
          where: { id: req_.expense_id },
          data: {
            title:        p.title,
            amount:       parseFloat(p.amount),
            category_id:  parseInt(p.category_id),
            expense_date: new Date(p.expense_date),
            description:  p.description || null,
          },
        });
      }

      return req_;
    });

    await auditLog({
      userId: req.user.id, userName: req.user.name,
      action: action === 'approve' ? 'APPROVE_EXPENSE_EDIT' : 'REJECT_EXPENSE_EDIT',
      module: 'EXPENSES', entityType: 'expense_edit_request', entityId: id,
      description: `${action === 'approve' ? 'Approved' : 'Rejected'} edit for: ${request.expense.title}`,
    });

    res.json({ message: `Request ${newStatus}` });
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message || 'Server error' });
  }
};

exports.getMyRequests = async (req, res) => {
  try {
    const requests = await prisma.expenseEditRequest.findMany({
      where:   { requested_by: req.user.id },
      include: {
        expense:  { include: { category: true } },
        reviewer: { select: { name: true } },
      },
      orderBy: { created_at: 'desc' },
      take:    50,
    });

    res.json({
      requests: requests.map(r => ({
        ...r,
        expense_title:     r.expense.title,
        category_name:     r.expense.category.name,
        reviewed_by_name:  r.reviewer?.name || null,
        expense:  undefined,
        reviewer: undefined,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};
