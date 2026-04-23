const User = require('../../models/User');

module.exports = async (ctx, next) => {
  const chatId = String(ctx.chat.id);
  const user = await User.findOne({ telegramChatId: chatId });
  if (!user) {
    return ctx.reply('Your Telegram is not linked to a LifeHub account.\nGenerate a code in the app (Settings → Telegram) and send: /link <code>');
  }
  ctx.state.user = user;
  return next();
};
