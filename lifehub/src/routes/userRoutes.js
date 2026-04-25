'use strict';
const express = require('express');
const { body, query } = require('express-validator');
const auth = require('../middleware/auth');
const { getMe, updateMe, changePassword, changeEmail, verifyEmailChange, deleteMe } = require('../controllers/userController');
const { emailBody, passwordBody } = require('./validators');

const router = express.Router();

router.get('/me', auth, getMe);

router.patch('/me', auth, [
  body('name').optional().notEmpty().trim().withMessage('Name cannot be empty'),
  body('dailyDigestHour').optional().isInt({ min: 0, max: 23 }).withMessage('dailyDigestHour must be 0–23'),
  body('timezone').optional().notEmpty().trim().withMessage('Timezone cannot be empty'),
], updateMe);

router.post('/me/password', auth, [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  passwordBody('newPassword', 'New password'),
], changePassword);

router.patch('/me/email', auth, [
  emailBody(),
  body('currentPassword').notEmpty().withMessage('Password is required to change email'),
], changeEmail);

// Token arrives via query param from the verification email link — no auth required
router.get('/me/email/verify', [
  query('token').notEmpty().withMessage('Token is required'),
], verifyEmailChange);

router.delete('/me', auth, [
  body('password').notEmpty().withMessage('Password is required to delete account'),
], deleteMe);

module.exports = router;
