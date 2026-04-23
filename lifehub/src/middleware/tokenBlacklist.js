'use strict';
const blacklist = new Set();

function revoke(jti) { blacklist.add(jti); }
function isRevoked(jti) { return blacklist.has(jti); }

module.exports = { revoke, isRevoked };
