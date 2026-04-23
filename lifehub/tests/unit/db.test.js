const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const db = require('../../src/config/db');
const logger = require('../../src/config/logger');

const FAST_TIMEOUT = { retries: 0, serverSelectionTimeoutMS: 500, connectTimeoutMS: 500 };

describe('Database Connection — happy path', () => {
  let mongod;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await db.disconnect();
    }
    await mongod.stop();
  });

  it('connects successfully and reaches readyState 1', async () => {
    await db.connect(mongod.getUri(), { retries: 0 });
    expect(mongoose.connection.readyState).toBe(1);
  });

  it('logs connection success with host info', async () => {
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    await db.disconnect();
    await db.connect(mongod.getUri(), { retries: 0 });
    expect(infoSpy).toHaveBeenCalledWith('MongoDB connected', expect.objectContaining({ host: expect.any(String) }));
    infoSpy.mockRestore();
  });

  it('disconnects cleanly and reaches readyState 0', async () => {
    await db.disconnect();
    expect(mongoose.connection.readyState).toBe(0);
  });

  it('logs disconnect message', async () => {
    await db.connect(mongod.getUri(), { retries: 0 });
    const infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    await db.disconnect();
    expect(infoSpy).toHaveBeenCalledWith('MongoDB disconnected');
    infoSpy.mockRestore();
  });
});

describe('Database Connection — error handling', () => {
  it('throws immediately when retries is 0 and URI is bad', async () => {
    await expect(
      db.connect('mongodb://localhost:1', FAST_TIMEOUT)
    ).rejects.toThrow();
  }, 10000);

  it('logs a warning before retrying then throws', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    await expect(
      db.connect('mongodb://localhost:1', { ...FAST_TIMEOUT, retries: 1, retryDelay: 0 })
    ).rejects.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('retrying'),
      expect.objectContaining({ error: expect.any(String) })
    );
    warnSpy.mockRestore();
  }, 15000);
});
