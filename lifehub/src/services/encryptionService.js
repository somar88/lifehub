const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const hex = process.env.ENCRYPTION_KEY;
  if (hex && hex.length === 64) {
    return Buffer.from(hex, 'hex');
  }
  // Dev fallback: derive from JWT_SECRET via SHA-256
  return crypto.createHash('sha256').update(process.env.JWT_SECRET || 'lifehub-dev-key').digest();
}

function encrypt(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), encrypted.toString('base64'), authTag.toString('base64')].join(':');
}

function decrypt(ciphertext) {
  const key = getKey();
  const [ivB64, encB64, tagB64] = ciphertext.split(':');
  if (!ivB64 || !encB64 || !tagB64) throw new Error('Invalid ciphertext format');
  const iv = Buffer.from(ivB64, 'base64');
  const encrypted = Buffer.from(encB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  return decipher.update(encrypted, null, 'utf8') + decipher.final('utf8');
}

module.exports = { encrypt, decrypt };
