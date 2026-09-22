const http = require('node:http');
const dns = require('node:dns');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');
const { createReadStream, createWriteStream } = require('node:fs');
const { mkdir, stat, readFile } = require('node:fs/promises');
const { pipeline } = require('node:stream/promises');
const Busboy = require('busboy');
const { Pool } = require('pg');
const { attachDatabasePool } = require('@vercel/functions');
const nodemailer = require('nodemailer');
const {
  normalizeEmail, randomToken, hashToken, otpCode, constantTimeEqual
} = require('./security.cjs');

const root = path.resolve(__dirname, '..');
const views = path.join(__dirname, 'views');
const production = process.env.NODE_ENV === 'production';
const vercelRuntime = process.env.VERCEL === '1';
const secureCookies = production || vercelRuntime;
const port = Number(process.env.PORT || 4173);
const sessionHours = Number(process.env.INPUT_SESSION_HOURS || 24);
const otpMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 10);
const allowedDomains = String(process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
const adminAccessKey = String(process.env.ADMIN_ACCESS_KEY || '');
const smtpHost = String(process.env.SMTP_HOST || '').trim();
const smtpUser = String(process.env.SMTP_USER || '').trim();
const smtpPassword = String(process.env.SMTP_PASSWORD || '');
const smtpFrom = String(process.env.SMTP_FROM || smtpUser).trim();
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, '.data'));
const supabaseDatabaseUrl = String(process.env.SUPABASE_DATABASE_URL || '').trim();
const supabaseUrl = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
const supabaseServiceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const supabaseStorageBucket = String(process.env.SUPABASE_STORAGE_BUCKET || 'znus-media').trim();
// Vercel's NODE_ENV can be overridden by a project environment variable.  The
// presence of the Supabase server credentials is the reliable deployment
// signal, so do not let an unexpected NODE_ENV value route Vercel back to the
// legacy PostgreSQL host.
const hasSupabaseHttpCredentials = Boolean(supabaseUrl && supabaseServiceRoleKey);
const useSupabaseHttpDatabase = vercelRuntime && hasSupabaseHttpCredentials;
const useSupabaseDatabase = Boolean(supabaseDatabaseUrl) && !useSupabaseHttpDatabase;
const useSupabaseStorage = vercelRuntime && hasSupabaseHttpCredentials;
const supabaseDatabaseUrlForRuntime = useSupabaseDatabase && vercelRuntime
  ? supabaseDatabaseUrl.replace(/(\.pooler\.supabase\.com):5432(?=\/)/, '$1:6543')
  : supabaseDatabaseUrl;
const cardDesignPath = path.join(root, 'cardDesign', '명함_디자인', 'index.html');
const cardPageSlots = ['profile', 'role', 'contact', 'company', 'links'];
const defaultBackgroundPages = ['role', 'contact', 'company', 'links'];

// Vercel's serverless runtime can prefer an IPv6 DNS result even when the
// Supabase Session Pooler endpoint is intended for IPv4 clients.
if (useSupabaseDatabase && typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}
const publicTokenPattern = /^[A-Za-z0-9_-]{12,30}$/;
const publicCardPath = token => `/${token}`;
const cardPageInfo = {
  profile: {title: '프로필 페이지', description: '이름·영문 이름·프로필 소개가 표시되는 첫 화면입니다.'},
  role: {title: '직무 페이지', description: '부서·직책·주요 업무 5개를 보여주는 화면입니다.'},
  contact: {title: '연락처 페이지', description: '휴대전화·공개 이메일·회사 전화/FAX가 표시되는 화면입니다.'},
  company: {title: '회사 페이지', description: '회사 로고·회사명·주소가 표시되는 화면입니다.'},
  links: {title: '링크 페이지', description: '공유 링크와 QR 코드가 표시되는 마지막 화면입니다.'}
};

if (production && !process.env.DB_PASSWORD && !useSupabaseDatabase && !useSupabaseHttpDatabase) throw new Error('DB_PASSWORD, SUPABASE_DATABASE_URL, or Supabase HTTP credentials are required in production.');
if (production && !allowedDomains.length) throw new Error('ALLOWED_EMAIL_DOMAINS is required in production.');
if (production && !process.env.SMTP_HOST) throw new Error('SMTP_HOST is required in production.');
if (smtpHost && (!smtpUser || !smtpPassword)) {
  throw new Error('SMTP_USER and SMTP_PASSWORD are required when SMTP_HOST is configured.');
}

const dbPoolOptions = useSupabaseDatabase
  ? {
      connectionString: supabaseDatabaseUrlForRuntime,
      ssl: {rejectUnauthorized: false},
      connectionTimeoutMillis: 8000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      idleTimeoutMillis: 5000,
      max: Number(process.env.DB_POOL_MAX || 1)
    }
  : {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || 'znus_cards',
      user: process.env.DB_USER || 'znus',
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? {rejectUnauthorized: false} : undefined,
      connectionTimeoutMillis: 8000,
      max: Number(process.env.DB_POOL_MAX || 10)
    };

function createDbPool() {
  const pool = new Pool(dbPoolOptions);
  if (vercelRuntime) attachDatabasePool(pool);
  return pool;
}

async function supabaseHttpQuery(text, values = []) {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/znus_query`, {
    method: 'POST',
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': 'application/json'
    },
    // The deployed RPC classifies statements with ltrim(), which only removes
    // spaces. Strip JS template-literal newlines before sending every query.
    body: JSON.stringify({query: String(text).trim(), params: values})
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Supabase Data API query failed (${response.status}): ${detail.slice(0, 300)}`);
  }
  const payload = await response.json();
  return {rows: Array.isArray(payload) ? payload : []};
}

let activePool = createDbPool();

function isRetryableDbError(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', '57P01'].includes(code)
    || message.includes('connection timeout')
    || message.includes('connection terminated unexpectedly');
}

async function recycleDbPool() {
  const stalePool = activePool;
  activePool = createDbPool();
  stalePool.end().catch(() => {});
}

async function withDbRetry(operation) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!useSupabaseDatabase || !isRetryableDbError(error) || attempt === 1) throw error;
      await recycleDbPool();
    }
  }
}

const pool = useSupabaseHttpDatabase
  ? {
      query: (text, values) => supabaseHttpQuery(text, values),
      connect: async () => ({query: (text, values) => supabaseHttpQuery(text, values), release() {}})
    }
  : {
      query: (...args) => withDbRetry(() => activePool.query(...args)),
      connect: (...args) => withDbRetry(() => activePool.connect(...args))
    };

function viewHtml(name) {
  return fs.readFileSync(path.join(views, name), 'utf8');
}

function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', ...headers});
  res.end(payload);
}

function redirect(res, location, headers = {}) {
  res.writeHead(303, {'Location': location, 'Cache-Control': 'no-store', ...headers});
  res.end();
}

