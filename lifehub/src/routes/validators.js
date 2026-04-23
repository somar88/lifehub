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

module.exports = { emailBody, optionalEmailBody };
