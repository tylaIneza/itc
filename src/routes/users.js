const router = require('express').Router();
const { authenticate, requireAdmin, requireCompanyScope } = require('../middleware/auth');
const ctrl = require('../controllers/userController');

router.use(authenticate, requireCompanyScope, requireAdmin);
router.get('/roles', ctrl.getRoles);
router.get('/managers', ctrl.getManagers);
router.get('/', ctrl.getAll);
router.get('/:id', ctrl.getOne);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.delete('/:id/permanent', ctrl.permanentDelete);

module.exports = router;
