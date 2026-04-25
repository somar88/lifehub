'use strict';
const { body } = require('express-validator');

const emailBody = (field = 'email') =>
  body(field)
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail({ gmail_remove_dots: false });

const optionalEmailBody = (field = 'email') =>
  body(field)
    .optional({ checkFalsy: true })
    .isEmail().withMessage('Invalid email')
    .normalizeEmail({ gmail_remove_dots: false });

const passwordBody = (field = 'password', label = 'Password') =>
  body(field)
    .isLength({ min: 8 }).withMessage(`${label} must be at least 8 characters`)
    .matches(/[A-Z]/).withMessage(`${label} must contain at least one uppercase letter`)
    .matches(/[a-z]/).withMessage(`${label} must contain at least one lowercase letter`)
    .matches(/[0-9]/).withMessage(`${label} must contain at least one number`)
    .matches(/[^A-Za-z0-9]/).withMessage(`${label} must contain at least one special character`);

module.exports = { emailBody, optionalEmailBody, passwordBody };
