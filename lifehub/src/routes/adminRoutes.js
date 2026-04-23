const express = require('express');
const { body } = require('express-validator');
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.use(requireAdmin);

router.get('/system/status', adminController.getStatus);

router.get('/config/email', adminController.getEmailConfig);

router.put('/config/email', [
  body('provider').isIn(['gmail-smtp', 'gmail-oauth2']).withMessage('Provider must be gmail-smtp or gmail-oauth2'),
  body('user').isEmail().normalizeEmail().withMessage('Valid email is required'),
], adminController.updateEmailConfig);

router.post('/config/email/test', adminController.testEmail);

router.get('/users', adminController.listUsers);

router.post('/users', [
  body('name').notEmpty().trim().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('role').optional().isIn(['user', 'admin']).withMessage('Role must be user or admin'),
], adminController.createUser);

router.patch('/users/:id/approve', adminController.approveUser);

router.patch('/users/:id/reject', adminController.rejectUser);

router.patch('/users/:id', [
  body('role').optional().isIn(['user', 'admin']).withMessage('Role must be user or admin'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
], adminController.updateUser);

module.exports = router;
