const Config = require('../models/Config');
const { encrypt, decrypt } = require('./encryptionService');

const SENSITIVE_KEYS = [
  'email.password',
  'email.clientSecret',
  'email.refreshToken',
  'email.accessToken',
];

async function get(key) {
  const record = await Config.findOne({ key });
  if (!record) return null;
  return record.encrypted ? decrypt(record.value) : record.value;
}

async function set(key, value, category = 'general') {
  const shouldEncrypt = SENSITIVE_KEYS.includes(key);
  const storedValue = shouldEncrypt ? encrypt(String(value)) : String(value);
  await Config.findOneAndUpdate(
    { key },
    { value: storedValue, encrypted: shouldEncrypt, category },
    { upsert: true, new: true, runValidators: true }
  );
}

async function del(key) {
  await Config.deleteOne({ key });
}

async function getCategory(category, { maskSecrets = true } = {}) {
  const records = await Config.find({ category });
  const result = {};
  for (const record of records) {
    const shortKey = record.key.replace(`${category}.`, '');
    if (record.encrypted && maskSecrets) {
      result[shortKey] = '***';
    } else {
      result[shortKey] = record.encrypted ? decrypt(record.value) : record.value;
    }
  }
  return result;
}

async function setMany(entries, category = 'general') {
  for (const [key, value] of Object.entries(entries)) {
    await set(`${category}.${key}`, value, category);
  }
}

module.exports = { get, set, del, getCategory, setMany };
