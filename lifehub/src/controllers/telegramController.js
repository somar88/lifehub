const crypto = require('crypto');
const User = require('../models/User');
const logger = require('../config/logger');

async function generateLinkCode(req, res, next) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const code = crypto.randomBytes(3).toString('hex').toUpperCase();
    user.telegramLinkToken = code;
    user.telegramLinkTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    logger.info('Telegram link code generated', { userId: user._id });
    res.json({ code, expiresIn: 900 });
  } catch (err) {
    next(err);
  }
}

async function unlinkTelegram(req, res, next) {
  try {
    const user = await User.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.telegramChatId = null;
    await user.save();
    logger.info('Telegram unlinked', { userId: user._id });
    res.json({ message: 'Telegram account unlinked' });
  } catch (err) {
    next(err);
  }
}

module.exports = { generateLinkCode, unlinkTelegram };
