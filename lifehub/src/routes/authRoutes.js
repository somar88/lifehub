const express = require('express');
const { body, query } = require('express-validator');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

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
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], authController.register);

router.post('/login', loginLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').notEmpty().withMessage('Password is required'),
], authController.login);

router.post('/forgot-password', forgotPasswordLimiter, [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
], authController.forgotPassword);

router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], authController.resetPassword);

router.post('/apply', applyLimiter, [
  body('firstName').notEmpty().trim().withMessage('First name is required'),
  body('lastName').optional().trim(),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
], authController.apply);

router.get('/verify-invite', [
  query('token').notEmpty().withMessage('Token is required'),
], authController.verifyInvite);

router.post('/accept-invite', [
  body('token').notEmpty().withMessage('Token is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], authController.acceptInvite);

router.post('/logout', auth, authController.logout);

module.exports = router;
