const { Telegraf } = require('telegraf');
const logger = require('../config/logger');
const { startScheduler } = require('./scheduler');
const authHandler     = require('./handlers/auth');
const tasksHandler    = require('./handlers/tasks');
const calendarHandler = require('./handlers/calendar');
const shoppingHandler = require('./handlers/shopping');
const budgetHandler   = require('./handlers/budget');
const settingsHandler = require('./handlers/settings');

let bot = null;

async function startBot(app) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    logger.warn('TELEGRAM_BOT_TOKEN not set — bot disabled');
    return;
  }

  bot = new Telegraf(token);

  authHandler.register(bot);
  tasksHandler.register(bot);
  calendarHandler.register(bot);
  shoppingHandler.register(bot);
  budgetHandler.register(bot);
  settingsHandler.register(bot);

  bot.catch((err, ctx) => {
    logger.error('Bot error', { update: ctx.updateType, error: err.message });
  });

  if (process.env.TELEGRAM_USE_POLLING === 'true') {
    await bot.launch();
    logger.info('Telegram bot started (long-polling)');
  } else {
    const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL;
    if (!webhookUrl) {
      logger.warn('TELEGRAM_WEBHOOK_URL not set — bot disabled in webhook mode');
      return;
    }
    const path = `/telegram/webhook/${token}`;
    app.use(bot.webhookCallback(path));
    await bot.telegram.setWebhook(`${webhookUrl}${path}`);
    logger.info('Telegram bot started (webhook)', { url: webhookUrl });
  }

  startScheduler(bot);

  process.once('SIGINT',  () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

module.exports = { startBot };
