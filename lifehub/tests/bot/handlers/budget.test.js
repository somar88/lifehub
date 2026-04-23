'use strict';

jest.mock('../../../src/bot/middleware/requireLinked', () => (ctx, next) => next());
jest.mock('../../../src/models/Transaction', () => ({
  find: jest.fn(),
  create: jest.fn(),
}));

const Transaction = require('../../../src/models/Transaction');
const { register } = require('../../../src/bot/handlers/budget');
const { createMockBot, makeCtx } = require('../helpers/mockBot');

describe('budget handler', () => {
  let bot;
  beforeEach(() => {
    bot = createMockBot();
    register(bot);
    jest.clearAllMocks();
  });

  describe('/balance', () => {
    it('shows income, expenses, and balance', async () => {
      Transaction.find.mockResolvedValue([
        { type: 'income', amount: 3000 },
        { type: 'expense', amount: 1200 },
      ]);
      const ctx = makeCtx('/balance');
      await bot.invoke('balance', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('3000.00'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('1200.00'));
    });

    it('shows zero balance when no transactions', async () => {
      Transaction.find.mockResolvedValue([]);
      const ctx = makeCtx('/balance');
      await bot.invoke('balance', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('$0.00'));
    });
  });

  describe('/addexpense', () => {
    it('records an expense with description', async () => {
      Transaction.create.mockResolvedValue({});
      const ctx = makeCtx('/addexpense 12.50 Coffee');
      await bot.invoke('addexpense', ctx);
      expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'expense', amount: 12.5, description: 'Coffee',
      }));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Expense recorded'));
    });

    it('records an expense without description', async () => {
      Transaction.create.mockResolvedValue({});
      const ctx = makeCtx('/addexpense 5.00');
      await bot.invoke('addexpense', ctx);
      expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({ amount: 5.0 }));
    });

    it('replies with usage for invalid amount', async () => {
      const ctx = makeCtx('/addexpense abc');
      await bot.invoke('addexpense', ctx);
      expect(Transaction.create).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });

    it('replies with usage for zero amount', async () => {
      const ctx = makeCtx('/addexpense 0');
      await bot.invoke('addexpense', ctx);
      expect(Transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('/addincome', () => {
    it('records income with description', async () => {
      Transaction.create.mockResolvedValue({});
      const ctx = makeCtx('/addincome 3200 Salary');
      await bot.invoke('addincome', ctx);
      expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({
        type: 'income', amount: 3200, description: 'Salary',
      }));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Income recorded'));
    });

    it('replies with usage for invalid amount', async () => {
      const ctx = makeCtx('/addincome notanumber');
      await bot.invoke('addincome', ctx);
      expect(Transaction.create).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });
});