function supabaseStoragePath(storageKey) {
  return String(storageKey).split('/').map(encodeURIComponent).join('/');
}

function supabaseObjectUrl(storageKey) {
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(supabaseStorageBucket)}/${supabaseStoragePath(storageKey)}`;
}

async function uploadSupabaseObject(storageKey, body, mimeType) {
  if (!useSupabaseStorage) throw new Error('Vercel Supabase Storage 환경변수가 설정되지 않았습니다.');
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(supabaseStorageBucket)}/${supabaseStoragePath(storageKey)}`, {
    method: 'POST',
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      'Content-Type': mimeType,
      'x-upsert': 'true'
    },
    body
  });
  if (!response.ok) throw new Error(`Supabase Storage 업로드 실패 (${response.status})`);
}

async function deleteSupabaseObject(storageKey) {
  if (!useSupabaseStorage) return;
  try {
    await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(supabaseStorageBucket)}/${supabaseStoragePath(storageKey)}`, {
      method: 'DELETE',
      headers: {apikey: supabaseServiceRoleKey, Authorization: `Bearer ${supabaseServiceRoleKey}`}
    });
  } catch (_) { /* 데이터 정리를 위한 부가 작업이므로 원래 요청은 계속 처리합니다. */ }
}

function html(res, status, body, headers = {}) {
  res.writeHead(status, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers});
  res.end(body);
}

function viewAsset(res, name, contentType) {
  const body = fs.readFileSync(path.join(views, name));
  res.writeHead(200, {'Content-Type': contentType, 'Cache-Control': 'public, max-age=300'});
  res.end(body);
}

function cropValue(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(part => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
  }).filter(([key]) => key));
}

function requestUsesHttps(req) {
  return secureCookies || String(req.headers['x-forwarded-proto'] || '')
    .split(',').some(protocol => protocol.trim() === 'https');
}

function sessionCookie(req, token, maxAge) {
  // The Codex in-app browser uses a partitioned browser context. A Lax-only
  // cookie is not restored there after an authentication navigation, whereas
  // a partitioned secure cookie works in both embedded and normal browsers.
  const secure = requestUsesHttps(req);
  return `znus_input_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Max-Age=${maxAge}${secure ? '; Secure; SameSite=None; Partitioned' : '; SameSite=Lax'}`;
}

function expiredCookie(req) {
  const secure = requestUsesHttps(req);
  return 'znus_input_session=; Path=/; HttpOnly; Max-Age=0' + (secure ? '; Secure; SameSite=None; Partitioned' : '; SameSite=Lax');
}

function readJson(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '', size = 0;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > limit) { reject(new Error('요청이 너무 큽니다.')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (_) { reject(new Error('JSON 형식이 올바르지 않습니다.')); }
    });
    req.on('error', reject);
  });
}

function readForm(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let data = '', size = 0;
    req.setEncoding('utf8');
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > limit) { reject(new Error('요청이 너무 큽니다.')); req.destroy(); return; }
      data += chunk;
    });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(data))));
    req.on('error', reject);
  });
}

function assertAllowedEmail(email) {
  if (!allowedDomains.length && !production) return;
  const domain = email.split('@')[1];
  if (!allowedDomains.includes(domain)) throw new Error('등록된 회사 이메일 도메인이 아닙니다.');
}

function validateCardInput(input) {
  const value = input || {};
  const fields = {
    nameKo: String(value.nameKo || '').trim(), nameEn: String(value.nameEn || '').trim(),
    department: String(value.department || '').trim(), jobTitleKo: String(value.jobTitleKo || '').trim(),
    jobTitleEn: String(value.jobTitleEn || '').trim(), mobilePhone: String(value.mobilePhone || '').trim(),
    publicEmail: String(value.publicEmail || '').trim().toLowerCase(),
    rolesKo: Array.isArray(value.rolesKo) ? value.rolesKo.map(String).map(s => s.trim()).filter(Boolean) : [],
    rolesEn: Array.isArray(value.rolesEn) ? value.rolesEn.map(String).map(s => s.trim()).filter(Boolean) : []
  };
  for (const [key, text] of Object.entries(fields)) {
    if (key.startsWith('roles')) continue;
    if (!text) throw new Error(`${key}: 필수 입력입니다.`);
    if (text.length > 500) throw new Error(`${key}: 최대 500자까지 입력할 수 있습니다.`);
  }
  if (fields.rolesKo.length !== 5 || fields.rolesEn.length !== 5) throw new Error('주요 업무는 국문·영문 각각 5개가 필요합니다.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.publicEmail)) throw new Error('공개 이메일 형식을 확인해 주세요.');
  return fields;
}

async function sessionEmployee(req) {
  const raw = parseCookies(req).znus_input_session;
  if (!raw) return null;
  const result = await pool.query(`
    SELECT e.* FROM input_sessions s JOIN employees e ON e.id = s.employee_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND e.status = 'ACTIVE'
  `, [hashToken(raw)]);
  return result.rows[0] || null;
}

function publicEmployee(row) {
  const roles = row.role_items || {ko: [], en: []};
  return {
    id: row.id, companyEmail: row.company_email, nameKo: row.name_ko, nameEn: row.name_en,
    department: row.department, jobTitleKo: row.job_title_ko, jobTitleEn: row.job_title_en,
    mobilePhone: row.mobile_phone, publicEmail: row.public_email,
    rolesKo: roles.ko || [], rolesEn: roles.en || [], publicToken: row.public_token,
    published: row.published
  };
}

async function employeeInputData(employeeId) {
  const employee = (await pool.query('SELECT * FROM employees WHERE id=$1', [employeeId])).rows[0];
  if (!employee) return null;
  const backgrounds = (await pool.query(`
    SELECT b.page, a.id AS asset_id, a.kind, a.original_name, a.mime_type, a.size_bytes, a.created_at
    FROM card_page_backgrounds b
    JOIN media_assets a ON a.id = b.media_asset_id
    WHERE b.employee_id=$1
    ORDER BY CASE b.page
      WHEN 'profile' THEN 1 WHEN 'role' THEN 2 WHEN 'contact' THEN 3
      WHEN 'company' THEN 4 WHEN 'links' THEN 5 ELSE 6 END
  `, [employeeId])).rows;
  return {
    employee: publicEmployee(employee),
    pageDefinitions: cardPageSlots.map(slot => ({slot, ...cardPageInfo[slot]})),
    backgrounds: Object.fromEntries(backgrounds.map(asset => [asset.page, {
      assetId: asset.asset_id, kind: asset.kind, originalName: asset.original_name,
      mimeType: asset.mime_type, sizeBytes: Number(asset.size_bytes), createdAt: asset.created_at
    }]))
  };
}

async function sendOtp(email, code) {
  if (!smtpHost) {
    console.log(`[OTP development only] ${email}: ${code}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: smtpHost, port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {user: smtpUser, pass: smtpPassword}
  });
  await transporter.sendMail({
    from: smtpFrom,
    to: email, subject: '[ZNUS] 디지털 명함 인증번호',
    text: `ZNUS 디지털 명함 입력 인증번호는 ${code} 입니다. ${otpMinutes}분 안에 입력해 주세요.`
  });
}

