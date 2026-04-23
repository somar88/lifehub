const requireLinked = require('../middleware/requireLinked');

function register(bot) {
  bot.command('settings', requireLinked, async (ctx) => {
    const user = ctx.state.user;
    return ctx.reply(
      `⚙ Settings\n\nDaily digest: ${user.dailyDigestHour}:00\nTelegram: linked\n\nUse /digest <hour> to change digest time (0–23).`
    );
  });

  bot.command('digest', requireLinked, async (ctx) => {
    const user = ctx.state.user;
    const parts = ctx.message.text.split(/\s+/);
    const hour = parseInt(parts[1]);
    if (isNaN(hour) || hour < 0 || hour > 23) return ctx.reply('Usage: /digest <hour>\nExample: /digest 7 (sends at 7:00)');
    user.dailyDigestHour = hour;
    await user.save();
    return ctx.reply(`✅ Daily digest set to ${hour}:00.`);
  });
}

module.exports = { register };
