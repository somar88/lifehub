'use strict';
const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');
const { emailBody } = require('./validators');

const router = express.Router();

const emailTestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many test emails. Please wait a minute.' },
});

router.use(requireAdmin);

router.get('/system/status', adminController.getStatus);

router.get('/audit-log', adminController.getAuditLog);

router.get('/config/email', adminController.getEmailConfig);

router.put('/config/email', [
  body('provider').isIn(['gmail-smtp', 'gmail-oauth2']).withMessage('Provider must be gmail-smtp or gmail-oauth2'),
  emailBody('user'),
], adminController.updateEmailConfig);

router.post('/config/email/test', emailTestLimiter, adminController.testEmail);

router.get('/users', adminController.listUsers);

router.post('/users', [
  body('name').notEmpty().trim().withMessage('Name is required'),
  emailBody(),
  body('role').optional().isIn(['user', 'admin']).withMessage('Role must be user or admin'),
], adminController.createUser);

router.patch('/users/:id/approve', adminController.approveUser);

router.patch('/users/:id/reject', adminController.rejectUser);

router.post('/users/:id/resend-invite', adminController.resendInvite);

router.post('/users/:id/revoke-sessions', adminController.revokeUserSessions);

router.patch('/users/:id', [
  body('role').optional().isIn(['user', 'admin']).withMessage('Role must be user or admin'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
], adminController.updateUser);

module.exports = router;
