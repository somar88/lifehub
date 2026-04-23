'use strict';

jest.mock('../../../src/bot/middleware/requireLinked', () => (ctx, next) => next());
jest.mock('../../../src/models/ShoppingList', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndDelete: jest.fn(),
}));

const ShoppingList = require('../../../src/models/ShoppingList');
const { register } = require('../../../src/bot/handlers/shopping');
const { createMockBot, makeCtx } = require('../helpers/mockBot');

describe('shopping handler', () => {
  let bot;
  beforeEach(() => {
    bot = createMockBot();
    register(bot);
    jest.clearAllMocks();
  });

  describe('/shopping', () => {
    it('shows "No shopping lists" when none exist', async () => {
      ShoppingList.find.mockResolvedValue([]);
      const ctx = makeCtx('/shopping');
      await bot.invoke('shopping', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No shopping lists'));
    });

    it('lists all shopping lists with unchecked item counts', async () => {
      ShoppingList.find.mockResolvedValue([
        { name: 'Groceries', items: [{ checked: false }, { checked: true }] },
      ]);
      const ctx = makeCtx('/shopping');
      await bot.invoke('shopping', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Groceries'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('1 remaining'));
    });

    it('shows items in a named list', async () => {
      ShoppingList.find.mockResolvedValue([
        { name: 'Groceries', items: [{ name: 'Milk', checked: false, quantity: 1 }] },
      ]);
      const ctx = makeCtx('/shopping Groceries');
      await bot.invoke('shopping', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Milk'));
    });

    it('finds list case-insensitively', async () => {
      ShoppingList.find.mockResolvedValue([
        { name: 'Groceries', items: [] },
      ]);
      const ctx = makeCtx('/shopping groceries');
      await bot.invoke('shopping', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Groceries'));
    });

    it('replies not-found for unknown list name', async () => {
      ShoppingList.find.mockResolvedValue([{ name: 'Groceries', items: [] }]);
      const ctx = makeCtx('/shopping Hardware');
      await bot.invoke('shopping', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });

  describe('/additem', () => {
    it('adds item to a list', async () => {
      const list = { name: 'Groceries', items: [], save: jest.fn().mockResolvedValue({}) };
      list.items.push = jest.fn();
      ShoppingList.findOne.mockResolvedValue(list);
      const ctx = makeCtx('/additem Groceries Milk');
      await bot.invoke('additem', ctx);
      expect(list.items.push).toHaveBeenCalledWith(expect.objectContaining({ name: 'Milk' }));
      expect(list.save).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Added "Milk"'));
    });

    it('replies not-found when list does not exist', async () => {
      ShoppingList.findOne.mockResolvedValue(null);
      const ctx = makeCtx('/additem Groceries Milk');
      await bot.invoke('additem', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('replies with usage for missing item name', async () => {
      const ctx = makeCtx('/additem Groceries');
      await bot.invoke('additem', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });

  describe('/check', () => {
    it('toggles an item from unchecked to checked', async () => {
      const item = { name: 'Milk', checked: false };
      const list = {
        name: 'Groceries',
        items: [item],
        save: jest.fn().mockResolvedValue({}),
      };
      ShoppingList.findOne.mockResolvedValue(list);
      const ctx = makeCtx('/check Groceries Milk');
      await bot.invoke('check', ctx);
      expect(item.checked).toBe(true);
      expect(list.save).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('checked'));
    });

    it('replies not-found when list missing', async () => {
      ShoppingList.findOne.mockResolvedValue(null);
      const ctx = makeCtx('/check Groceries Milk');
      await bot.invoke('check', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });
  });

  describe('/deletelist', () => {
    it('deletes a list', async () => {
      ShoppingList.findOneAndDelete.mockResolvedValue({ name: 'Groceries' });
      const ctx = makeCtx('/deletelist Groceries');
      await bot.invoke('deletelist', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Deleted list'));
    });

    it('replies not-found when list missing', async () => {
      ShoppingList.findOneAndDelete.mockResolvedValue(null);
      const ctx = makeCtx('/deletelist Groceries');
      await bot.invoke('deletelist', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('not found'));
    });

    it('replies with usage when no list name given', async () => {
      const ctx = makeCtx('/deletelist');
      await bot.invoke('deletelist', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });
});
