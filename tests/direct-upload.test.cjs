const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {Readable} = require('node:stream');
const {createRequire} = require('node:module');
const {signUpload, verifyUpload} = require('../server/upload-ticket.cjs');

test('browser sends the file only to the signed storage URL and handles text errors', async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../server/views/input.html'), 'utf8');
  const source = html.slice(html.indexOf('async function readResponse('), html.indexOf("$('#request').onclick"));
  const calls = [];
  const context = {
    FormData,
    async fetch(url, options) {
      calls.push({url, options});
      const data = url.includes('/prepare') ? {direct: true, uploadUrl: 'https://storage.example/upload?token=test', ticket: 'test-ticket'} : {ok: true};
      return {ok: true, text: async () => JSON.stringify(data)};
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  const file = new Blob([Buffer.alloc(6 * 1024 * 1024)], {type: 'video/mp4'});
  file.name = 'large-test.mp4';
  await context.uploadCardMedia('profile', file, {x: 30, y: 40, scale: 1.2});
  assert.equal(calls.length, 3);
  assert.ok(calls[0].url.includes('/prepare'));
  assert.equal(calls[1].url, 'https://storage.example/upload?token=test');
  assert.equal(calls[1].options.body.get('').size, file.size);
  assert.equal(calls[1].options.credentials, 'omit');
  assert.ok(calls[2].url.includes('/complete'));
  assert.ok(Buffer.byteLength(calls[0].options.body) < 1024);
  assert.ok(Buffer.byteLength(calls[2].options.body) < 1024);
  await assert.rejects(() => context.readResponse({ok: false, status: 413, text: async () => 'Request Entity Too Large'}), /30MB/);
});

test('upload tickets reject tampering, other employees, and expiry', () => {
  const data = {employeeId: 'employee', expires: Date.now() + 60000};
  const ticket = signUpload(data, 'test-secret');
  assert.deepEqual(verifyUpload(ticket, 'test-secret', 'employee'), data);
  assert.throws(() => verifyUpload(ticket, 'wrong-secret', 'employee'));
  assert.throws(() => verifyUpload(ticket, 'test-secret', 'other'));
  assert.throws(() => verifyUpload(signUpload({...data, expires: 0}, 'test-secret'), 'test-secret', 'employee'));
});

test('large direct upload is verified before attaching to a card; retries are idempotent', async () => {
  const filename = path.resolve(__dirname, '../server/index.cjs');
  const localRequire = createRequire(filename);
  const queries = [], calls = [];
  let storedSize = 6 * 1024 * 1024;
  const sandbox = {
    module: {exports: {}}, __dirname: path.dirname(filename), console, URL, URLSearchParams, Buffer,
    process: {env: {VERCEL: '1', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only'}},
    require(name) {
      if (name === 'pg') return {Pool: class {}};
      if (name === '@vercel/functions') return {attachDatabasePool() {}};
      return localRequire(name);
    },
    async fetch(url, options) {
      calls.push({url, options});
      if (url.endsWith('/rpc/znus_query')) {
        const {query} = JSON.parse(options.body);
        queries.push(query);
        return {ok: true, json: async () => /FROM input_sessions/.test(query) ? [{id: 'employee'}] : []};
      }
      if (options.method === 'HEAD') return {ok: true, headers: new Map([['content-length', String(storedSize)], ['content-type', 'video/mp4']])};
      return {ok: true, json: async () => ({url: url.split('/storage/v1')[1] + '?token=file-scoped-test-token'})};
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, {filename});
  async function request(endpoint, body) {
    const req = Readable.from([JSON.stringify(body)]);
    Object.assign(req, {method: 'POST', url: endpoint, headers: {host: 'example.invalid', cookie: 'znus_input_session=test-cookie'}});
    let status, payload;
    await sandbox.module.exports(req, {writeHead(code) {status = code;}, end(body) {payload = JSON.parse(body);}});
    return {status, payload};
  }
  const prepared = await request('/api/input/media/prepare?slot=profile', {name: 'test.mp4', mime: 'video/mp4', size: storedSize});
  assert.equal(prepared.status, 200);
  assert.equal(prepared.payload.direct, true);
  assert.ok(prepared.payload.uploadUrl.startsWith('https://example.invalid/storage/v1/object/upload/sign/'));
  assert.ok(!JSON.stringify(prepared.payload).includes('test-only'));
  assert.ok(calls.every(call => Buffer.byteLength(call.options.body || '') < 4096));
  const writesBefore = queries.filter(query => query.startsWith('INSERT')).length;
  storedSize = 1;
  assert.equal((await request('/api/input/media/complete?slot=profile', {ticket: prepared.payload.ticket})).status, 400);
  assert.equal(queries.filter(query => query.startsWith('INSERT')).length, writesBefore);
  storedSize = 6 * 1024 * 1024;
  assert.equal((await request('/api/input/media/complete?slot=role', {ticket: prepared.payload.ticket})).status, 400);
  assert.equal((await request('/api/input/media/complete?slot=profile', {ticket: prepared.payload.ticket})).status, 201);
  assert.ok(queries.some(query => query.includes('ON CONFLICT (id) DO NOTHING')));
  assert.ok(queries.some(query => query.includes('ON CONFLICT (employee_id, page) DO UPDATE')));
  assert.equal((await request('/api/input/media/prepare?slot=profile', {mime: 'video/mp4', size: 31 * 1024 * 1024})).status, 400);
  assert.equal((await request('/api/input/media/prepare?slot=profile', {mime: 'text/html', size: 100})).status, 400);
});

test('admin default backgrounds use the same direct upload path', async () => {
  const filename = path.resolve(__dirname, '../server/index.cjs');
  const localRequire = createRequire(filename);
  const queries = [];
  const sandbox = {
    module: {exports: {}}, __dirname: path.dirname(filename), console, URL, URLSearchParams, Buffer,
    process: {env: {VERCEL: '1', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only', ADMIN_ACCESS_KEY: 'admin-test'}},
    require(name) {
      if (name === 'pg') return {Pool: class {}};
      if (name === '@vercel/functions') return {attachDatabasePool() {}};
      return localRequire(name);
    },
    async fetch(url, options) {
      if (url.endsWith('/rpc/znus_query')) {
        const {query} = JSON.parse(options.body);
        queries.push(query);
        return {ok: true, json: async () => []};
      }
      if (options.method === 'HEAD') return {ok: true, headers: new Map([['content-length', '6291456'], ['content-type', 'video/mp4']])};
      return {ok: true, json: async () => ({url: url.split('/storage/v1')[1] + '?token=default-scoped-test-token'})};
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, {filename});
  async function request(endpoint, body) {
    const req = Readable.from([JSON.stringify(body)]);
    Object.assign(req, {method: 'POST', url: endpoint, headers: {host: 'example.invalid', 'x-admin-key': 'admin-test'}});
    let status, payload;
    await sandbox.module.exports(req, {writeHead(code) {status = code;}, end(body) {payload = JSON.parse(body);}});
    return {status, payload};
  }
  const prepared = await request('/api/admin/default-backgrounds/prepare?page=company', {name: 'company.mp4', mime: 'video/mp4', size: 6291456});
  assert.equal(prepared.status, 200);
  assert.equal(prepared.payload.direct, true);
  assert.ok(prepared.payload.uploadUrl.includes('/object/upload/sign/'));
  assert.equal((await request('/api/admin/default-backgrounds/complete?page=company', {ticket: prepared.payload.ticket})).status, 201);
  assert.ok(queries.some(query => query.includes('card_page_default_backgrounds')));
  assert.equal((await request('/api/admin/default-backgrounds/prepare?page=profile', {mime: 'video/mp4', size: 100})).status, 400);
});
