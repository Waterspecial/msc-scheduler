const express    = require('express');
const auth       = require('../middleware/auth');
const controller = require('../controllers/shiftsController');

const router = express.Router();
router.use(auth);

router.get('/',       controller.getShifts);
router.post('/',      controller.createShift);
router.put('/:id',    controller.updateShift);
router.delete('/:id', controller.deleteShift);

module.exports = router;
