process.env.JWT_SECRET = 'test-secret';
process.env.ENCRYPTION_KEY = 'a'.repeat(64); // 32 bytes of 0xAA

const { encrypt, decrypt } = require('../../src/services/encryptionService');

describe('Encryption Service', () => {
  it('encrypts and decrypts a string correctly', () => {
    const plain = 'super-secret-password';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const c1 = encrypt('same');
    const c2 = encrypt('same');
    expect(c1).not.toBe(c2);
    expect(decrypt(c1)).toBe('same');
    expect(decrypt(c2)).toBe('same');
  });

  it('round-trips special characters and unicode', () => {
    const plain = '🔐 pässwörд "quoted" <tag>';
    expect(decrypt(encrypt(plain))).toBe(plain);
  });

  it('throws on tampered ciphertext', () => {
    const ct = encrypt('value');
    const parts = ct.split(':');
    parts[1] = Buffer.from('tampered').toString('base64');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('throws on malformed ciphertext', () => {
    expect(() => decrypt('notvalid')).toThrow();
  });

  it('falls back to JWT_SECRET when ENCRYPTION_KEY is missing', () => {
    const saved = process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY;
    const plain = 'fallback test';
    expect(decrypt(encrypt(plain))).toBe(plain);
    process.env.ENCRYPTION_KEY = saved;
  });
});
