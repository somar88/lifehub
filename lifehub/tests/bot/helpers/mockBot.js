'use strict';

function createMockBot() {
  const _handlers = {};
  return {
    _handlers,
    command(name, ...fns) { _handlers[`cmd:${name}`] = fns; },
    start(...fns)         { _handlers['start'] = fns; },
    help(...fns)          { _handlers['help'] = fns; },
    async invoke(name, ctx) {
      const key = ['start', 'help'].includes(name) ? name : `cmd:${name}`;
      const fns = _handlers[key];
      if (!fns) throw new Error(`No handler registered for: ${name}`);
      let i = 0;
      const next = async () => { if (i < fns.length) await fns[i++](ctx, next); };
      await next();
    },
  };
}

function makeCtx(text = '', userOverride = {}) {
  const user = {
    _id: 'user123',
    name: 'Test User',
    email: 't@t.com',
    role: 'user',
    dailyDigestHour: 8,
    telegramChatId: 'chat123',
    save: jest.fn().mockResolvedValue({}),
    ...userOverride,
  };
  return {
    state: { user },
    message: { text, chat: { id: 'chat123' } },
    chat: { id: 'chat123' },
    reply: jest.fn().mockResolvedValue({}),
  };
}

module.exports = { createMockBot, makeCtx };
