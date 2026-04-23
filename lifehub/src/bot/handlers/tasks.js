const requireLinked = require('../middleware/requireLinked');
const Task = require('../../models/Task');

const shortId = (id) => String(id).slice(-6);

function fmtTask(t) {
  const due = t.dueDate ? ` · due ${t.dueDate.toLocaleDateString()}` : '';
  return `[${shortId(t._id)}] ${t.title} (${t.priority}${due})`;
}

function register(bot) {
  bot.command('tasks', requireLinked, async (ctx) => {
    const text = ctx.message.text.trim();
    const done = text.includes('done');
    const user = ctx.state.user;

    const filter = done
      ? { userId: user._id, status: 'done' }
      : { userId: user._id, status: { $in: ['todo', 'in-progress'] } };

    const tasks = await Task.find(filter).sort({ createdAt: -1 }).limit(10);
    if (!tasks.length) return ctx.reply(done ? 'No completed tasks.' : 'No open tasks.');

    const header = done ? '✅ Recent completed tasks:' : '📋 Open tasks:';
    return ctx.reply(`${header}\n\n${tasks.map(fmtTask).join('\n')}\n\nUse /done <id> to complete a task.`);
  });

  bot.command('addtask', requireLinked, async (ctx) => {
    const title = ctx.message.text.replace(/^\/addtask\s*/i, '').trim();
    if (!title) return ctx.reply('Usage: /addtask <title>');
    const task = await Task.create({ userId: ctx.state.user._id, title, priority: 'medium', status: 'todo' });
    return ctx.reply(`✅ Task created!\n[${shortId(task._id)}] ${task.title}`);
  });

  bot.command('done', requireLinked, async (ctx) => {
    const id = ctx.message.text.replace(/^\/done\s*/i, '').trim();
    if (!id) return ctx.reply('Usage: /done <id>');
    const tasks = await Task.find({ userId: ctx.state.user._id, status: { $ne: 'done' } });
    const task = tasks.find(t => String(t._id).endsWith(id));
    if (!task) return ctx.reply(`No open task found with id ending in "${id}".`);
    task.status = 'done';
    await task.save();
    return ctx.reply(`✅ Marked done: ${task.title}`);
  });

  bot.command('deletetask', requireLinked, async (ctx) => {
    const id = ctx.message.text.replace(/^\/deletetask\s*/i, '').trim();
    if (!id) return ctx.reply('Usage: /deletetask <id>');
    const tasks = await Task.find({ userId: ctx.state.user._id });
    const task = tasks.find(t => String(t._id).endsWith(id));
    if (!task) return ctx.reply(`No task found with id ending in "${id}".`);
    await task.deleteOne();
    return ctx.reply(`🗑 Deleted: ${task.title}`);
  });
}

module.exports = { register };