async function requestOtp(req, res) {
  const input = await readJson(req);
  const email = normalizeEmail(input.email);
  assertAllowedEmail(email);
  const recent = (await pool.query(`SELECT count(*)::int AS count FROM otp_challenges WHERE email=$1 AND created_at > now() - interval '1 minute'`, [email])).rows[0];
  if (recent && recent.count >= 3) throw new Error('인증번호는 1분에 3번까지만 요청할 수 있습니다.');
  const code = otpCode();
  await pool.query(`UPDATE otp_challenges SET consumed_at = now() WHERE email = $1 AND consumed_at IS NULL`, [email]);
  await pool.query(`INSERT INTO otp_challenges(id, email, code_hash, expires_at) VALUES($1, $2, $3, now() + ($4 * interval '1 minute'))`, [crypto.randomUUID(), email, hashToken(code), otpMinutes]);
  await sendOtp(email, code);
  const body = {message: '인증번호를 입력한 이메일로 보냈습니다.'};
  json(res, 200, body);
}

async function verifyOtp(req, res) {
  const formPost = String(req.headers['content-type'] || '').toLowerCase().startsWith('application/x-www-form-urlencoded');
  try {
    const input = formPost ? await readForm(req) : await readJson(req);
    const email = normalizeEmail(input.email), code = String(input.code || '').trim();
    if (!/^\d{6}$/.test(code)) throw new Error('6자리 인증번호를 입력해 주세요.');
    const challenge = (await pool.query(`SELECT * FROM otp_challenges WHERE email = $1 AND consumed_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, [email])).rows[0];
    if (!challenge || challenge.attempts >= 5 || !constantTimeEqual(challenge.code_hash, hashToken(code))) {
      if (challenge) await pool.query(`UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1`, [challenge.id]);
      throw new Error('인증번호가 올바르지 않거나 만료되었습니다.');
    }
    await pool.query(`UPDATE otp_challenges SET consumed_at = now() WHERE id = $1`, [challenge.id]);
    let employee = (await pool.query(`SELECT * FROM employees WHERE company_email = $1`, [email])).rows[0];
    if (employee && employee.status !== 'ACTIVE') throw new Error('비활성화된 직원입니다. 관리자에게 문의해 주세요.');
    if (!employee) employee = (await pool.query(`INSERT INTO employees(id, company_email, public_token) VALUES($1, $2, $3) RETURNING *`, [crypto.randomUUID(), email, randomToken(12)])).rows[0];
    const rawSession = randomToken(32), maxAge = sessionHours * 60 * 60;
    await pool.query(`INSERT INTO input_sessions(id, token_hash, employee_id, expires_at) VALUES($1, $2, $3, now() + ($4 * interval '1 second'))`, [crypto.randomUUID(), hashToken(rawSession), employee.id, maxAge]);
    await pool.query(`INSERT INTO audit_logs(employee_id, action) VALUES($1, $2)`, [employee.id, 'INPUT_ACCESS_VERIFIED']);
    if (formPost) return redirect(res, '/input?edit=1', {'Set-Cookie': sessionCookie(req, rawSession, maxAge)});
    json(res, 200, {employee: publicEmployee(employee)}, {'Set-Cookie': sessionCookie(req, rawSession, maxAge)});
  } catch (error) {
    if (formPost) return redirect(res, '/input?auth_error=' + encodeURIComponent(error.message || '요청을 처리하지 못했습니다.'));
    throw error;
  }
}

async function saveEmployee(req, res) {
  const employee = await sessionEmployee(req);
  if (!employee) return json(res, 401, {error: '입력 세션이 없거나 만료되었습니다.'}, {'Set-Cookie': expiredCookie(req)});
  const input = validateCardInput(await readJson(req));
  const profileAsset = (await pool.query(`
    SELECT a.id
    FROM card_page_backgrounds b JOIN media_assets a ON a.id=b.media_asset_id
    WHERE b.employee_id=$1 AND b.page='profile'
  `, [employee.id])).rows[0];
  if (!profileAsset) throw new Error('프로필 페이지의 배경 이미지 또는 MP4 영상을 먼저 업로드해 주세요.');
  const roleItems = JSON.stringify({ko: input.rolesKo, en: input.rolesEn});
  const saved = (await pool.query(`
    UPDATE employees SET name_ko=$1, name_en=$2, department=$3, job_title_ko=$4, job_title_en=$5,
      mobile_phone=$6, public_email=$7, role_items=$8::jsonb, published=true, updated_at=now()
    WHERE id=$9 AND status='ACTIVE' RETURNING *
  `, [input.nameKo, input.nameEn, input.department, input.jobTitleKo, input.jobTitleEn, input.mobilePhone, input.publicEmail, roleItems, employee.id])).rows[0];
  await pool.query(`INSERT INTO audit_logs(employee_id, action, metadata) VALUES($1, $2, $3::jsonb)`, [employee.id, 'EMPLOYEE_CARD_SAVED', JSON.stringify({published: true})]);
  json(res, 200, {employee: publicEmployee(saved)}, {'Set-Cookie': expiredCookie(req)});
}

async function uploadMedia(req, res, slot) {
  const employee = await sessionEmployee(req);
  if (!employee) return json(res, 401, {error: '입력 세션이 없거나 만료되었습니다.'});
  if (!['profile', 'role', 'contact', 'company', 'links'].includes(slot)) return json(res, 400, {error: '업로드 슬롯이 올바르지 않습니다.'});
  if (!String(req.headers['content-type'] || '').startsWith('multipart/form-data')) return json(res, 415, {error: 'multipart/form-data 업로드가 필요합니다.'});
  if (vercelRuntime && !useSupabaseStorage) throw new Error('Vercel Supabase Storage 환경변수가 설정되지 않았습니다.');
  const uploadDataDir = useSupabaseStorage ? path.join(os.tmpdir(), 'znus-card-service') : dataDir;
  await mkdir(path.join(uploadDataDir, 'uploads', employee.id), {recursive: true});
  const upload = await new Promise((resolve, reject) => {
    const bb = Busboy({headers: req.headers, limits: {files: 1, fileSize: 30 * 1024 * 1024}});
    let result = null, writePromise = null, tooLarge = false, uploadedToSupabase = false;
    const crop = {x: 50, y: 50, scale: 1};
    bb.on('field', (name, value) => {
      if (name === 'cropX') crop.x = cropValue(value, 50, 0, 100);
      if (name === 'cropY') crop.y = cropValue(value, 50, 0, 100);
      if (name === 'cropScale') crop.scale = cropValue(value, 1, 1, 2);
    });
    bb.on('file', (field, file, info) => {
      const mime = String(info.mimeType || '').toLowerCase();
      const image = ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
      const video = mime === 'video/mp4';
      if (!image && !video) { file.resume(); reject(new Error('JPG, PNG, WEBP 이미지 또는 MP4 영상만 업로드할 수 있습니다.')); return; }
      const extension = image ? mime.split('/')[1].replace('jpeg', 'jpg') : 'mp4';
      const relative = path.join('uploads', employee.id, `${crypto.randomUUID()}.${extension}`);
      const absolute = path.join(uploadDataDir, relative);
      result = {relative: relative.replaceAll(path.sep, '/'), absolute, mime, kind: image ? 'IMAGE' : 'VIDEO', name: info.filename || `${slot}.${extension}`};
      file.on('limit', () => {tooLarge = true;});
      writePromise = pipeline(file, createWriteStream(absolute));
    });
    bb.on('finish', async () => {
      try {
        if (writePromise) await writePromise;
        if (tooLarge) throw new Error('파일은 30MB 이하만 업로드할 수 있습니다.');
        if (!result) throw new Error('업로드 파일이 없습니다.');
        const sizeBytes = (await stat(result.absolute)).size;
        if (useSupabaseStorage) {
          await uploadSupabaseObject(result.relative, await readFile(result.absolute), result.mime);
          uploadedToSupabase = true;
        }
        const assetId = crypto.randomUUID();
        const asset = (await pool.query(`INSERT INTO media_assets(id, employee_id, slot, kind, storage_key, original_name, mime_type, size_bytes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [assetId, employee.id, slot, result.kind, result.relative, result.name, result.mime, sizeBytes])).rows[0];
        if (cardPageSlots.includes(slot)) {
          await pool.query(`
            INSERT INTO card_page_backgrounds(id, employee_id, page, media_asset_id, crop_x, crop_y, crop_scale)
            VALUES($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (employee_id, page)
            DO UPDATE SET media_asset_id=EXCLUDED.media_asset_id, crop_x=EXCLUDED.crop_x, crop_y=EXCLUDED.crop_y, crop_scale=EXCLUDED.crop_scale, created_at=now()
          `, [crypto.randomUUID(), employee.id, slot, asset.id, crop.x, crop.y, crop.scale]);
        }
        resolve({assetId: asset.id, url: `/media/${asset.id}`, kind: result.kind});
      } catch (error) {
        if (uploadedToSupabase && result) await deleteSupabaseObject(result.relative);
        if (result) try { require('node:fs').unlinkSync(result.absolute); } catch (_) {}
        reject(error);
      }
    });
    bb.on('error', reject);
    req.pipe(bb);
  });
  await pool.query(`INSERT INTO audit_logs(employee_id, action, metadata) VALUES($1, $2, $3::jsonb)`, [employee.id, 'MEDIA_UPLOADED', JSON.stringify({slot})]);
  json(res, 201, upload);
}

