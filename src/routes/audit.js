const router = require('express').Router();
const { authenticate, requireAdmin, requireCompanyScope } = require('../middleware/auth');
const ctrl = require('../controllers/auditController');

router.use(authenticate, requireCompanyScope, requireAdmin);
router.get('/modules', ctrl.getModules);
router.get('/', ctrl.getAll);

module.exports = router;
