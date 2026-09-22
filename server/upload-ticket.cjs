const crypto = require('node:crypto');

function signUpload(data, secret) {
  const payload = Buffer.from(JSON.stringify(data)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + signature;
}

function verifyUpload(ticket, secret, employeeId) {
  const [payload, signature, extra] = String(ticket || '').split('.');
  if (!payload || !signature || extra) throw new Error('업로드 확인 정보가 올바르지 않습니다.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) throw new Error('업로드 확인 정보가 올바르지 않습니다.');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
  if (data.employeeId !== employeeId || !Number.isFinite(data.expires) || data.expires <= Date.now()) throw new Error('업로드 확인 시간이 만료되었거나 권한이 없습니다.');
  return data;
}

module.exports = {signUpload, verifyUpload};