async function publicCard(res, token) {
  const data = await publicCardData(token);
  if (!data) return json(res, 404, {error: '명함을 찾을 수 없습니다.'});
  const {row, settings} = data;
  const roles = row.role_items || {ko: [], en: []};
  const media = Object.fromEntries(data.assets.map(asset => [asset.slot, {url: `/media/${asset.id}`, kind: asset.kind, cropX: asset.crop_x, cropY: asset.crop_y, cropScale: asset.crop_scale}]));
  json(res, 200, {nameKo: row.name_ko, nameEn: row.name_en, department: row.department, jobTitleKo: row.job_title_ko,
    jobTitleEn: row.job_title_en, mobilePhone: row.mobile_phone, publicEmail: row.public_email, roles,
    companyName: settings.company_name, companyWebsite: settings.company_website, companyPhone: settings.company_phone,
    companyFax: settings.company_fax, companyAddress: settings.office_address, publicToken: row.public_token, media});
}

async function publicCardData(token) {
  if (!publicTokenPattern.test(token)) return null;
  const row = (await pool.query(`SELECT * FROM employees WHERE public_token=$1 AND status='ACTIVE' AND published=true`, [token])).rows[0];
  if (!row) return null;
  const settings = (await pool.query(`SELECT * FROM company_settings WHERE id=true`)).rows[0] || {};
  const assets = (await pool.query(`
    SELECT a.id, b.page::text AS slot, a.kind, b.crop_x, b.crop_y, b.crop_scale
    FROM card_page_backgrounds b JOIN media_assets a ON a.id=b.media_asset_id
    WHERE b.employee_id=$1
    UNION ALL
    SELECT a.id, d.page::text AS slot, a.kind, d.crop_x, d.crop_y, d.crop_scale
    FROM card_page_default_backgrounds d JOIN media_assets a ON a.id=d.media_asset_id
    WHERE d.page <> 'profile' AND NOT EXISTS (
      SELECT 1 FROM card_page_backgrounds b
      WHERE b.employee_id=$1 AND b.page=d.page
    )
    UNION ALL
    SELECT id, slot, kind, 50::double precision AS crop_x, 50::double precision AS crop_y, 1::double precision AS crop_scale
    FROM (
      SELECT DISTINCT ON (slot) id, slot::text AS slot, kind
      FROM media_assets
      WHERE employee_id=$1 AND slot='logo'
      ORDER BY slot, created_at DESC
    ) latest_logo
  `, [row.id])).rows;
  return {row, settings, assets};
}

