const express = require('express');
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const { getMe, updateMe, changePassword, changeEmail, deleteMe } = require('../controllers/userController');

const router = express.Router();

router.get('/me', auth, getMe);

router.patch('/me', auth, [
  body('name').optional().notEmpty().trim().withMessage('Name cannot be empty'),
  body('dailyDigestHour').optional().isInt({ min: 0, max: 23 }).withMessage('dailyDigestHour must be 0–23'),
], updateMe);

router.post('/me/password', auth, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
], changePassword);

router.patch('/me/email', auth, [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('currentPassword').notEmpty().withMessage('Password is required to change email'),
], changeEmail);

router.delete('/me', auth, [
  body('password').notEmpty().withMessage('Password is required to delete account'),
], deleteMe);

module.exports = router;
