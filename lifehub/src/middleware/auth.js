'use strict';
const jwt = require('jsonwebtoken');
const { isRevoked } = require('./tokenBlacklist');
const User = require('../models/User');

async function auth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (decoded.jti && isRevoked(decoded.jti)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // Check if admin revoked all sessions for this user after the token was issued
    if (decoded.userId && decoded.iat) {
      const user = await User.findById(decoded.userId).select('tokensValidFrom').lean();
      if (user?.tokensValidFrom && decoded.iat * 1000 < new Date(user.tokensValidFrom).getTime()) {
        return res.status(401).json({ error: 'Session has been revoked. Please log in again.' });
      }
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = auth;