function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function renderCardHtml(data) {
  const cardDesignHtml = fs.readFileSync(cardDesignPath, 'utf8');
  const {row, settings, assets} = data;
  const roles = row.role_items || {ko: [], en: []};
  const card = {nameKo: row.name_ko, nameEn: row.name_en, department: row.department,
    jobTitleKo: row.job_title_ko, jobTitleEn: row.job_title_en, mobilePhone: row.mobile_phone,
    publicEmail: row.public_email, publicUrl: publicCardPath(row.public_token), companyName: settings.company_name,
    companyWebsite: settings.company_website, companyPhone: settings.company_phone, companyFax: settings.company_fax,
    companyAddress: settings.office_address, slogans: [settings.slogan_line_1, settings.slogan_line_2, settings.slogan_line_3],
    roles, media: Object.fromEntries(assets.map(asset => [asset.slot, {url: `/media/${asset.id}`, kind: asset.kind, cropX: asset.crop_x, cropY: asset.crop_y, cropScale: asset.crop_scale}]))};
  const bootstrap = `<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script><script>window.__ZNUS_CARD__=${safeJson(card)};</script><script>\n(() => {\n  const d=window.__ZNUS_CARD__; const text=(s,v)=>{if(s){s.textContent=v||'';}};\n  text(document.querySelector('#intro-person strong'),d.nameKo); text(document.querySelector('#intro-person .en'),d.nameEn); text(document.querySelector('#intro-hint .en'),d.companyName);\n  text(document.querySelector('.profile-name h1'),d.nameKo); text(document.querySelector('.profile-name p'),d.nameEn);\n  text(document.querySelector('.role-text .eyebrow'),d.department); const roleTitle=document.querySelector('.role-text h2'); if(roleTitle){roleTitle.dataset.ko=d.jobTitleKo||'';roleTitle.dataset.en=d.jobTitleEn||'';text(roleTitle,d.jobTitleKo);}\n  const items=document.querySelectorAll('.role-list li'); items.forEach((item,i)=>{const ko=(d.roles.ko||[])[i]||'';item.dataset.ko=ko;item.dataset.en=(d.roles.en||[])[i]||'';text(item,ko);});\n  const phone=document.querySelector('.phone-number'); if(phone){const digits=String(d.mobilePhone||'').replace(/\\D/g,'');const match=digits.match(/^(\\d{3})(\\d{3,4})(\\d{4})$/);const display=match?match[1]+' '+match[2]+' '+match[3]:(d.mobilePhone||'');text(phone,display);phone.href='tel:'+digits;}\n  const contact=document.querySelectorAll('.contact-details .contact-link'); if(contact[0]){contact[0].textContent=d.publicEmail||'';contact[0].dataset.copy=d.publicEmail||'';}\n  if(contact[1]){contact[1].textContent='FAX  '+(d.companyFax||'');contact[1].dataset.copy=d.companyFax||'';}\n  if(contact[2]){contact[2].textContent='TEL  '+(d.companyPhone||'');contact[2].href='tel:'+d.companyPhone;}\n  const logo=document.querySelector('.company-logo'); if(logo&&d.companyName)logo.alt=d.companyName;\n  const slogan=document.querySelectorAll('.slogan span'); (d.slogans||[]).forEach((v,i)=>text(slogan[i],v));\n  const address=document.querySelector('.modal-card .address'); text(address,d.companyAddress);\n  async function downloadCardImage(){\n    if(document.fonts&&document.fonts.ready)await document.fonts.ready;\n    const canvas=document.createElement('canvas'); canvas.width=626; canvas.height=1110;\n    const ctx=canvas.getContext('2d');\n    const gradient=ctx.createLinearGradient(0,0,626,1110); gradient.addColorStop(0,'#060D15'); gradient.addColorStop(1,'#002041'); ctx.fillStyle=gradient; ctx.fillRect(0,0,626,1110);\n    const fit=(value,x,y,size,color,weight,align,max)=>{value=String(value||'');ctx.fillStyle=color;ctx.textAlign=align||'left';ctx.font=(weight||400)+' '+size+'px Paperozi, sans-serif';while(ctx.measureText(value).width>(max||540)&&size>12){size-=1;ctx.font=(weight||400)+' '+size+'px Paperozi, sans-serif';}ctx.fillText(value,x,y);};\n    const phoneDigits=String(d.mobilePhone||'').replace(/\\D/g,''); const phoneMatch=phoneDigits.match(/^(\\d{3})(\\d{3,4})(\\d{4})$/); const phonePrefix=phoneMatch?.[1]||phoneDigits.slice(0,3); const phoneMiddle=phoneMatch?.[2]||phoneDigits.slice(3,-4); const phoneLast=phoneMatch?.[3]||phoneDigits.slice(-4);\n    fit(d.nameKo,38,120,86,'#fff',500,'left',475); fit(d.nameEn,38,174,42,'#91a0b3',400,'left',475); fit(d.jobTitleKo,38,239,50,'#c1c2c4',400,'left',475);\n    fit(phonePrefix,582,360,92,'#91a0b3',300,'right',540); fit(phoneMiddle,582,525,188,'#fff',300,'right',540); fit(phoneLast,582,692,188,'#fff',300,'right',540);\n    const email=String(d.publicEmail||''); const at=email.lastIndexOf('@'); fit(at>0?email.slice(0,at):email,582,820,75,'#fff',600,'right',540); fit(at>0?email.slice(at):'',582,870,38,'#91a0b3',400,'right',540);\n    const formatPhone=(value)=>{const digits=String(value||'').replace(/\\D/g,''); if(/^\\d{3}\\d{3}\\d{4}$/.test(digits))return digits.replace(/^(\\d{3})(\\d{3})(\\d{4})$/,'$1.$2.$3'); if(/^\\d{3}\\d{4}\\d{4}$/.test(digits))return digits.replace(/^(\\d{3})(\\d{4})(\\d{4})$/,'$1.$2.$3'); return String(value||'');}; fit('T',43,972,26,'#fff',700,'left',40); fit(formatPhone(d.companyPhone),91,972,26,'#91a0b3',400,'left',495); fit('F',43,1019,26,'#fff',700,'left',40); fit(formatPhone(d.companyFax),91,1019,26,'#91a0b3',400,'left',495); fit('A',43,1066,26,'#fff',700,'left',40); fit(d.companyAddress,91,1066,26,'#91a0b3',400,'left',495);\n    try{const logo=new Image(); logo.src='/assets/logo_s_aw.svg'; await logo.decode(); const scale=Math.min(40/logo.width,40/logo.height); ctx.drawImage(logo,540,43,logo.width*scale,logo.height*scale);}catch{}\n    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')); if(!blob)throw Error('PNG 변환 실패');\n    const url=URL.createObjectURL(blob); const link=document.createElement('a'); link.href=url; link.download=(d.nameKo||'명함')+'-명함.png'; link.click(); setTimeout(()=>URL.revokeObjectURL(url),10000);\n  }\n  const downloadLink=document.querySelector('.link-actions a[download]'); if(downloadLink){downloadLink.addEventListener('click',event=>{event.preventDefault();downloadCardImage().catch(()=>alert('명함 이미지를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.'));});}\n  const slotNames=['profile','role','contact','company','links']; slotNames.forEach((slot,i)=>{const media=d.media&&d.media[slot]; const section=document.querySelectorAll('.screen-card')[i]; if(!media||!section)return; const box=section.querySelector('.card-media'); if(media.kind==='IMAGE'){box.innerHTML='<img src="'+media.url+'" alt="" style="width:100%;height:100%;object-fit:cover">';}else{const source=box.querySelector('source');if(source){source.src=media.url;const video=box.querySelector('video');if(video){video.load();video.play().catch(()=>{});}}}});\n})();\n</script>`;
  const cropBootstrap = `<script>requestAnimationFrame(()=>{const d=window.__ZNUS_CARD__;['profile','role','contact','company','links'].forEach((slot,i)=>{const media=d.media&&d.media[slot];const section=document.querySelectorAll('.screen-card')[i];const element=section&&section.querySelector('.card-media img,.card-media video');if(element&&media){element.style.objectPosition=(media.cropX??50)+'% '+(media.cropY??50)+'%';element.style.transform='scale('+(media.cropScale??1)+')';element.style.transformOrigin='center';}});});</script>`;
  return cardDesignHtml
    .replace('__ZNUS_CARD_TOKEN__', row.public_token)
    .replaceAll('assets/', '/assets/')
    .replace('<script src="qrcode.min.js"></script>', bootstrap + cropBootstrap);
}

