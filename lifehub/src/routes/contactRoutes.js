const router = require('express').Router();
const { body, param } = require('express-validator');
const auth = require('../middleware/auth');
const { listContacts, createContact, getContact, updateContact, toggleFavorite, deleteContact, exportContacts } = require('../controllers/contactController');

const idValidator = param('id').isMongoId().withMessage('Invalid contact ID');
const firstNameValidator = body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 100 });
const emailValidator = body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email').normalizeEmail({ gmail_remove_dots: false });

router.use(auth);

router.get('/export', exportContacts);
router.get('/', listContacts);
router.post('/', [firstNameValidator, emailValidator], createContact);
router.get('/:id', idValidator, getContact);
router.patch('/:id/favorite', idValidator, toggleFavorite);
router.patch('/:id', [
  idValidator,
  body('firstName').optional().trim().notEmpty().isLength({ max: 100 }),
  emailValidator,
], updateContact);
router.delete('/:id', idValidator, deleteContact);

module.exports = router;
