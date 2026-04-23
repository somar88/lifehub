'use strict';
const RevokedToken = require('../models/RevokedToken');

const blacklist = new Set();

function revoke(jti, expUnixSec) {
  blacklist.add(jti);
  const expiresAt = expUnixSec
    ? new Date(expUnixSec * 1000)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  RevokedToken.create({ jti, expiresAt }).catch(() => {});
}

function isRevoked(jti) {
  return blacklist.has(jti);
}

async function loadBlacklist() {
  const tokens = await RevokedToken.find({ expiresAt: { $gt: new Date() } }).lean();
  for (const t of tokens) blacklist.add(t.jti);
}

module.exports = { revoke, isRevoked, loadBlacklist };