async function cardManifest(res, token) {
  const data = await publicCardData(token);
  if (!data) return json(res, 404, {error: '파일을 찾을 수 없습니다.'});
  const companyName = String(data.settings.company_name || 'ZNUS').trim() || 'ZNUS';
  return json(res, 200, {
    name: `${companyName} 디지털 명함`,
    short_name: companyName,
    start_url: publicCardPath(token),
    scope: publicCardPath(token),
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#050505',
    background_color: '#050505',
    icons: [
      {src: '/assets/logo_s_v.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable'}
    ]
  });
}

async function adminEmployees(req, res) {
  if (!adminAccessKey || req.headers['x-admin-key'] !== adminAccessKey)
    return json(res, 401, {error: '관리자 인증이 필요합니다.'});
  const rows = (await pool.query(`SELECT * FROM employees ORDER BY created_at DESC`)).rows;
  const backgrounds = (await pool.query(`
    SELECT b.employee_id, b.page, a.kind
    FROM card_page_backgrounds b JOIN media_assets a ON a.id=b.media_asset_id
    ORDER BY b.employee_id, b.page
  `)).rows;
  const backgroundMap = new Map();
  for (const background of backgrounds) {
    if (!backgroundMap.has(background.employee_id)) backgroundMap.set(background.employee_id, []);
    backgroundMap.get(background.employee_id).push({type: background.page, mode: background.kind});
  }
  json(res, 200, rows.map(row => {
    const roles = row.role_items || {ko: [], en: []};
    return {employeeId: row.id, name: row.name_ko, nameEn: row.name_en, department: row.department,
      position: row.job_title_ko, positionEn: row.job_title_en, phone: row.mobile_phone, email: row.public_email,
      accountEmail: row.company_email, mobileUrl: row.status === 'ACTIVE' && row.published ? publicCardPath(row.public_token) : '',
      status: row.status === 'DELETED' ? '삭제됨' : (row.status === 'INACTIVE' ? '비활성' : (row.published ? '생성완료' : '입력완료')), missingFields: [], errorMessage: '', updatedAt: row.updated_at,
      roles: (roles.ko || []).map((ko, index) => ({ko, en: (roles.en || [])[index] || ''})), backgrounds: backgroundMap.get(row.id) || []};
  }));
}

