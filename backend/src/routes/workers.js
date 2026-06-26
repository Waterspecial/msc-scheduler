const express    = require('express');
const auth       = require('../middleware/auth');
const controller = require('../controllers/workersController');

const router = express.Router();
router.use(auth);

router.get('/',                   controller.getWorkers);
router.post('/',                  controller.createWorker);
router.put('/:id',                controller.updateWorker);
router.delete('/:id',             controller.deleteWorker);
router.post('/:id/availability',  controller.addAvailability);

module.exports = router;
