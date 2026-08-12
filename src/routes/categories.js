const router = require('express').Router();
const { authenticate, requireAdmin, requireCompanyScope } = require('../middleware/auth');
const prisma = require('../lib/prisma');

router.use(authenticate, requireCompanyScope);

router.get('/', async (req, res) => {
  const categories = await prisma.expenseCategory.findMany({ orderBy: { name: 'asc' } });
  res.json({ categories });
});

router.post('/', requireAdmin, async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const category = await prisma.expenseCategory.create({
      data: { name, description: description || null },
    });
    res.status(201).json({ id: category.id, name: category.name });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Category exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
