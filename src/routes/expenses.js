const router = require('express').Router();
const { authenticate, requirePermission, requireCompanyScope } = require('../middleware/auth');
const ctrl = require('../controllers/expenseController');

const canApprove = (req, res, next) => {
  if (req.user.role === 'admin' || req.user.permissions?.includes('can_approve_expenses')) {
    return next();
  }
  return res.status(403).json({ error: 'Approval permission required' });
};

const notAdmin = (req, res, next) => {
  if (req.user.role === 'admin') {
    return res.status(403).json({ error: 'Admins cannot record expenses' });
  }
  next();
};

router.use(authenticate, requireCompanyScope);

// Categories (all authenticated users need this for forms)
router.get('/categories', ctrl.getCategories);

// Approval requests
router.get('/approval-requests', canApprove, ctrl.getApprovalRequests);
router.put('/approval-requests/:id', canApprove, ctrl.reviewRequest);
router.get('/my-requests', ctrl.getMyRequests);

// Expenses
router.get('/',    ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/',   notAdmin, ctrl.create);
router.put('/:id', notAdmin, ctrl.update);
router.delete('/:id', canApprove, ctrl.remove);

module.exports = router;
