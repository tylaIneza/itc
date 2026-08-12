const router = require('express').Router();
const { authenticate, requireAdmin, requireCompanyScope } = require('../middleware/auth');
const ctrl = require('../controllers/capitalController');

router.use(authenticate, requireCompanyScope, requireAdmin);
router.get('/', ctrl.getAll);
router.post('/', ctrl.add);
router.delete('/:id', ctrl.remove);

module.exports = router;
