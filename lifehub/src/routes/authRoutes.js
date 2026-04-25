'use strict';
const express = require('express');
const { body, query } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const { emailBody, passwordBody } = require('./validators');

const router = express.Router();

const skipInTest = () => process.env.NODE_ENV === 'test';

const testOnly = (req, res, next) => {
  if (process.env.NODE_ENV !== 'test') return res.status(404).json({ error: 'Not found' });
  next();
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skip: skipInTest,
  message: { error: 'Too many login attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: skipInTest,
  message: { error: 'Too many password reset requests. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  skip: skipInTest,
  message: { error: 'Too many application attempts. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/register', testOnly, [
  body('name').notEmpty().trim().withMessage('Name is required'),
  emailBody(),
  passwordBody('password', 'Password'),
], authController.register);

router.post('/login', loginLimiter, [
  emailBody(),
  body('password').notEmpty().withMessage('Password is required'),
], authController.login);

router.post('/forgot-password', forgotPasswordLimiter, [
  emailBody(),
], authController.forgotPassword);

router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token is required'),
  passwordBody('password', 'Password'),
], authController.resetPassword);

router.post('/apply', applyLimiter, [
  body('firstName').notEmpty().trim().withMessage('First name is required'),
  body('lastName').optional().trim(),
  emailBody(),
], authController.apply);

router.get('/verify-invite', [
  query('token').notEmpty().withMessage('Token is required'),
], authController.verifyInvite);

router.post('/accept-invite', [
  body('token').notEmpty().withMessage('Token is required'),
  passwordBody('password', 'Password'),
], authController.acceptInvite);

router.post('/logout', auth, authController.logout);

module.exports = router;
