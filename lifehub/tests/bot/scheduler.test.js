'use strict';

jest.mock('../../src/models/User', () => ({ find: jest.fn(), findById: jest.fn() }));
jest.mock('../../src/models/Event', () => ({ find: jest.fn() }));
jest.mock('../../src/models/Task', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../../src/config/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(),
}));
jest.mock('../../src/services/emailService', () => ({
  sendReminderEmail:    jest.fn().mockResolvedValue({}),
  sendTaskDueEmail:     jest.fn().mockResolvedValue({}),
  sendDailyDigestEmail: jest.fn().mockResolvedValue({}),
}));

const User = require('../../src/models/User');
const Event = require('../../src/models/Event');
const Task = require('../../src/models/Task');
const emailService = require('../../src/services/emailService');
const { eventReminders, taskReminders, dailyDigests } = require('../../src/bot/scheduler');

function mockBot() {
  return { telegram: { sendMessage: jest.fn().mockResolvedValue({}) } };
}

describe('scheduler', () => {
  let bot;
  beforeEach(() => {
    bot = mockBot();
    jest.clearAllMocks();
  });

  describe('eventReminders', () => {
    it('sends Telegram message and marks reminderSent for due event', async () => {
      const event = {
        _id: 'ev1', title: 'Meeting',
        start: new Date(Date.now() + 5 * 60 * 1000),
        reminderMinutes: 15,
        reminderSent: false,
        save: jest.fn().mockResolvedValue({}),
        userId: 'user1',
      };
      const user = { _id: 'user1', name: 'Alice', email: 'a@t.com', telegramChatId: 'chat1' };
      Event.find.mockResolvedValue([event]);
      User.findById.mockResolvedValue(user);

      await eventReminders(bot);

      expect(bot.telegram.sendMessage).toHaveBeenCalledWith('chat1', expect.stringContaining('Meeting'));
      expect(emailService.sendReminderEmail).not.toHaveBeenCalled();
      expect(event.reminderSent).toBe(true);
      expect(event.save).toHaveBeenCalled();
    });

    it('sends email reminder when user has no telegramChatId', async () => {
      const event = {
        _id: 'ev2', title: 'Meeting',
        start: new Date(Date.now() + 5 * 60 * 1000),
        reminderMinutes: 15,
        reminderSent: false,
        save: jest.fn().mockResolvedValue({}),
        userId: 'user2',
      };
      const user = { _id: 'user2', name: 'Bob', email: 'b@t.com', telegramChatId: null };
      Event.find.mockResolvedValue([event]);
      User.findById.mockResolvedValue(user);

      await eventReminders(bot);

      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
      expect(emailService.sendReminderEmail).toHaveBeenCalledWith(user, event, expect.any(Number));
      expect(event.reminderSent).toBe(true);
    });

    it('skips event whose reminder window has passed', async () => {
      const event = {
        _id: 'ev3', title: 'Past',
        start: new Date(Date.now() + 90 * 60 * 1000),
        reminderMinutes: 15,
        reminderSent: false,
        save: jest.fn(),
        userId: 'user1',
      };
      const user = { _id: 'user1', telegramChatId: 'chat1' };
      Event.find.mockResolvedValue([event]);
      User.findById.mockResolvedValue(user);

      await eventReminders(bot);

      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
      expect(event.reminderSent).toBe(false);
    });

    it('skips event when user not found', async () => {
      const event = {
        _id: 'ev4', title: 'Meeting',
        start: new Date(Date.now() + 5 * 60 * 1000),
        reminderMinutes: 15,
        reminderSent: false,
        save: jest.fn(),
        userId: 'missing',
      };
      Event.find.mockResolvedValue([event]);
      User.findById.mockResolvedValue(null);

      await eventReminders(bot);

      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('taskReminders', () => {
    it('sends Telegram reminder for task due today and sets flag', async () => {
      const task = {
        _id: 'task1', title: 'Finish report',
        dueDateReminderSent: false,
        save: jest.fn().mockResolvedValue({}),
        userId: 'user1',
      };
      const user = { _id: 'user1', name: 'Alice', email: 'a@t.com', telegramChatId: 'chat1' };
      Task.find.mockResolvedValue([task]);
      User.findById.mockResolvedValue(user);

      await taskReminders(bot);

      expect(bot.telegram.sendMessage).toHaveBeenCalledWith('chat1', expect.stringContaining('Finish report'));
      expect(emailService.sendTaskDueEmail).not.toHaveBeenCalled();
      expect(task.dueDateReminderSent).toBe(true);
    });

    it('sends email reminder when user has no telegramChatId', async () => {
      const task = {
        _id: 'task2', title: 'Deploy',
        dueDateReminderSent: false,
        save: jest.fn().mockResolvedValue({}),
        userId: 'user2',
      };
      const user = { _id: 'user2', name: 'Bob', email: 'b@t.com', telegramChatId: null };
      Task.find.mockResolvedValue([task]);
      User.findById.mockResolvedValue(user);

      await taskReminders(bot);

      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
      expect(emailService.sendTaskDueEmail).toHaveBeenCalledWith(user, task);
      expect(task.dueDateReminderSent).toBe(true);
    });

    it('skips tasks without a linked user', async () => {
      const task = { _id: 'task3', title: 'Test', dueDateReminderSent: false, save: jest.fn(), userId: 'userX' };
      Task.find.mockResolvedValue([task]);
      User.findById.mockResolvedValue(null);

      await taskReminders(bot);

      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('does nothing when no due tasks', async () => {
      Task.find.mockResolvedValue([]);
      await taskReminders(bot);
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('dailyDigests', () => {
    it('sends Telegram digest and updates lastDigestDate', async () => {
      const user = {
        _id: 'user1', name: 'Alice', email: 'a@t.com', telegramChatId: 'chat1',
        lastDigestDate: null,
        save: jest.fn().mockResolvedValue({}),
      };
      User.find.mockResolvedValue([user]);
      Task.countDocuments.mockResolvedValue(3);
      Event.find.mockReturnValue({ sort: () => ({ limit: () => Promise.resolve([]) }) });

      await dailyDigests(bot);

      expect(bot.telegram.sendMessage).toHaveBeenCalledWith('chat1', expect.stringContaining('Alice'));
      expect(bot.telegram.sendMessage).toHaveBeenCalledWith('chat1', expect.stringContaining('3'));
      expect(emailService.sendDailyDigestEmail).not.toHaveBeenCalled();
      expect(user.save).toHaveBeenCalled();
    });

    it('sends email digest when user has no telegramChatId', async () => {
      const user = {
        _id: 'user2', name: 'Bob', email: 'b@t.com', telegramChatId: null,
        lastDigestDate: null,
        save: jest.fn().mockResolvedValue({}),
      };
      User.find.mockResolvedValue([user]);
      Task.countDocuments.mockResolvedValue(2);
      Event.find.mockReturnValue({ sort: () => ({ limit: () => Promise.resolve([]) }) });

      await dailyDigests(bot);

      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
      expect(emailService.sendDailyDigestEmail).toHaveBeenCalledWith(user, expect.objectContaining({ taskCount: 2 }));
      expect(user.save).toHaveBeenCalled();
    });

    it('includes today events in the Telegram digest', async () => {
      const user = {
        _id: 'user1', name: 'Bob', email: 'b@t.com', telegramChatId: 'chat1',
        lastDigestDate: null,
        save: jest.fn().mockResolvedValue({}),
      };
      const event = { title: 'Standup', start: new Date() };
      User.find.mockResolvedValue([user]);
      Task.countDocuments.mockResolvedValue(0);
      Event.find.mockReturnValue({ sort: () => ({ limit: () => Promise.resolve([event]) }) });

      await dailyDigests(bot);

      expect(bot.telegram.sendMessage).toHaveBeenCalledWith('chat1', expect.stringContaining('Standup'));
    });

    it('does nothing when no eligible users', async () => {
      User.find.mockResolvedValue([]);
      await dailyDigests(bot);
      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
    });
  });
});
