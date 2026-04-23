'use strict';

jest.mock('../../../src/bot/middleware/requireLinked', () => (ctx, next) => next());
jest.mock('../../../src/models/Task', () => ({
  find: jest.fn(),
  create: jest.fn(),
}));

const Task = require('../../../src/models/Task');
const { register } = require('../../../src/bot/handlers/tasks');
const { createMockBot, makeCtx } = require('../helpers/mockBot');

const chainMock = (tasks) => ({ sort: () => ({ limit: () => Promise.resolve(tasks) }) });
const mockTask = (id, title, status = 'todo') => ({
  _id: id, title, status, priority: 'medium', dueDate: null,
  save: jest.fn().mockResolvedValue({}),
  deleteOne: jest.fn().mockResolvedValue({}),
});

describe('tasks handler', () => {
  let bot;
  beforeEach(() => {
    bot = createMockBot();
    register(bot);
    jest.clearAllMocks();
  });

  describe('/tasks', () => {
    it('replies with "No open tasks" when none exist', async () => {
      Task.find.mockReturnValue(chainMock([]));
      const ctx = makeCtx('/tasks');
      await bot.invoke('tasks', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('No open tasks.');
    });

    it('lists open tasks with short IDs', async () => {
      Task.find.mockReturnValue(chainMock([mockTask('aaaaaa000abc', 'Buy milk')]));
      const ctx = makeCtx('/tasks');
      await bot.invoke('tasks', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Buy milk'));
    });

    it('filters done tasks when text contains "done"', async () => {
      Task.find.mockReturnValue(chainMock([]));
      const ctx = makeCtx('/tasks done');
      await bot.invoke('tasks', ctx);
      expect(ctx.reply).toHaveBeenCalledWith('No completed tasks.');
      expect(Task.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
    });
  });

  describe('/addtask', () => {
    it('creates a task and confirms creation', async () => {
      const task = mockTask('000000abc123', 'Buy milk');
      Task.create.mockResolvedValue(task);
      const ctx = makeCtx('/addtask Buy milk');
      await bot.invoke('addtask', ctx);
      expect(Task.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user123', title: 'Buy milk', priority: 'medium', status: 'todo',
      }));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Task created'));
    });

    it('replies with usage hint when title is missing', async () => {
      const ctx = makeCtx('/addtask');
      await bot.invoke('addtask', ctx);
      expect(Task.create).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });

  describe('/done', () => {
    it('marks a task done by short ID', async () => {
      const task = mockTask('aaaaaa000abc', 'Buy milk');
      Task.find.mockResolvedValue([task]);
      const ctx = makeCtx('/done 00abc');
      await bot.invoke('done', ctx);
      expect(task.status).toBe('done');
      expect(task.save).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Marked done'));
    });

    it('replies not-found when no matching task', async () => {
      Task.find.mockResolvedValue([]);
      const ctx = makeCtx('/done xxxxxx');
      await bot.invoke('done', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No open task found'));
    });

    it('replies with usage when no ID given', async () => {
      const ctx = makeCtx('/done');
      await bot.invoke('done', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });

  describe('/deletetask', () => {
    it('deletes a task by short ID', async () => {
      const task = mockTask('aaaaaa000abc', 'Buy milk');
      Task.find.mockResolvedValue([task]);
      const ctx = makeCtx('/deletetask 00abc');
      await bot.invoke('deletetask', ctx);
      expect(task.deleteOne).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Deleted'));
    });

    it('replies not-found when task does not exist', async () => {
      Task.find.mockResolvedValue([]);
      const ctx = makeCtx('/deletetask xxxxxx');
      await bot.invoke('deletetask', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No task found'));
    });
  });
});
