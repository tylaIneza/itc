const express = require('express');
const router = express.Router();
const prisma = require('../utils/prisma');
const { authenticate, hasPermission } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/helpers');

router.get('/', authenticate, async (req, res) => {
  try {
    const categories = await prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    return successResponse(res, categories);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch categories', 500);
  }
});

router.post('/', authenticate, hasPermission('create_product'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return errorResponse(res, 'Name is required', 400);
    const category = await prisma.category.create({ data: { name, description } });
    return successResponse(res, category, 'Category created', 201);
  } catch (err) {
    if (err.code === 'P2002') return errorResponse(res, 'Category already exists', 409);
    return errorResponse(res, 'Failed to create category', 500);
  }
});

router.put('/:id', authenticate, hasPermission('edit_product'), async (req, res) => {
  try {
    const { name, description, isActive } = req.body;
    const category = await prisma.category.update({
      where: { id: parseInt(req.params.id) },
      data: { ...(name && { name }), ...(description !== undefined && { description }), ...(isActive !== undefined && { isActive }) },
    });
    return successResponse(res, category, 'Category updated');
  } catch (err) {
    return errorResponse(res, 'Failed to update category', 500);
  }
});

// Expense categories
router.get('/expense', authenticate, async (req, res) => {
  try {
    const categories = await prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    return successResponse(res, categories);
  } catch (err) {
    return errorResponse(res, 'Failed to fetch expense categories', 500);
  }
});

router.post('/expense', authenticate, hasPermission('create_expense'), async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return errorResponse(res, 'Name is required', 400);
    const category = await prisma.expenseCategory.create({ data: { name, description } });
    return successResponse(res, category, 'Expense category created', 201);
  } catch (err) {
    if (err.code === 'P2002') return errorResponse(res, 'Category already exists', 409);
    return errorResponse(res, 'Failed to create expense category', 500);
  }
});

module.exports = router;
