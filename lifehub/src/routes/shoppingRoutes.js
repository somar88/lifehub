const router = require('express').Router();
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const {
  listLists, createList, getList, updateList, deleteList,
  addItem, updateItem, toggleItem, removeItem, exportShopping,
} = require('../controllers/shoppingController');

const idValidator = param('id').isMongoId().withMessage('Invalid shopping list ID');
const itemIdValidator = param('itemId').isMongoId().withMessage('Invalid item ID');
const nameValidator = body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 200 });
const itemNameValidator = body('name').trim().notEmpty().withMessage('Item name is required').isLength({ max: 200 });

router.use(auth);

// Lists
router.get('/export', exportShopping);
router.get('/', listLists);
router.post('/', nameValidator, createList);
router.get('/:id', idValidator, getList);
router.patch('/:id', [idValidator, body('name').trim().notEmpty().isLength({ max: 200 })], updateList);
router.delete('/:id', idValidator, deleteList);

// Items — must come after list routes to avoid /:id swallowing /items paths
router.post('/:id/items', [idValidator, itemNameValidator, body('quantity').optional().isFloat({ min: 0 })], addItem);
router.patch('/:id/items/:itemId/toggle', [idValidator, itemIdValidator], toggleItem);
router.patch('/:id/items/:itemId', [
  idValidator,
  itemIdValidator,
  body('name').optional().trim().notEmpty().isLength({ max: 200 }),
  body('quantity').optional().isFloat({ min: 0 }),
], updateItem);
router.delete('/:id/items/:itemId', [idValidator, itemIdValidator], removeItem);

module.exports = router;
