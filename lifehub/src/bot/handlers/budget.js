const requireLinked = require('../middleware/requireLinked');
const Transaction = require('../../models/Transaction');

function currentMonth() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return { start: new Date(`${y}-${m}-01`), end: new Date(`${y}-${m}-31T23:59:59`) };
}

function register(bot) {
  bot.command('balance', requireLinked, async (ctx) => {
    const { start, end } = currentMonth();
    const txns = await Transaction.find({ userId: ctx.state.user._id, date: { $gte: start, $lte: end } });
    const income   = txns.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = txns.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance  = income - expenses;
    const fmt = (n) => `$${n.toFixed(2)}`;
    return ctx.reply(
      `💰 This month:\n\nIncome:   ${fmt(income)}\nExpenses: ${fmt(expenses)}\nBalance:  ${balance >= 0 ? '+' : ''}${fmt(balance)}`
    );
  });

  bot.command('addexpense', requireLinked, async (ctx) => {
    const text = ctx.message.text.replace(/^\/addexpense\s*/i, '').trim();
    const parts = text.split(/\s+/);
    const amount = parseFloat(parts[0]);
    if (!amount || amount <= 0) return ctx.reply('Usage: /addexpense <amount> [description]\nExample: /addexpense 12.50 Coffee');
    const description = parts.slice(1).join(' ') || undefined;
    await Transaction.create({ userId: ctx.state.user._id, type: 'expense', amount, description, date: new Date() });
    return ctx.reply(`💸 Expense recorded: $${amount.toFixed(2)}${description ? ` — ${description}` : ''}`);
  });

  bot.command('addincome', requireLinked, async (ctx) => {
    const text = ctx.message.text.replace(/^\/addincome\s*/i, '').trim();
    const parts = text.split(/\s+/);
    const amount = parseFloat(parts[0]);
    if (!amount || amount <= 0) return ctx.reply('Usage: /addincome <amount> [description]\nExample: /addincome 3200 Salary');
    const description = parts.slice(1).join(' ') || undefined;
    await Transaction.create({ userId: ctx.state.user._id, type: 'income', amount, description, date: new Date() });
    return ctx.reply(`💵 Income recorded: $${amount.toFixed(2)}${description ? ` — ${description}` : ''}`);
  });
}

module.exports = { register };
