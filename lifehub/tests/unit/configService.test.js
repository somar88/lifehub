process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'b'.repeat(64);

const configService = require('../../src/services/configService');
const dbHelper = require('../helpers/dbHelper');
const Config = require('../../src/models/Config');

describe('Config Service', () => {
  beforeAll(() => dbHelper.connect());
  afterAll(() => dbHelper.disconnect());
  afterEach(() => Config.deleteMany({}));

  it('sets and gets a plain value', async () => {
    await configService.set('app.name', 'LifeHub');
    expect(await configService.get('app.name')).toBe('LifeHub');
  });

  it('returns null for a missing key', async () => {
    expect(await configService.get('does.not.exist')).toBeNull();
  });

  it('auto-encrypts sensitive keys', async () => {
    await configService.set('email.password', 'secret123', 'email');
    const raw = await Config.findOne({ key: 'email.password' });
    expect(raw.encrypted).toBe(true);
    expect(raw.value).not.toBe('secret123');
    expect(await configService.get('email.password')).toBe('secret123');
  });

  it('does not encrypt non-sensitive keys', async () => {
    await configService.set('email.provider', 'gmail-smtp', 'email');
    const raw = await Config.findOne({ key: 'email.provider' });
    expect(raw.encrypted).toBe(false);
  });

  it('getCategory masks secrets by default', async () => {
    await configService.set('email.provider', 'gmail-smtp', 'email');
    await configService.set('email.password', 'secret', 'email');
    const cat = await configService.getCategory('email');
    expect(cat.provider).toBe('gmail-smtp');
    expect(cat.password).toBe('***');
  });

  it('getCategory reveals secrets when maskSecrets=false', async () => {
    await configService.set('email.password', 'secret', 'email');
    const cat = await configService.getCategory('email', { maskSecrets: false });
    expect(cat.password).toBe('secret');
  });

  it('setMany saves multiple keys under a category', async () => {
    await configService.setMany({ provider: 'gmail-smtp', user: 'a@b.com' }, 'email');
    expect(await configService.get('email.provider')).toBe('gmail-smtp');
    expect(await configService.get('email.user')).toBe('a@b.com');
  });

  it('upserts on repeated set', async () => {
    await configService.set('app.name', 'v1');
    await configService.set('app.name', 'v2');
    expect(await configService.get('app.name')).toBe('v2');
    expect(await Config.countDocuments({ key: 'app.name' })).toBe(1);
  });
});
