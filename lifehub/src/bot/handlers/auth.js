const crypto = require('crypto');
const User = require('../../models/User');

function register(bot) {
  bot.start(async (ctx) => {
    const chatId = String(ctx.chat.id);
    const existing = await User.findOne({ telegramChatId: chatId });
    if (existing) {
      return ctx.reply(`Welcome back, ${existing.name}! Type /help to see available commands.`);
    }
    return ctx.reply(
      'Welcome to LifeHub Bot!\n\n' +
      'To get started, link your account:\n' +
      '1. Open the LifeHub web app\n' +
      '2. Go to Settings → Telegram\n' +
      '3. Click "Link Telegram" to get a code\n' +
      '4. Send: /link <your-code>\n\n' +
      'Type /help for all commands.'
    );
  });

  bot.command('link', async (ctx) => {
    const parts = ctx.message.text.split(/\s+/);
    const code = parts[1];
    if (!code) return ctx.reply('Usage: /link <code>\nGet a code from Settings → Telegram in the LifeHub app.');

    const user = await User.findOne({
      telegramLinkToken: code.toUpperCase(),
      telegramLinkTokenExpiry: { $gt: new Date() },
    }).select('+telegramLinkToken');

    if (!user) return ctx.reply('Invalid or expired code. Please generate a new one in the LifeHub app.');

    user.telegramChatId = String(ctx.chat.id);
    user.telegramLinkToken = null;
    user.telegramLinkTokenExpiry = null;
    await user.save();

    return ctx.reply(`✅ Account linked! Welcome, ${user.name}!\nType /help to see all available commands.`);
  });

  bot.command('unlink', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return ctx.reply('No account is linked to this Telegram.');
    user.telegramChatId = null;
    await user.save();
    return ctx.reply('Your Telegram account has been unlinked from LifeHub.');
  });

  bot.command('profile', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const user = await User.findOne({ telegramChatId: chatId });
    if (!user) return ctx.reply('No account linked. Send /link <code> to connect.');
    return ctx.reply(
      `👤 Profile\n\nName: ${user.name}\nEmail: ${user.email}\nRole: ${user.role}\nDigest time: ${user.dailyDigestHour}:00`
    );
  });

  bot.help(async (ctx) => {
    return ctx.reply(
      '📚 LifeHub Bot Commands\n\n' +
      '🔗 Account\n' +
      '/link <code> — Link your account\n' +
      '/unlink — Disconnect Telegram\n' +
      '/profile — Show your account info\n' +
      '/settings — Notification settings\n' +
      '/digest <hour> — Set digest time (0-23)\n\n' +
      '✅ Tasks\n' +
      '/tasks — Open tasks\n' +
      '/tasks done — Completed tasks\n' +
      '/addtask <title> — Create a task\n' +
      '/done <id> — Mark task done\n' +
      '/deletetask <id> — Delete a task\n\n' +
      '📅 Calendar\n' +
      '/today — Today\'s events\n' +
      '/upcoming [N] — Next events\n' +
      '/addevent <title> on <date> [remind <N>m] — Add event\n' +
      '/cancelevent <id> — Delete an event\n\n' +
      '🛒 Shopping\n' +
      '/shopping [list name] — View lists or items\n' +
      '/additem <list> <item> — Add item\n' +
      '/check <list> <item> — Toggle item\n' +
      '/deletelist <list> — Delete list\n\n' +
      '💰 Budget\n' +
      '/balance — Month summary\n' +
      '/addexpense <amount> [desc] — Record expense\n' +
      '/addincome <amount> [desc] — Record income'
    );
  });
}

module.exports = { register };
