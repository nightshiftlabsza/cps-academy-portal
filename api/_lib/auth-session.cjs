'use strict';

const crypto = require('node:crypto');

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: SESSION_SECRET environment variable must be set in production');
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'cps-academy-dev-ephemeral-key-do-not-use-in-prod';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8').toString('base64url');
}

function base64UrlDecode(str) {
  return Buffer.from(str, 'base64url').toString('utf8');
}

function createSessionToken(user = {}) {
  const email = user.email || (user.name ? `${user.name.toLowerCase().replace(/\s+/g, '.')}@example.com` : 'member@example.com');
  const payload = {
    email,
    name: user.name || email.split('@')[0],
    role: user.role || 'member',
    id: user.id || `mem-${email.replace(/[^a-z0-9]+/g, '-')}`,
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS
  };
  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);
  const hmac = crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${hmac}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, receivedHmac] = parts;
  const expectedHmac = crypto.createHmac('sha256', SESSION_SECRET).update(encodedPayload).digest('base64url');
  if (receivedHmac !== expectedHmac) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (Date.now() > payload.exp) return null; // Expired
    return {
      email: payload.email,
      name: payload.name,
      role: payload.role,
      id: payload.id,
      isAuthenticated: true
    };
  } catch {
    return null;
  }
}

function getSessionUser(req) {
  if (!req || !req.headers) return null;

  // 1. Check Authorization Bearer header
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const verified = verifySessionToken(token);
    if (verified) return verified;
  }

  // 2. Check Cookie cps_session
  const rawCookie = req.headers['cookie'] || '';
  const cookies = rawCookie.split(';').map(c => c.trim());
  for (const c of cookies) {
    if (c.startsWith('cps_session=')) {
      const token = decodeURIComponent(c.slice(12));
      const verified = verifySessionToken(token);
      if (verified) return verified;
    }
  }

  return null;
}

module.exports = {
  createSessionToken,
  verifySessionToken,
  getSessionUser
};
