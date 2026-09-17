const {test} = require('node:test');
const assert = require('node:assert/strict');
const {normalizeEmail, randomToken, hashToken, otpCode, constantTimeEqual} = require('../server/security.cjs');

test('normalizes valid email and rejects malformed email', () => {
  assert.equal(normalizeEmail(' Person@Example.org '), 'person@example.org');
  assert.throws(() => normalizeEmail('not-an-email'), /이메일/);
});

test('tokens and OTPs have the expected shape and are not reversible hashes', () => {
  assert.match(randomToken(), /^[A-Za-z0-9_-]{43}$/);
  assert.match(otpCode(), /^\d{6}$/);
  assert.notEqual(hashToken('secret'), 'secret');
  assert.equal(constantTimeEqual(hashToken('secret'), hashToken('secret')), true);
  assert.equal(constantTimeEqual(hashToken('secret'), hashToken('other')), false);
});
