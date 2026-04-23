const router = require('express').Router();
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const { listTasks, getTaskStats, createTask, getTask, updateTask, duplicateTask, deleteTask, exportTasks } = require('../controllers/taskController');

const titleValidator = body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 });
const statusValidator = body('status').optional().isIn(['todo', 'in-progress', 'done']).withMessage('Invalid status');
const priorityValidator = body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Invalid priority');
const dueDateValidator = body('dueDate').optional({ nullable: true }).isISO8601().withMessage('Invalid date format');
const tagsValidator = body('tags').optional().isArray().withMessage('Tags must be an array');
const idValidator = param('id').isMongoId().withMessage('Invalid task ID');

router.use(auth);

router.get('/stats', getTaskStats);
router.get('/export', exportTasks);
router.get('/', listTasks);
router.post('/', [titleValidator, statusValidator, priorityValidator, dueDateValidator, tagsValidator], createTask);
router.post('/:id/duplicate', idValidator, duplicateTask);
router.get('/:id', idValidator, getTask);
router.patch('/:id', [idValidator, body('title').optional().trim().notEmpty().isLength({ max: 200 }), statusValidator, priorityValidator, dueDateValidator, tagsValidator], updateTask);
router.delete('/:id', idValidator, deleteTask);

module.exports = router;