async function withTransaction(work) {
  // Each Supabase Data API RPC call runs atomically in PostgreSQL, but cannot
  // issue explicit BEGIN/COMMIT statements from inside the RPC function.
  // Keep the same query interface for admin mutations without sending
  // unsupported transaction-control commands through the HTTP fallback.
  if (useSupabaseHttpDatabase) return work(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function adminEmployeeAction(req, res, id) {
  if (!adminAccessKey || req.headers['x-admin-key'] !== adminAccessKey) return json(res, 401, {error: '관리자 인증이 필요합니다.'});
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 404, {error: '직원을 찾을 수 없습니다.'});
  const {action} = req.method === 'DELETE' ? {action: 'delete'} : await readJson(req);
  const row = (await pool.query(`SELECT id, public_token, status FROM employees WHERE id=$1`, [id])).rows[0];
  if (!row) return json(res, 404, {error: '직원을 찾을 수 없습니다.'});
  const changes = {publish: {status: 'ACTIVE', published: true}, private: {status: 'ACTIVE', published: false}, enable: {status: 'ACTIVE', published: row.published}, disable: {status: 'INACTIVE', published: false}, recover: {status: 'ACTIVE', published: false}}[action];
  if (action === 'delete') {
    await withTransaction(async (client) => {
      await client.query(`INSERT INTO deleted_tokens(public_token) VALUES($1) ON CONFLICT DO NOTHING`, [row.public_token]);
      await client.query(`UPDATE employees SET status='DELETED', published=false, updated_at=now() WHERE id=$1`, [id]);
      await client.query(`DELETE FROM input_sessions WHERE employee_id=$1`, [id]);
      await client.query(`INSERT INTO audit_logs(employee_id, action) VALUES($1, 'EMPLOYEE_DELETED')`, [id]);
    });
  } else if (action === 'recover') {
    await withTransaction(async (client) => {
      await client.query(`INSERT INTO deleted_tokens(public_token) VALUES($1) ON CONFLICT DO NOTHING`, [row.public_token]);
      await client.query(`UPDATE employees SET public_token=$1, status='ACTIVE', published=false, updated_at=now() WHERE id=$2`, [randomToken(12), id]);
      await client.query(`INSERT INTO audit_logs(employee_id, action) VALUES($1, 'EMPLOYEE_RECOVERED')`, [id]);
    });
  } else {
    if (!changes) return json(res, 400, {error: '지원하지 않는 상태 변경입니다.'});
    await pool.query(`UPDATE employees SET status=$1, published=$2, updated_at=now() WHERE id=$3`, [changes.status, changes.published, id]);
    await pool.query(`INSERT INTO audit_logs(employee_id, action, metadata) VALUES($1, 'EMPLOYEE_STATE_CHANGED', $2::jsonb)`, [id, JSON.stringify({action})]);
  }
  json(res, 200, {ok: true});
}

async function companySettings(req, res) {
  if (!adminAccessKey || req.headers['x-admin-key'] !== adminAccessKey) return json(res, 401, {error: '관리자 인증이 필요합니다.'});
  if (req.method === 'GET') return json(res, 200, (await pool.query(`SELECT * FROM company_settings WHERE id=true`)).rows[0] || {});
  const input = await readJson(req);
  const website = String(input.companyWebsite || '').trim();
  if (website && !/^https?:\/\//i.test(website)) return json(res, 400, {error: '회사 홈페이지 URL을 확인해 주세요.'});
  const values = [String(input.companyName || '').trim(), website, String(input.companyPhone || '').trim(), String(input.companyFax || '').trim(), String(input.officeAddress || '').trim(), String(input.sloganLine1 || '').trim(), String(input.sloganLine2 || '').trim(), String(input.sloganLine3 || '').trim()];
  const saved = (await pool.query(`UPDATE company_settings SET company_name=$1, company_website=$2, company_phone=$3, company_fax=$4, office_address=$5, slogan_line_1=$6, slogan_line_2=$7, slogan_line_3=$8, updated_at=now() WHERE id=true RETURNING *`, values)).rows[0];
  json(res, 200, saved);
}

async function adminDefaultBackgrounds(req, res) {
  if (!adminAccessKey || req.headers['x-admin-key'] !== adminAccessKey) return json(res, 401, {error: '관리자 인증이 필요합니다.'});
  const rows = (await pool.query(`
    SELECT d.page, a.id, a.kind, a.original_name, a.mime_type, a.size_bytes, a.created_at, d.crop_x, d.crop_y, d.crop_scale
    FROM card_page_default_backgrounds d JOIN media_assets a ON a.id=d.media_asset_id
    ORDER BY CASE d.page
      WHEN 'profile' THEN 1 WHEN 'role' THEN 2 WHEN 'contact' THEN 3
      WHEN 'company' THEN 4 WHEN 'links' THEN 5 ELSE 6 END
  `)).rows;
  return json(res, 200, Object.fromEntries(rows.map(row => [row.page, {
    page: row.page, kind: row.kind, originalName: row.original_name, mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes), createdAt: row.created_at, url: '/media/' + row.id,
    cropX: row.crop_x, cropY: row.crop_y, cropScale: row.crop_scale
  }])));
}

async function uploadDefaultBackground(req, res, page) {
  if (!adminAccessKey || req.headers['x-admin-key'] !== adminAccessKey) return json(res, 401, {error: '관리자 인증이 필요합니다.'});
  if (!defaultBackgroundPages.includes(page)) return json(res, 400, {error: '프로필은 기본 배경을 사용할 수 없습니다.'});
  if (!String(req.headers['content-type'] || '').startsWith('multipart/form-data')) return json(res, 415, {error: 'multipart/form-data 업로드가 필요합니다.'});
  if (vercelRuntime && !useSupabaseStorage) throw new Error('Vercel Supabase Storage 환경변수가 설정되지 않았습니다.');
  const uploadDataDir = useSupabaseStorage ? path.join(os.tmpdir(), 'znus-card-service') : dataDir;
  await mkdir(path.join(uploadDataDir, 'defaults'), {recursive: true});
  const upload = await new Promise((resolve, reject) => {
    const bb = Busboy({headers: req.headers, limits: {files: 1, fileSize: 30 * 1024 * 1024}});
    let result = null, writePromise = null, tooLarge = false, uploadedToSupabase = false;
    const crop = {x: 50, y: 50, scale: 1};
    bb.on('field', (name, value) => {
      if (name === 'cropX') crop.x = cropValue(value, 50, 0, 100);
      if (name === 'cropY') crop.y = cropValue(value, 50, 0, 100);
      if (name === 'cropScale') crop.scale = cropValue(value, 1, 1, 2);
    });
    bb.on('file', (field, file, info) => {
      const mime = String(info.mimeType || '').toLowerCase();
      const image = ['image/jpeg', 'image/png', 'image/webp'].includes(mime);
      const video = mime === 'video/mp4';
      if (!image && !video) { file.resume(); reject(new Error('JPG, PNG, WEBP 이미지 또는 MP4 영상만 업로드할 수 있습니다.')); return; }
      const extension = image ? mime.split('/')[1].replace('jpeg', 'jpg') : 'mp4';
      const relative = path.join('defaults', crypto.randomUUID() + '.' + extension);
      const absolute = path.join(uploadDataDir, relative);
      result = {relative: relative.replaceAll(path.sep, '/'), absolute, mime, kind: image ? 'IMAGE' : 'VIDEO', name: info.filename || page + '.' + extension};
      file.on('limit', () => {tooLarge = true;});
      writePromise = pipeline(file, createWriteStream(absolute));
    });
    bb.on('finish', async () => {
      try {
        if (writePromise) await writePromise;
        if (tooLarge) throw new Error('파일은 30MB 이하만 업로드할 수 있습니다.');
        if (!result) throw new Error('업로드 파일이 없습니다.');
        const sizeBytes = (await stat(result.absolute)).size;
        if (useSupabaseStorage) {
          await uploadSupabaseObject(result.relative, await readFile(result.absolute), result.mime);
          uploadedToSupabase = true;
        }
        const assetId = crypto.randomUUID();
        const old = (await pool.query(`SELECT d.media_asset_id, a.storage_key FROM card_page_default_backgrounds d JOIN media_assets a ON a.id=d.media_asset_id WHERE d.page=$1`, [page])).rows[0];
        await withTransaction(async (client) => {
          await client.query(`INSERT INTO media_assets(id, employee_id, slot, kind, storage_key, original_name, mime_type, size_bytes) VALUES($1,NULL,$2,$3,$4,$5,$6,$7)`, [assetId, page, result.kind, result.relative, result.name, result.mime, sizeBytes]);
          await client.query(`INSERT INTO card_page_default_backgrounds(id, page, media_asset_id, crop_x, crop_y, crop_scale) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT (page) DO UPDATE SET media_asset_id=EXCLUDED.media_asset_id, crop_x=EXCLUDED.crop_x, crop_y=EXCLUDED.crop_y, crop_scale=EXCLUDED.crop_scale, created_at=now()`, [crypto.randomUUID(), page, assetId, crop.x, crop.y, crop.scale]);
          if (old) await client.query(`DELETE FROM media_assets WHERE id=$1`, [old.media_asset_id]);
        });
        if (old?.storage_key) {
          if (useSupabaseStorage) await deleteSupabaseObject(old.storage_key);
          else try { require('node:fs').unlinkSync(path.resolve(dataDir, old.storage_key)); } catch (_) {}
        }
        resolve({page, assetId, url: '/media/' + assetId, kind: result.kind});
      } catch (error) {
        if (uploadedToSupabase && result) await deleteSupabaseObject(result.relative);
        if (result) try { require('node:fs').unlinkSync(result.absolute); } catch (_) {}
        reject(error);
      }
    });
    bb.on('error', reject);
    req.pipe(bb);
  });
  json(res, 201, upload);
}
async function serveMedia(req, res, id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(res, 404, {error: '파일을 찾을 수 없습니다.'});
  const asset = (await pool.query(`SELECT a.* FROM media_assets a LEFT JOIN employees e ON e.id=a.employee_id LEFT JOIN card_page_default_backgrounds d ON d.media_asset_id=a.id WHERE a.id=$1 AND ((e.status='ACTIVE' AND e.published=true) OR d.media_asset_id IS NOT NULL)`, [id])).rows[0];
  if (!asset) return json(res, 404, {error: '파일을 찾을 수 없습니다.'});
  if (useSupabaseStorage) {
    res.writeHead(302, {'Location': supabaseObjectUrl(asset.storage_key), 'Cache-Control': 'public, max-age=300'});
    return res.end();
  }
  const absolute = path.resolve(dataDir, asset.storage_key);
  if (!absolute.startsWith(path.resolve(dataDir) + path.sep) || !fs.existsSync(absolute)) return json(res, 404, {error: '파일을 찾을 수 없습니다.'});
  return serveVideoFile(req, res, absolute, asset.mime_type, 'public, max-age=300');
}

function serveVideoFile(req, res, absolute, mime, cacheControl) {
  const size = fs.statSync(absolute).size;
  const range = req.headers.range;
  const commonHeaders = {
    'Content-Type': mime,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControl
  };

  if (!range) {
    res.writeHead(200, {...commonHeaders, 'Content-Length': size});
    return createReadStream(absolute).pipe(res);
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match) {
    res.writeHead(416, {...commonHeaders, 'Content-Range': `bytes */${size}`});
    return res.end();
  }

  let start;
  let end;
  if(match[1]){
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }else{
    const suffixLength = Number(match[2]);
    start = suffixLength > 0 ? Math.max(size - suffixLength, 0) : size;
    end = size - 1;
  }
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
    res.writeHead(416, {...commonHeaders, 'Content-Range': `bytes */${size}`});
    return res.end();
  }
  end = Math.min(end, size - 1);
  const length = end - start + 1;
  res.writeHead(206, {
    ...commonHeaders,
    'Content-Length': length,
    'Content-Range': `bytes ${start}-${end}/${size}`
  });
  return createReadStream(absolute, {start, end}).pipe(res);
}

