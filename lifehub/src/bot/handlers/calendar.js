const requireLinked = require('../middleware/requireLinked');
const Event = require('../../models/Event');

const shortId = (id) => String(id).slice(-6);

function fmtEvent(e) {
  const start = new Date(e.start);
  const dateStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const timeStr = start.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `[${shortId(e._id)}] ${e.title} — ${dateStr} ${timeStr}`;
}

function register(bot) {
  bot.command('today', requireLinked, async (ctx) => {
    const user = ctx.state.user;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    const events = await Event.find({ userId: user._id, start: { $gte: startOfDay, $lt: endOfDay } }).sort({ start: 1 });
    if (!events.length) return ctx.reply('📅 No events today.');
    return ctx.reply(`📅 Today's events:\n\n${events.map(fmtEvent).join('\n')}`);
  });

  bot.command('upcoming', requireLinked, async (ctx) => {
    const user = ctx.state.user;
    const parts = ctx.message.text.split(/\s+/);
    const limit = Math.min(20, parseInt(parts[1]) || 5);

    const events = await Event.find({ userId: user._id, start: { $gte: new Date() } }).sort({ start: 1 }).limit(limit);
    if (!events.length) return ctx.reply('📅 No upcoming events.');
    return ctx.reply(`📅 Next ${events.length} event(s):\n\n${events.map(fmtEvent).join('\n')}`);
  });

  bot.command('addevent', requireLinked, async (ctx) => {
    const text = ctx.message.text.replace(/^\/addevent\s*/i, '').trim();
    const onMatch = text.match(/^(.+?)\s+on\s+(\S+)(?:\s+remind\s+(\d+)m)?$/i);
    if (!onMatch) return ctx.reply('Usage: /addevent <title> on <date> [remind <N>m]\nExample: /addevent Meeting on 2026-05-10 remind 30m');

    const title = onMatch[1].trim();
    const dateStr = onMatch[2];
    const reminderMinutes = onMatch[3] ? parseInt(onMatch[3]) : 15;
    const start = new Date(dateStr);
    if (isNaN(start)) return ctx.reply(`Invalid date: "${dateStr}". Use format YYYY-MM-DD.`);

    const event = await Event.create({ userId: ctx.state.user._id, title, start, reminderMinutes });
    return ctx.reply(`📅 Event created!\n[${shortId(event._id)}] ${event.title} — ${start.toLocaleDateString()}`);
  });

  bot.command('cancelevent', requireLinked, async (ctx) => {
    const id = ctx.message.text.replace(/^\/cancelevent\s*/i, '').trim();
    if (!id) return ctx.reply('Usage: /cancelevent <id>');
    const events = await Event.find({ userId: ctx.state.user._id });
    const event = events.find(e => String(e._id).endsWith(id));
    if (!event) return ctx.reply(`No event found with id ending in "${id}".`);
    await event.deleteOne();
    return ctx.reply(`🗑 Cancelled: ${event.title}`);
  });
}

module.exports = { register };
