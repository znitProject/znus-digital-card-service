const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const handler = require('../server/index.cjs');

async function request(pathname, body) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({hostname: '127.0.0.1', port, path: pathname, method: 'POST', headers: {'content-type': 'application/json'}}, res => {
        let text = '';
        res.on('data', chunk => { text += chunk; });
        res.on('end', () => resolve({status: res.statusCode, body: JSON.parse(text)}));
      });
      req.on('error', reject);
      req.end(body);
    });
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('the exported Vercel handler returns a 400 response for malformed JSON', async () => {
  const response = await request('/api/input/request', '{"email":');
  assert.equal(response.status, 400);
  assert.equal(response.body.error, 'JSON 형식이 올바르지 않습니다.');
});

test('SMTP recipient rejection and unexpected failures have distinct HTTP handling', () => {
  const server = fs.readFileSync(path.resolve(__dirname, '../server/index.cjs'), 'utf8');
  assert.match(server, /throw requestError\(422, '수신 이메일 주소를 확인해 주세요\. 메일을 전달할 수 없습니다\.'/);
  assert.match(server, /function routeHandler\(req, res\) \{\s*return route\(req, res\)\.catch\(error => sendRouteError\(res, error\)\);/);
  assert.match(server, /status >= 500[\s\S]*?서버 요청 처리 중 문제가 발생했습니다/);
});
