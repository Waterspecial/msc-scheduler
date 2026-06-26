const express    = require('express');
const auth       = require('../middleware/auth');
const controller = require('../controllers/scheduleController');

const router = express.Router();
router.use(auth);

router.post('/generate', controller.generateSchedule);
router.get('/:id',       controller.getSchedule);
router.get('/:id/metrics', controller.getMetrics);

module.exports = router;
