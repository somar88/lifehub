const logger = require('../../src/config/logger');

describe('Logger', () => {
  it('exposes all required log level methods', () => {
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('uses LOG_LEVEL env variable when set', () => {
    expect(logger.level).toBe(process.env.LOG_LEVEL || 'info');
  });

  it('does not throw when logging at each level', () => {
    expect(() => logger.error('test error')).not.toThrow();
    expect(() => logger.warn('test warn')).not.toThrow();
    expect(() => logger.info('test info')).not.toThrow();
    expect(() => logger.debug('test debug')).not.toThrow();
  });

  it('handles Error objects with stack traces', () => {
    const err = new Error('boom');
    expect(() => logger.error('caught error', { error: err.message, stack: err.stack })).not.toThrow();
  });

  it('handles extra metadata fields', () => {
    expect(() => logger.info('with meta', { userId: 'abc123', action: 'login' })).not.toThrow();
  });
});
