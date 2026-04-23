const request = require('supertest');
const app = require('../../src/app');
const logger = require('../../src/config/logger');

describe('Request Logger Middleware', () => {
  let infoSpy;

  beforeEach(() => {
    infoSpy = jest.spyOn(logger, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('logs successful requests at info level', async () => {
    await request(app).get('/health');
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('GET /health 200'),
      expect.objectContaining({ method: 'GET', url: '/health', status: 200 })
    );
  });

  it('includes duration in the log entry', async () => {
    await request(app).get('/health');
    const [, meta] = infoSpy.mock.calls[0];
    expect(typeof meta.duration).toBe('number');
    expect(meta.duration).toBeGreaterThanOrEqual(0);
  });

  it('logs 404 responses at warn level', async () => {
    const warnSpy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    await request(app).get('/nonexistent-route');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('404'),
      expect.objectContaining({ status: 404 })
    );
  });
});
