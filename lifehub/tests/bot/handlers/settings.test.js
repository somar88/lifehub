'use strict';

jest.mock('../../../src/bot/middleware/requireLinked', () => (ctx, next) => next());

const { register } = require('../../../src/bot/handlers/settings');
const { createMockBot, makeCtx } = require('../helpers/mockBot');

describe('settings handler', () => {
  let bot;
  beforeEach(() => {
    bot = createMockBot();
    register(bot);
    jest.clearAllMocks();
  });

  describe('/settings', () => {
    it('shows current settings including digest hour', async () => {
      const ctx = makeCtx('/settings');
      await bot.invoke('settings', ctx);
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Daily digest: 8:00'));
    });
  });

  describe('/digest', () => {
    it('updates the digest hour', async () => {
      const ctx = makeCtx('/digest 7');
      await bot.invoke('digest', ctx);
      expect(ctx.state.user.dailyDigestHour).toBe(7);
      expect(ctx.state.user.save).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Daily digest set to 7:00'));
    });

    it('rejects hour 25 as invalid', async () => {
      const ctx = makeCtx('/digest 25');
      await bot.invoke('digest', ctx);
      expect(ctx.state.user.save).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Usage'));
    });

    it('rejects negative hour', async () => {
      const ctx = makeCtx('/digest -1');
      await bot.invoke('digest', ctx);
      expect(ctx.state.user.save).not.toHaveBeenCalled();
    });

    it('accepts hour 0 (midnight)', async () => {
      const ctx = makeCtx('/digest 0');
      await bot.invoke('digest', ctx);
      expect(ctx.state.user.dailyDigestHour).toBe(0);
      expect(ctx.state.user.save).toHaveBeenCalled();
    });

    it('accepts hour 23 (11 PM)', async () => {
      const ctx = makeCtx('/digest 23');
      await bot.invoke('digest', ctx);
      expect(ctx.state.user.dailyDigestHour).toBe(23);
    });
  });
});
