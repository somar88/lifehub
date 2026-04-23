const router = require('express').Router();
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const {
  listCategories, createCategory, getCategory, updateCategory, deleteCategory,
  listTransactions, createTransaction, getTransaction, updateTransaction, deleteTransaction,
  getSummary, exportTransactions,
} = require('../controllers/budgetController');

const idValidator = param('id').isMongoId().withMessage('Invalid ID');
const typeValidator = body('type').isIn(['income', 'expense']).withMessage('type must be income or expense');
const amountValidator = body('amount').isFloat({ min: 0 }).withMessage('amount must be a non-negative number');

router.use(auth);

// Categories
router.get('/categories', listCategories);
router.post('/categories', [body('name').trim().notEmpty().withMessage('Name is required'), typeValidator], createCategory);
router.get('/categories/:id', idValidator, getCategory);
router.patch('/categories/:id', [idValidator, body('name').optional().trim().notEmpty(), body('type').optional().isIn(['income', 'expense'])], updateCategory);
router.delete('/categories/:id', idValidator, deleteCategory);

// Transactions
router.get('/transactions/export', exportTransactions);
router.get('/transactions', listTransactions);
router.post('/transactions', [amountValidator, typeValidator, body('date').optional().isISO8601().withMessage('Invalid date'), body('categoryId').optional({ nullable: true }).isMongoId().withMessage('Invalid category ID')], createTransaction);
router.get('/transactions/:id', idValidator, getTransaction);
router.patch('/transactions/:id', [idValidator, body('amount').optional().isFloat({ min: 0 }), body('type').optional().isIn(['income', 'expense']), body('date').optional().isISO8601(), body('categoryId').optional({ nullable: true }).isMongoId()], updateTransaction);
router.delete('/transactions/:id', idValidator, deleteTransaction);

// Summary
router.get('/summary', getSummary);

module.exports = router;