function serveAsset(req, res, name) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return json(res, 404, {error: '파일을 찾을 수 없습니다.'});
  const absolute = path.join(root, 'cardDesign', '명함_디자인', 'assets', name);
  if (!absolute.startsWith(path.resolve(root, 'cardDesign', '명함_디자인', 'assets') + path.sep) || !fs.existsSync(absolute)) return json(res, 404, {error: '파일을 찾을 수 없습니다.'});
  const mime = {'.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.mp4': 'video/mp4'}[path.extname(name).toLowerCase()] || 'application/octet-stream';
  return mime === 'video/mp4'
    ? serveVideoFile(req, res, absolute, mime, 'public, max-age=3600')
    : (() => {
      res.writeHead(200, {'Content-Type': mime, 'Cache-Control': 'public, max-age=3600'});
      return createReadStream(absolute).pipe(res);
    })();
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/healthz') {
    await pool.query('SELECT 1'); return json(res, 200, {ok: true});
  }
  if (req.method === 'GET' && url.pathname === '/input') {
    const editMode = url.searchParams.get('edit') === '1';
    return html(res, 200, viewHtml('input.html'), editMode ? {} : {'Set-Cookie': expiredCookie(req)});
  }
  if (req.method === 'GET' && url.pathname === '/input/complete') return html(res, 200, viewHtml('complete.html'));
  if (req.method === 'GET' && url.pathname === '/admin') return html(res, 200, viewHtml('admin.html'));
  if (req.method === 'GET' && url.pathname === '/media-cropper.js') return viewAsset(res, 'media-cropper.js', 'text/javascript; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/media-cropper.css') return viewAsset(res, 'media-cropper.css', 'text/css; charset=utf-8');
  if (req.method === 'GET' && /^\/(?:c\/)?[A-Za-z0-9_-]{12,30}\/manifest\.webmanifest$/.test(url.pathname)) {
    return cardManifest(res, url.pathname.split('/').at(-2));
  }
  if (req.method === 'GET' && /^\/c\/[A-Za-z0-9_-]{12,30}$/.test(url.pathname)) {
    const token = decodeURIComponent(url.pathname.split('/').pop());
    if (publicTokenPattern.test(token)) {
      res.writeHead(308, {'Location': publicCardPath(token), 'Cache-Control': 'public, max-age=86400'});
      return res.end();
    }
  }
  if (req.method === 'GET' && /^\/[A-Za-z0-9_-]{12,30}$/.test(url.pathname)) {
    const data = await publicCardData(decodeURIComponent(url.pathname.slice(1)));
    return data ? html(res, 200, renderCardHtml(data)) : html(res, 404, '<h1>이용할 수 없는 명함입니다.</h1>');
  }
  if (req.method === 'POST' && url.pathname === '/api/input/request') return requestOtp(req, res);
  if (req.method === 'POST' && url.pathname === '/api/input/verify') return verifyOtp(req, res);
  if (req.method === 'GET' && url.pathname === '/api/input/me') {
    const employee = await sessionEmployee(req);
    if (!employee) return json(res, 401, {error: '입력 세션이 없거나 만료되었습니다.'});
    return json(res, 200, await employeeInputData(employee.id));
  }
  if (req.method === 'PUT' && url.pathname === '/api/input/me') return saveEmployee(req, res);
  if (req.method === 'POST' && url.pathname === '/api/input/media') return uploadMedia(req, res, url.searchParams.get('slot'));
  if (req.method === 'GET' && /^\/api\/cards\/[A-Za-z0-9_-]+$/.test(url.pathname)) return publicCard(res, decodeURIComponent(url.pathname.split('/').pop()));
  if (req.method === 'GET' && url.pathname === '/api/admin/employees') return adminEmployees(req, res);
  if ((req.method === 'PATCH' || req.method === 'DELETE') && /^\/api\/admin\/employees\/[0-9a-f-]{36}$/i.test(url.pathname)) return adminEmployeeAction(req, res, url.pathname.split('/').pop());
  if (req.method === 'GET' && url.pathname === '/api/admin/default-backgrounds') return adminDefaultBackgrounds(req, res);
  if (req.method === 'POST' && url.pathname === '/api/admin/default-backgrounds') return uploadDefaultBackground(req, res, url.searchParams.get('page'));
  if ((req.method === 'GET' || req.method === 'PUT') && url.pathname === '/api/admin/company') return companySettings(req, res);
  if (req.method === 'GET' && /^\/media\/[0-9a-f-]{36}$/i.test(url.pathname)) return serveMedia(req, res, url.pathname.split('/').pop());
  if (req.method === 'GET' && /^\/assets\/[A-Za-z0-9_.-]+$/.test(url.pathname)) return serveAsset(req, res, url.pathname.split('/').pop());
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(302, {'Location': '/input', 'Cache-Control': 'no-store'});
    return res.end();
  }
  json(res, 404, {error: 'Not found'});
}

async function main() {
  const server = http.createServer((req, res) => route(req, res).catch(error => {
    console.error(error);
    if (!res.headersSent) json(res, 400, {error: error.message || '요청을 처리하지 못했습니다.'});
  }));
  server.listen(port, '0.0.0.0', () => console.log(`ZNUS card service listening on :${port}`));
  const close = async () => { server.close(); await pool.end(); process.exit(0); };
  process.on('SIGTERM', close); process.on('SIGINT', close);
}

if (require.main === module) {
  main().catch(error => { console.error(error); process.exit(1); });
}

module.exports = route;
