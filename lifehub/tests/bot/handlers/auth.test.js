'use strict';

jest.mock('../../../src/models/User', () => ({
  findOne: jest.fn(),
}));

const User = require('../../../src/models/User');
const { register } = require('../../../src/bot/handlers/auth');
const { createMockBot } = require('../helpers/mockBot');

const makeCtx = (text = '', chatId = 'chat123') => ({
  state: {},
  message: { text, chat: { id: chatId } },
  chat: { id: chatId },
  reply: jest.fn().mockResolvedValue({}),
});

const mockUser = (overrides = {}) => ({
  name: 'Test User',
  email: 't@t.com',
  role: 'user',
  dailyDigestHour: 8,
  telegramChatId: 'chat123',
  telegramLinkToken: null,
  telegramLinkTokenExpiry: null,
  save: jest.fn().mockResolvedValue({}),
  ...overrides,
});

describe('auth handler', () => {
  let bot;
  beforeEach(() => {
    bot = createMockBot();
    register(bot);
    jest.clearAllMocks();
  });

  describe('/start', () => {
    it('welcomes back a linked user', async () => {
      User.findOne.mockResolvedValue(mockUser());
      const ctx = makeCtx('/start');
      await bot.invoke('start', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Welcome back'));
    });

    it('shows link instructions for unlinked user', async () => {
      User.findOne.mockResolvedValue(null);
      const ctx = makeCtx('/start');
      await bot.invoke('start', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('link your account'));
    });
  });

  describe('/link', () => {
    it('links account with valid code', async () => {
      const user = mockUser({ telegramChatId: null });
      User.findOne.mockReturnValue({ select: () => Promise.resolve(user) });
      const ctx = makeCtx('/link X7K2PQ');
      await bot.invoke('link', ctx);
      expect(user.telegramChatId).toBe('chat123');
      expect(user.telegramLinkToken).toBeNull();
      expect(user.save).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Account linked'));
    });

    it('rejects invalid or expired code', async () => {
      User.findOne.mockReturnValue({ select: () => Promise.resolve(null) });
      const ctx = makeCtx('/link BADCODE');
      await bot.invoke('link', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Invalid or expired'));
    });

    it('replies with usage when no code given', async () => {
      const ctx = makeCtx('/link');
      await bot.invoke('link', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });
  });

  describe('/unlink', () => {
    it('unlinks a linked account', async () => {
      const user = mockUser();
      User.findOne.mockResolvedValue(user);
      const ctx = makeCtx('/unlink');
      await bot.invoke('unlink', ctx);
      expect(user.telegramChatId).toBeNull();
      expect(user.save).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('unlinked'));
    });

    it('replies when no account is linked', async () => {
      User.findOne.mockResolvedValue(null);
      const ctx = makeCtx('/unlink');
      await bot.invoke('unlink', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No account is linked'));
    });
  });

  describe('/profile', () => {
    it('shows profile for linked user', async () => {
      User.findOne.mockResolvedValue(mockUser());
      const ctx = makeCtx('/profile');
      await bot.invoke('profile', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Test User'));
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('t@t.com'));
    });

    it('prompts to link when not linked', async () => {
      User.findOne.mockResolvedValue(null);
      const ctx = makeCtx('/profile');
      await bot.invoke('profile', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('No account linked'));
    });
  });
});
