const express = require('express');
const rateLimit = require('express-rate-limit');
const requireAuth = require('../middleware/auth');
const telegramController = require('../controllers/telegramController');

const router = express.Router();

const linkCodeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many link requests. Please try again in an hour.' },
});

router.post('/link-code', requireAuth, linkCodeLimiter, telegramController.generateLinkCode);
router.delete('/link',     requireAuth, telegramController.unlinkTelegram);

module.exports = router;
