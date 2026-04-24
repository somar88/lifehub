'use strict';
const RevokedToken = require('../models/RevokedToken');

const blacklist = new Map(); // jti -> expiresAt (ms timestamp)

function revoke(jti, expUnixSec) {
  const expiresAt = expUnixSec
    ? expUnixSec * 1000
    : Date.now() + 7 * 24 * 60 * 60 * 1000;
  blacklist.set(jti, expiresAt);
  RevokedToken.create({ jti, expiresAt: new Date(expiresAt) }).catch(() => {});
}

function isRevoked(jti) {
  const exp = blacklist.get(jti);
  if (exp === undefined) return false;
  if (Date.now() > exp) { blacklist.delete(jti); return false; }
  return true;
}

async function loadBlacklist() {
  const tokens = await RevokedToken.find({ expiresAt: { $gt: new Date() } }).lean();
  for (const t of tokens) blacklist.set(t.jti, t.expiresAt.getTime());
}

// Prune expired entries from memory every hour
setInterval(() => {
  const now = Date.now();
  for (const [jti, exp] of blacklist) {
    if (now > exp) blacklist.delete(jti);
  }
}, 60 * 60 * 1000).unref();

module.exports = { revoke, isRevoked, loadBlacklist };
