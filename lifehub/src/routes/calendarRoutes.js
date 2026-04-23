const router = require('express').Router();
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const { listEvents, getUpcoming, createEvent, getEvent, updateEvent, deleteEvent, exportEvents } = require('../controllers/calendarController');

const idValidator = param('id').isMongoId().withMessage('Invalid event ID');
const startValidator = body('start').isISO8601().withMessage('start must be a valid ISO 8601 date');
const endValidator = body('end').optional({ nullable: true }).isISO8601().withMessage('end must be a valid ISO 8601 date');
const titleValidator = body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 });

router.use(auth);

router.get('/upcoming', getUpcoming);
router.get('/export', exportEvents);
router.get('/', listEvents);
router.post('/', [titleValidator, startValidator, endValidator], createEvent);
router.get('/:id', idValidator, getEvent);
router.patch('/:id', [
  idValidator,
  body('title').optional().trim().notEmpty().isLength({ max: 200 }),
  body('start').optional().isISO8601().withMessage('start must be a valid ISO 8601 date'),
  endValidator,
], updateEvent);
router.delete('/:id', idValidator, deleteEvent);

module.exports = router;
