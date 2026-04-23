'use strict';

jest.mock('../../../src/models/User', () => ({
  findOne: jest.fn(),
}));

const User = require('../../../src/models/User');
const requireLinked = require('../../../src/bot/middleware/requireLinked');

const makeCtx = (chatId = 'chat123') => ({
  state: {},
  chat: { id: chatId },
  reply: jest.fn().mockResolvedValue({}),
});

const mockUser = () => ({
  _id: 'user1',
  name: 'Test User',
  telegramChatId: 'chat123',
});

describe('requireLinked bot middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('replies with link instructions and does not call next when user is not linked', async () => {
    User.findOne.mockResolvedValue(null);
    const ctx = makeCtx();
    const next = jest.fn();

    await requireLinked(ctx, next);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('/link'));
    expect(next).not.toHaveBeenCalled();
  });

  it('sets ctx.state.user and calls next when user is linked', async () => {
    const user = mockUser();
    User.findOne.mockResolvedValue(user);
    const ctx = makeCtx();
    const next = jest.fn().mockResolvedValue();

    await requireLinked(ctx, next);

    expect(ctx.state.user).toBe(user);
    expect(next).toHaveBeenCalled();
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('looks up the user by the chat ID from ctx.chat.id', async () => {
    User.findOne.mockResolvedValue(mockUser());
    const ctx = makeCtx('42');
    const next = jest.fn().mockResolvedValue();

    await requireLinked(ctx, next);

    expect(User.findOne).toHaveBeenCalledWith({ telegramChatId: '42' });
  });
});
