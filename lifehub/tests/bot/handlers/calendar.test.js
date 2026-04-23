'use strict';

jest.mock('../../../src/bot/middleware/requireLinked', () => (ctx, next) => next());
jest.mock('../../../src/models/Event', () => ({
  find: jest.fn(),
  create: jest.fn(),
}));

const Event = require('../../../src/models/Event');
const { register } = require('../../../src/bot/handlers/calendar');
const { createMockBot, makeCtx } = require('../helpers/mockBot');

const mockEvent = (id, title, start = new Date()) => ({
  _id: id, title, start, reminderMinutes: 15,
  deleteOne: jest.fn().mockResolvedValue({}),
});

describe('calendar handler', () => {
  let bot;
  beforeEach(() => {
    bot = createMockBot();
    register(bot);
    jest.clearAllMocks();
  });

  describe('/today', () => {
    it('replies "No events today" when none', async () => {
      Event.find.mockReturnValue({ sort: () => Promise.resolve([]) });
      const ctx = makeCtx('/today');
      await bot.invoke('today', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('📅 No events today.');
    });

    it('lists today events', async () => {
      const ev = mockEvent('aaa', 'Standup');
      Event.find.mockReturnValue({ sort: () => Promise.resolve([ev]) });
      const ctx = makeCtx('/today');
      await bot.invoke('today', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Standup'));
    });
  });

  describe('/upcoming', () => {
    it('replies "No upcoming events" when none', async () => {
      Event.find.mockReturnValue({ sort: () => ({ limit: () => Promise.resolve([]) }) });
      const ctx = makeCtx('/upcoming');
      await bot.invoke('upcoming', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('📅 No upcoming events.');
    });

    it('lists upcoming events', async () => {
      const ev = mockEvent('bbb', 'Meeting');
      Event.find.mockReturnValue({ sort: () => ({ limit: () => Promise.resolve([ev]) }) });
      const ctx = makeCtx('/upcoming');
      await bot.invoke('upcoming', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Meeting'));
    });

    it('respects a custom limit', async () => {
      let capturedLimit;
      Event.find.mockReturnValue({
        sort: () => ({ limit: (n) => { capturedLimit = n; return Promise.resolve([]); } }),
      });
      const ctx = makeCtx('/upcoming 10');
      await bot.invoke('upcoming', ctx);
      expect(capturedLimit).toBe(10);
    });
  });

  describe('/addevent', () => {
    it('creates an event with default reminder (15 min)', async () => {
      const ev = mockEvent('ccc', 'Meeting');
      Event.create.mockResolvedValue(ev);
      const ctx = makeCtx('/addevent Meeting on 2026-06-15');
      await bot.invoke('addevent', ctx);
      expect(Event.create).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Meeting', reminderMinutes: 15,
      }));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Event created'));
    });

    it('creates an event with custom reminder', async () => {
      const ev = mockEvent('ddd', 'Review');
      Event.create.mockResolvedValue(ev);
      const ctx = makeCtx('/addevent Review on 2026-06-15 remind 30m');
      await bot.invoke('addevent', ctx);
      expect(Event.create).toHaveBeenCalledWith(expect.objectContaining({ reminderMinutes: 30 }));
    });

    it('replies with usage for invalid format', async () => {
      const ctx = makeCtx('/addevent missing-on-keyword');
      await bot.invoke('addevent', ctx);
      expect(Event.create).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });

  describe('/cancelevent', () => {
    it('deletes an event by short ID', async () => {
      const ev = mockEvent('aaaaaa000abc', 'Old Meeting');
      Event.find.mockResolvedValue([ev]);
      const ctx = makeCtx('/cancelevent 00abc');
      await bot.invoke('cancelevent', ctx);
      expect(ev.deleteOne).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
    });

    it('replies not-found when event does not exist', async () => {
      Event.find.mockResolvedValue([]);
      const ctx = makeCtx('/cancelevent xxxxxx');
      await bot.invoke('cancelevent', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No event found'));
    });

    it('replies with usage when no ID given', async () => {
      const ctx = makeCtx('/cancelevent');
      await bot.invoke('cancelevent', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });
});
