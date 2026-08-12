const router = require('express').Router();
const { authenticate, requirePermission, requireAdmin, sellerOnly, requireCompanyScope } = require('../middleware/auth');
const ctrl = require('../controllers/salesController');

router.use(authenticate, requireCompanyScope);
router.get('/daily-summary', ctrl.getDailySummary);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', sellerOnly, requirePermission('create_sale'), ctrl.create);
router.delete('/:id', requireAdmin, ctrl.deleteSale);

module.exports = router;
