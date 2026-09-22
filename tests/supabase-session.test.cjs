const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {createRequire} = require('node:module');

test('Supabase session and background queries return rows through the deployed RPC', async () => {
  const filename = path.resolve(__dirname, '../server/index.cjs');
  const localRequire = createRequire(filename);
  const employee = {id: 'test-employee', status: 'ACTIVE', role_items: {ko: [], en: []}};
  const queries = [];
  const sandbox = {
    module: {exports: {}}, __dirname: path.dirname(filename), console, URL, URLSearchParams, Buffer,
    process: {env: {VERCEL: '1', SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_ROLE_KEY: 'test-only'}},
    require(name) {
      if (name === 'pg') return {Pool: class {}};
      if (name === '@vercel/functions') return {attachDatabasePool() {}};
      return localRequire(name);
    },
    async fetch(url, options) {
      const {query} = JSON.parse(options.body);
      queries.push(query);
      // Model the deployed PostgreSQL ltrim(text): it removes spaces, not LF.
      const returnsRows = /^(select|with) /i.test(query.replace(/^ +/, ''));
      let rows = [];
      if (returnsRows && /FROM (input_sessions|employees)/.test(query)) rows = [employee];
      if (returnsRows && /FROM card_page_backgrounds/.test(query)) rows = [{page: 'profile', asset_id: 'test-media', kind: 'IMAGE', original_name: 'test.png'}];
      return {ok: true, json: async () => rows};
    }
  };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox, {filename});
  let status, payload;
  await sandbox.module.exports({method: 'GET', url: '/api/input/me', headers: {host: 'example.invalid', cookie: 'znus_input_session=test-cookie'}}, {
    writeHead(code) {status = code;}, end(body) {payload = JSON.parse(body);}
  });
  assert.equal(status, 200);
  assert.equal(payload.employee.id, employee.id);
  assert.equal(payload.backgrounds.profile.assetId, 'test-media');
  assert.equal(queries.length, 3);
  assert.ok(queries.every(query => query === query.trim()));
});
