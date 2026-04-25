const User = require('../models/User');
const Event = require('../models/Event');
const Task = require('../models/Task');
const Contact = require('../models/Contact');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const ShoppingList = require('../models/ShoppingList');
const AuditLog = require('../models/AuditLog');
const logger = require('../config/logger');
const { sendReminderEmail, sendTaskDueEmail, sendDailyDigestEmail } = require('../services/emailService');

const GRACE_DAYS = parseInt(process.env.RECOVERY_GRACE_DAYS || '30', 10);
let lastPurgeDate = null;

async function eventReminders(bot) {
  const now = new Date();
  try {
    const events = await Event.find({
      start: { $lte: new Date(now.getTime() + 60 * 60 * 1000) },
      reminderSent: false,
    });

    for (const event of events) {
      if (event.reminderSent) continue;
      const user = await User.findById(event.userId);
      if (!user) continue;
      const minsUntil = Math.round((event.start - now) / 60000);
      if (minsUntil < 0 || minsUntil > event.reminderMinutes) continue;

      try {
        if (user.telegramChatId) {
          await bot.telegram.sendMessage(user.telegramChatId, `⏰ Reminder: "${event.title}" starts in ${minsUntil} min`);
        } else if (user.email) {
          await sendReminderEmail(user, event, minsUntil);
        }
        event.reminderSent = true;
        await event.save();
      } catch (err) {
        logger.warn('Event reminder send failed', { eventId: event._id, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Event reminder scheduler error', { error: err.message });
  }
}

async function taskReminders(bot) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  try {
    const tasks = await Task.find({
      dueDate: { $gte: todayStart, $lt: todayEnd },
      status: { $ne: 'done' },
      dueDateReminderSent: false,
    });

    for (const task of tasks) {
      if (task.dueDateReminderSent) continue;
      const user = await User.findById(task.userId);
      if (!user) continue;
      try {
        if (user.telegramChatId) {
          await bot.telegram.sendMessage(user.telegramChatId, `📋 Task due today: "${task.title}"`);
        } else if (user.email) {
          await sendTaskDueEmail(user, task);
        }
        task.dueDateReminderSent = true;
        await task.save();
      } catch (err) {
        logger.warn('Task reminder send failed', { taskId: task._id, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Task reminder scheduler error', { error: err.message });
  }
}

async function dailyDigests(bot) {
  const now = new Date();
  const currentHour = now.getHours();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  try {
    const users = await User.find({
      dailyDigestHour: currentHour,
      $or: [{ lastDigestDate: null }, { lastDigestDate: { $lt: today } }],
    });

    for (const user of users) {
      if (!user.telegramChatId && !user.email) continue;
      try {
        const todayEnd = new Date(today.getTime() + 86400000);

        const [openTasks, todayEvents] = await Promise.all([
          Task.countDocuments({ userId: user._id, status: { $ne: 'done' } }),
          Event.find({ userId: user._id, start: { $gte: today, $lt: todayEnd } }).sort({ start: 1 }).limit(5),
        ]);

        if (user.telegramChatId) {
          const eventLines = todayEvents.length
            ? todayEvents.map(e => `• ${e.title} @ ${new Date(e.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`).join('\n')
            : '(no events today)';
          await bot.telegram.sendMessage(
            user.telegramChatId,
            `🌅 Good morning, ${user.name}!\n\n📋 Open tasks: ${openTasks}\n\n📅 Today:\n${eventLines}`
          );
        } else {
          await sendDailyDigestEmail(user, { taskCount: openTasks, events: todayEvents });
        }

        user.lastDigestDate = now;
        await user.save();
      } catch (err) {
        logger.warn('Daily digest send failed', { userId: user._id, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Daily digest scheduler error', { error: err.message });
  }
}

async function purgeDeletedAccounts() {
  const today = new Date().toISOString().split('T')[0];
  if (lastPurgeDate === today) return;
  lastPurgeDate = today;

  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000);
  let expired;
  try {
    expired = await User.find({ status: 'deleted', deletedAt: { $lt: cutoff } }, '_id email').lean();
  } catch (err) {
    logger.error('Purge query failed', { error: err.message });
    lastPurgeDate = null; // allow retry next tick
    return;
  }

  for (const u of expired) {
    try {
      await Promise.all([
        Task.deleteMany({ userId: u._id }),
        Event.deleteMany({ userId: u._id }),
        Contact.deleteMany({ userId: u._id }),
        Category.deleteMany({ userId: u._id }),
        Transaction.deleteMany({ userId: u._id }),
        ShoppingList.deleteMany({ userId: u._id }),
      ]);
      await User.findByIdAndDelete(u._id);
      await AuditLog.create({ action: 'account_purged', meta: { email: u.email } }).catch(() => {});
      logger.info('Purged expired deleted account', { email: u.email });
    } catch (err) {
      logger.warn('Account purge failed', { userId: u._id, error: err.message });
    }
  }
}

function startScheduler(bot) {
  let consecutiveFailures = 0;
  setInterval(async () => {
    try {
      await eventReminders(bot);
      await taskReminders(bot);
      await dailyDigests(bot);
      await purgeDeletedAccounts();
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      if (consecutiveFailures === 1 || consecutiveFailures % 10 === 0) {
        logger.error('Scheduler top-level error', { error: err.message, consecutiveFailures });
      }
    }
  }, 60 * 1000);
}

function _resetPurgeDate() { lastPurgeDate = null; }

module.exports = { startScheduler, eventReminders, taskReminders, dailyDigests, purgeDeletedAccounts, _resetPurgeDate };
