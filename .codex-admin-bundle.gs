const ZNUS_EMPLOYEE_SHEET = '설문지 응답 시트1';
// Form-owned columns stay exactly as Forms creates them. Only these four
// implementation columns are appended and hidden at the right edge.
const ZNUS_EMPLOYEE_SCHEMA = ['publicToken', 'formResponseId', 'processingStatus', 'errorMessage'];
const ZNUS_SCHEMA = {
  // The employee master is the Form response sheet itself. Cards is not part
  // of the workspace schema and is never created by setup.
  [ZNUS_EMPLOYEE_SHEET]: ZNUS_EMPLOYEE_SCHEMA,
  CompanySettings: ['companyName', 'companyWebsite', 'companyPhone', 'companyFax',
    'officeAddress', 'companyLogoFileId', 'sloganLine1', 'sloganLine2', 'sloganLine3'],
  DeletedTokens: ['publicToken']
};
const ZNUS_LEGACY_CARDS_SCHEMA = ZNUS_EMPLOYEE_SCHEMA;
function schema_(name) { return name === 'Cards' ? ZNUS_LEGACY_CARDS_SCHEMA : ZNUS_SCHEMA[name]; }
function employeeSheet_(ss) {
  const sheet = ss.getSheetByName(ZNUS_EMPLOYEE_SHEET);
  if (!sheet) throw new Error(ZNUS_EMPLOYEE_SHEET + ' 탭이 필요합니다. Form 응답 저장 위치를 확인하세요.');
  return sheet;
}
function workspaceSchemaNames_() { return [ZNUS_EMPLOYEE_SHEET, 'CompanySettings', 'DeletedTokens']; }
function sheetHeaders_(sheet) {
  return !sheet || sheet.getLastRow() === 0 ? [] :
    sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
}
function inspectSchema_(sheet, name) {
  const headers = sheetHeaders_(sheet);
  if (!headers.length) return headers;
  if (headers.some(h => !h || h.trim() !== h) || new Set(headers).size !== headers.length)
    throw new Error(name + ': 빈 열 이름 또는 중복 열 이름을 정리하세요. 데이터는 변경하지 않았습니다.');
  if (name === 'DeletedTokens' && (headers.length !== 1 || headers[0] !== 'publicToken'))
    throw new Error('DeletedTokens에는 publicToken 한 열만 허용합니다.');
  if (name === 'CompanySettings' && sheet.getLastRow() > 2)
    throw new Error('CompanySettings는 설정 한 행만 사용합니다.');
  return headers;
}
function ensureSheet_(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const headers = inspectSchema_(sheet, name);
  const missing = schema_(name).filter(h => !headers.includes(h));
  if (missing.length) {
    const count = headers.length + missing.length;
    if (sheet.getMaxColumns() < count) sheet.insertColumnsAfter(sheet.getMaxColumns(), count - sheet.getMaxColumns());
    sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, sheet.getLastColumn()).setFontWeight('bold').setBackground('#17213b').setFontColor('#ffffff');
  if (name === ZNUS_EMPLOYEE_SHEET && typeof sheet.hideColumns === 'function') {
    const currentHeaders = sheetHeaders_(sheet);
    ZNUS_EMPLOYEE_SCHEMA.forEach(function (header) {
      const column = currentHeaders.indexOf(header) + 1;
      if (column) sheet.hideColumns(column);
    });
  }
  return sheet;
}
function workspace_() {
  const id = PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID');
  if (!id) throw new Error('setupWorkspace를 먼저 실행하세요.');
  return SpreadsheetApp.openById(id);
}
function withWorkspaceLock_(action) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return action(); }
  finally { try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); } }
}
function readRecords_(sheet, name) {
  if (!sheet) throw new Error(name + ' 시트가 없습니다.');
  const headers = inspectSchema_(sheet, name);
  if (schema_(name).some(h => !headers.includes(h))) throw new Error(name + ': 초기 설정이 필요합니다.');
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues()
    .map((values, i) => ({ row: i + 2, value: Object.fromEntries(headers.map((h, j) => [h, values[j]])) }))
    .filter(record => Object.values(record.value).some(v => v !== ''));
}
/** Text format preserves leading zeroes; escaping prevents Sheets formulas. */
function sheetValue_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}
function writeRecord_(sheet, name, record, row) {
  const headers = inspectSchema_(sheet, name);
  if (schema_(name).some(h => !headers.includes(h))) throw new Error(name + ': 초기 설정이 필요합니다.');
  const target = row || sheet.getLastRow() + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), target - sheet.getMaxRows());
  const range = sheet.getRange(target, 1, 1, headers.length);
  const previous = target <= sheet.getLastRow() ? range.getValues()[0] : [];
  const systemHeaders = new Set(schema_(name));
  headers.forEach((header, index) => {
    if (systemHeaders.has(header)) sheet.getRange(target, index + 1, 1, 1).setNumberFormat('@');
  });
  range.setValues([headers.map((h, i) => Object.prototype.hasOwnProperty.call(record, h)
    ? sheetValue_(record[h] == null ? '' : record[h]) : (previous[i] == null ? '' : previous[i]))]);
}
/** Write only the four implementation cells; Form-owned cells stay untouched. */
function writeEmployeeSystem_(sheet, row, values) {
  const headers = sheetHeaders_(sheet);
  ZNUS_EMPLOYEE_SCHEMA.forEach(function (header) {
    if (!Object.prototype.hasOwnProperty.call(values, header)) return;
    const column = headers.indexOf(header) + 1;
    if (!column) throw new Error('시스템 열이 없습니다: ' + header);
    sheet.getRange(row, column, 1, 1).setNumberFormat('@').setValues([[sheetValue_(values[header] == null ? '' : values[header])]]);
  });
}


const ZNUS_BACKGROUND_KEYS = ['role', 'contact', 'company', 'links'];
const ZNUS_REQUIRED_TEXT = ['nameKo', 'nameEn', 'department', 'jobTitleKo', 'jobTitleEn',
  'roleItem1Ko', 'roleItem2Ko', 'roleItem3Ko', 'roleItem4Ko', 'roleItem5Ko',
  'roleItem1En', 'roleItem2En', 'roleItem3En', 'roleItem4En', 'roleItem5En'];
function requiredText_(value, label, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ': 필수 입력입니다.');
  const text = value.trim();
  if (text.length > max) throw new Error(label + ': 최대 ' + max + '자입니다.');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error(label + ': 허용되지 않는 제어 문자입니다.');
  return text;
}
function email_(value, label) {
  const email = requiredText_(value, label, 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(label + ': 이메일 형식을 확인하세요.');
  return email;
}
function validateHttpsUrl_(value, label) {
  const url = requiredText_(value, label, 2000);
  if (!/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?(?:\/[^\s<>"\\]*)?$/i.test(url))
    throw new Error(label + ': 올바른 HTTPS URL을 입력하세요.');
  return url;
}
function fileId_(value, label) {
  const id = requiredText_(value, label, 200);
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(label + ': Drive 파일 ID 형식을 확인하세요.');
  return id;
}
/** Form/admin adapters share this. Empty background means keep existing. */
function validateCardInput_(input, existing) {
  if (!input || typeof input !== 'object') throw new Error('명함 입력이 필요합니다.');
  const out = {};
  out.googleAccountEmail = email_(input.googleAccountEmail, 'Google 계정 이메일').toLowerCase();
  ZNUS_REQUIRED_TEXT.forEach(key => { out[key] = requiredText_(input[key], key, key.startsWith('roleItem') ? 200 : 100); });
  out.mobilePhone = requiredText_(input.mobilePhone, '공개 휴대전화', 40);
  if (!/^\+?[0-9 ()-]+$/.test(out.mobilePhone) || out.mobilePhone.replace(/\D/g, '').length < 7)
    throw new Error('공개 휴대전화 형식을 확인하세요.');
  out.publicEmail = email_(input.publicEmail, '공개 이메일');
  // Keep the existing column name so saved cards and their URLs remain compatible.
  out.profileImageFileId = fileId_(input.profileImageFileId || (existing && existing.profileImageFileId), '프로필 사진 또는 영상');
  ZNUS_BACKGROUND_KEYS.forEach(key => {
    const modeKey = key + 'BackgroundMode', fileKey = key + 'BackgroundFileId';
    const mode = input[modeKey] == null ? '' : String(input[modeKey]).trim();
    const file = input[fileKey] == null ? '' : String(input[fileKey]).trim();
    if (!mode) {
      if (file) throw new Error(key + ': 파일의 배경 유형을 선택하세요.');
      out[modeKey] = existing ? existing[modeKey] : 'DEFAULT';
      out[fileKey] = existing ? existing[fileKey] : '';
    } else if (mode === 'DEFAULT') {
      if (file) throw new Error(key + ': 기본값에는 파일을 지정할 수 없습니다.');
      out[modeKey] = mode; out[fileKey] = '';
    } else if (mode === 'IMAGE' || mode === 'VIDEO') {
      out[modeKey] = mode; out[fileKey] = fileId_(file, key + ' 배경');
    } else { throw new Error(key + ': 허용되지 않는 배경 유형입니다.'); }
  });
  return out;
}
/** Trusted metadata only. Actual extraction/file ownership checks are stage 3. */
function validateMediaMetadata_(metadata, mode) {
  if (!metadata || !['IMAGE', 'VIDEO'].includes(mode)) throw new Error('미디어 메타데이터와 유형이 필요합니다.');
  if (!Number.isFinite(metadata.sizeBytes) || metadata.sizeBytes <= 0) throw new Error('빈 파일 또는 잘못된 파일 크기입니다.');
  if (mode === 'IMAGE') {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(metadata.mimeType)) throw new Error('JPG, PNG, WEBP 이미지만 허용합니다.');
  } else {
    if (metadata.mimeType !== 'video/mp4') throw new Error('영상은 MP4만 허용합니다.');
    if (metadata.sizeBytes > 30 * 1024 * 1024) throw new Error('영상은 30MB 이하여야 합니다.');
    if (!Number.isFinite(metadata.durationSeconds) || metadata.durationSeconds <= 0 || metadata.durationSeconds > 5)
      throw new Error('영상 길이를 확인할 수 없거나 5초를 초과합니다.');
    if (!Number.isInteger(metadata.width) || !Number.isInteger(metadata.height) || metadata.width <= 0 || metadata.height <= 0 || metadata.width > 2560 || metadata.height > 1440)
      throw new Error('영상 해상도를 확인할 수 없거나 2560×1440을 초과합니다.');
  }
  return metadata;
}
function validateCompanySettings_(input) {
  const out = {};
  ZNUS_SCHEMA.CompanySettings.forEach(key => { out[key] = requiredText_(input && input[key], key, 500); });
  out.companyWebsite = validateHttpsUrl_(out.companyWebsite, '회사 웹사이트');
  out.companyLogoFileId = fileId_(out.companyLogoFileId, '회사 로고');
  return out;
}


function getCompanySettings() {
  const rows = readRecords_(workspace_().getSheetByName('CompanySettings'), 'CompanySettings');
  return rows.length ? rows[0].value : null;
}
function saveCompanySettings(input) {
  const validated = validateCompanySettings_(input);
  return withWorkspaceLock_(function () {
    const sheet = workspace_().getSheetByName('CompanySettings');
    const rows = readRecords_(sheet, 'CompanySettings');
    writeRecord_(sheet, 'CompanySettings', Object.assign({}, rows.length ? rows[0].value : {}, validated), 2);
    return validated;
  });
}
/** getUuid = java.util.UUID.randomUUID, a cryptographically strong v4 UUID.
 * Skip fixed version/variant bytes and use rejection sampling for uniform base36.
 */
function randomToken_() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let attempt = 0; attempt < 100 && token.length < 12; attempt++) {
    const uuid = Utilities.getUuid().toLowerCase();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid))
      throw new Error('UUID v4 난수 생성에 실패했습니다.');
    const hex = uuid.replace(/-/g, '');
    for (let i = 0; i < 16 && token.length < 12; i++) {
      if (i === 6 || i === 8) continue;
      const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      if (byte < 252) token += alphabet[byte % 36];
    }
  }
  if (token.length !== 12) throw new Error('공개 토큰 난수 생성에 실패했습니다.');
  return token;
}
function uniqueToken_(cards, deleted) {
  const used = new Set(cards.concat(deleted).map(r => r.value.publicToken));
  for (let i = 0; i < 100; i++) {
    const token = randomToken_();
    if (!used.has(token)) return token;
  }
  throw new Error('고유 공개 토큰 생성에 실패했습니다.');
}
/** Internal foundation only: stage 2 finalizes assets/QR then publishes.
 * Never expose draft creation from the old sidebar or public web app.
 */
function createCardRecord_(input) {
  const data = validateCardInput_(input);
  return withWorkspaceLock_(function () {
    const ss = workspace_(), sheet = employeeSheet_(ss);
    const cards = readRecords_(sheet, ZNUS_EMPLOYEE_SHEET);
    if (cards.some(r => String(r.value.googleAccountEmail).toLowerCase() === data.googleAccountEmail))
      throw new Error('이미 등록된 Google 계정입니다. 기존 명함 수정 경로를 사용하세요.');
    const deleted = readRecords_(ss.getSheetByName('DeletedTokens'), 'DeletedTokens');
    const token = uniqueToken_(cards, deleted);
    let cardId;
    for (let i = 0; i < 100; i++) {
      cardId = Utilities.getUuid().toLowerCase();
      if (!cards.some(r => r.value.cardId === cardId)) break;
      cardId = null;
    }
    if (!cardId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(cardId))
      throw new Error('고유 cardId 생성에 실패했습니다.');
    const now = new Date().toISOString();
    const record = Object.assign({}, data, {
      cardId: cardId, publicToken: token, publicUrl: publicUrl_(token),
      published: false, isActive: true, qrUrl: '', nfcStatus: '', formResponseId: '',
      processingStatus: 'PROCESSING', errorMessage: '', createdAt: now, updatedAt: now
    });
    writeRecord_(sheet, ZNUS_EMPLOYEE_SHEET, record);
    return record;
  });
}
/** Stage 5 must call this BEFORE deleting an employee row. It does not delete files/data. */
function reserveDeletedToken_(token) {
  if (!/^[a-z0-9]{12}$/.test(token)) throw new Error('잘못된 공개 토큰입니다.');
  return withWorkspaceLock_(function () {
    const sheet = workspace_().getSheetByName('DeletedTokens');
    const records = readRecords_(sheet, 'DeletedTokens');
    if (!records.some(r => r.value.publicToken === token))
      writeRecord_(sheet, 'DeletedTokens', { publicToken: token });
    return token;
  });
}


const ZNUS_FOLDERS = [
  ['root', 'ZNUS Digital Card', null], ['admin', '00_admin', 'root'],
  ['uploads', '01_form_uploads', 'root'], ['assets', '02_card_assets', 'root'],
  ['generated', '03_generated', 'root'], ['qr', 'qr', 'generated']
];
function readFolderConfig_() {
  const props = PropertiesService.getScriptProperties();
  return Object.fromEntries(ZNUS_FOLDERS.map(([key]) => [key, props.getProperty('ZNUS_FOLDER_' + key.toUpperCase()) || '']));
}
function ensureWorkspaceFolders_() {
  const props = PropertiesService.getScriptProperties();
  const result = {};
  ZNUS_FOLDERS.forEach(([key, name, parent]) => {
    const property = 'ZNUS_FOLDER_' + key.toUpperCase();
    const id = props.getProperty(property);
    let folder;
    if (id) {
      // Never silently replace inaccessible folders and lose references.
      folder = DriveApp.getFolderById(id);
      if (folder.isTrashed()) throw new Error(name + ' 폴더가 휴지통에 있습니다. 복원 후 다시 실행하세요.');
    } else {
      const container = parent ? DriveApp.getFolderById(result[parent]) : DriveApp.getRootFolder();
      const matches = container.getFoldersByName(name);
      if (matches.hasNext()) {
        folder = matches.next();
        if (matches.hasNext()) throw new Error(name + ' 폴더가 여러 개입니다. ' + property + '에 사용할 ID를 지정하세요.');
      } else { folder = container.createFolder(name); }
      props.setProperty(property, folder.getId());
    }
    if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE)
      throw new Error(name + ': 폴더의 일반 액세스를 제한됨으로 설정하세요.');
    if (parent) {
      const parents = folder.getParents();
      let belongs = false;
      while (parents.hasNext()) if (parents.next().getId() === result[parent]) belongs = true;
      if (!belongs) throw new Error(name + ' 폴더의 상위 폴더가 설정과 다릅니다.');
    }
    result[key] = folder.getId();
  });
  return result;
}
/** Called from an editor-only wrapper, not from the public app. */
function configurePublicBaseUrl_(url) {
  const clean = validateHttpsUrl_(url, '공개 기본 URL').replace(/\/+$/, '');
  if (/[?#]/.test(clean)) throw new Error('공개 기본 URL에는 쿼리나 해시를 넣지 마세요.');
  return withWorkspaceLock_(function () {
    const props = PropertiesService.getScriptProperties();
    const cards = formRecords_(employeeSheet_(workspace_()));
    if (props.getProperty('ZNUS_PUBLIC_BASE_URL') !== clean &&
        cards.some(entry => /^[a-z0-9]{12}$/.test(String(entry.value.publicToken || ''))))
      throw new Error('명함 생성 이후 주소 변경은 별도 이전 절차가 필요합니다. 기존 URL을 유지하세요.');
    props.setProperty('ZNUS_PUBLIC_BASE_URL', clean);
    return clean;
  });
}
function publicUrl_(token) {
  const base = PropertiesService.getScriptProperties().getProperty('ZNUS_PUBLIC_BASE_URL');
  if (!base) throw new Error('ZNUS_PUBLIC_BASE_URL을 먼저 설정하세요.');
  const clean = validateHttpsUrl_(base, '공개 기본 URL').replace(/\/+$/, '');
  if (/[?#]/.test(clean)) throw new Error('공개 기본 URL에 쿼리나 해시를 사용할 수 없습니다.');
  return clean + (/^https:\/\/script\.google\.com\//.test(clean) ? '?card=' : '/') + token;
}


/** Connect an existing Form without rebuilding questions or installing a second trigger. */
function connectExistingForm(formId) {
  const id = fileId_(formId, '입력 설문 ID');
  return withWorkspaceLock_(function () {
    const ss = SpreadsheetApp.getActive();
    if (!ss) throw new Error('운영 시트에 바인드된 Apps Script에서 실행해 주세요.');
    const props = PropertiesService.getScriptProperties();
    const previousSheet = props.getProperty('ZNUS_SPREADSHEET_ID');
    const previousForm = props.getProperty('ZNUS_FORM_ID');
    if (previousSheet && previousSheet !== ss.getId()) throw new Error('이미 다른 시트에 연결되어 있습니다. 기존 연결을 이전하는 절차가 필요합니다.');
    if (previousForm && previousForm !== id) throw new Error('이미 다른 설문에 연결되어 있습니다. 기존 연결을 이전하는 절차가 필요합니다.');
    const form = FormApp.openById(id);
    if (form.getDestinationId() !== ss.getId()) throw new Error('이 설문의 응답 저장 위치가 현재 시트와 다릅니다. 설문의 응답 연결을 확인해 주세요.');
    if (!form.collectsEmail()) throw new Error('설문에서 Google 계정 이메일 수집을 먼저 켜 주세요.');
    workspaceSchemaNames_().forEach(name => inspectSchema_(ss.getSheetByName(name), name));
    props.setProperties({ZNUS_SPREADSHEET_ID: ss.getId(), ZNUS_FORM_ID: id});
    return {spreadsheetUrl: ss.getUrl(), formEditUrl: form.getEditUrl(),
      message: '연결을 저장했습니다. 기존 프로젝트의 제출 트리거를 확인한 후 이 프로젝트로 이전해 주세요. 질문과 트리거는 변경하지 않았습니다.'};
  });
}

/** Read-only audit: project triggers are visible only for the current user/project. */
// Run once with the Drive folder containing the four original default MP4s.
// These are shared design assets, separate from employee Form uploads.
function connectDefaultBackgroundFolder(folderId) {
  const folder = DriveApp.getFolderById(fileId_(folderId, '기본 영상 폴더'));
  const files = {role:'role.mp4', contact:'contact.mp4', company:'web.mp4', links:'links.mp4'};
  const configured = {};
  Object.keys(files).forEach(function (key) {
    const matches = folder.getFilesByName(files[key]);
    if (!matches.hasNext()) throw new Error(files[key] + ': 기본 영상이 없습니다.');
    const file = matches.next();
    if (matches.hasNext()) throw new Error(files[key] + ': 같은 이름의 파일이 여러 개입니다.');
    if (file.isTrashed() || file.getMimeType() !== 'video/mp4' || file.getSize() <= 0 || file.getSize() > 30 * 1024 * 1024)
      throw new Error(files[key] + ': MP4 파일과 크기를 확인하세요.');
    configured[key + 'DefaultVideoFileId'] = file.getId();
  });
  return withWorkspaceLock_(function () {
    const sheet = workspace_().getSheetByName('CompanySettings');
    const rows = readRecords_(sheet, 'CompanySettings');
    const headers = sheetHeaders_(sheet);
    const missing = Object.keys(configured).filter(key => !headers.includes(key));
    if (missing.length) {
      const count = headers.length + missing.length;
      if (sheet.getMaxColumns() < count) sheet.insertColumnsAfter(sheet.getMaxColumns(), count - sheet.getMaxColumns());
      sheet.getRange(1, headers.length + 1, 1, missing.length).setValues([missing]);
    }
    writeRecord_(sheet, 'CompanySettings', Object.assign({}, rows.length ? rows[0].value : {}, configured), 2);
    return configured;
  });
}

function inspectFormConnection() {
  const sheetId = formSpreadsheetId_(), id = formId_();
  const form = FormApp.openById(id);
  if (form.getDestinationId() !== sheetId) throw new Error('설문의 응답 저장 위치가 설정한 시트와 다릅니다.');
  return {
    spreadsheetId: sheetId, formId: id, collectsEmail: form.collectsEmail(),
    triggers: ScriptApp.getProjectTriggers().filter(trigger => trigger.getHandlerFunction() === 'onFormSubmitCard')
      .map(trigger => ({sourceId: trigger.getTriggerSourceId(), eventType: String(trigger.getEventType())})),
    message: '현재 계정과 프로젝트에서 보이는 트리거만 표시됩니다. 이전 프로젝트에 남은 트리거도 확인해야 합니다.'
  };
}


/**
 * Stage 3 media processing for the Sheet-bound project.
 *
 * FormAutomation.gs validates the response shape. This file performs the
 * Drive-side checks that cannot be trusted from a Form response alone and
 * moves accepted files into the card's private asset folder.
 */
const ZNUS_MEDIA_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ZNUS_MEDIA_VIDEO_MIME = 'video/mp4';
const ZNUS_MEDIA_MAX_VIDEO_BYTES = 30 * 1024 * 1024;

/** Read the actual Drive file and, for MP4, its container metadata. */
function inspectCardMedia_(fileId, mode, label) {
  const id = String(fileId || '').trim();
  const kind = String(mode || '').toUpperCase();
  const name = String(label || '미디어');
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(name + ': Drive 파일 ID 형식을 확인하세요.');
  if (kind !== 'IMAGE' && kind !== 'VIDEO') throw new Error(name + ': 미디어 유형이 올바르지 않습니다.');

  const file = DriveApp.getFileById(id);
  if (typeof file.isTrashed === 'function' && file.isTrashed())
    throw new Error(name + ': 휴지통에 있는 파일은 사용할 수 없습니다.');
  const mimeType = String(file.getMimeType() || '').toLowerCase();
  const sizeBytes = Number(file.getSize() || 0);
  const metadata = { id: id, mimeType: mimeType, sizeBytes: sizeBytes };

  if (kind === 'IMAGE') {
    validateMediaMetadata_(metadata, kind);
    return metadata;
  }
  if (mimeType !== ZNUS_MEDIA_VIDEO_MIME)
    throw new Error(name + ': MP4 영상만 허용합니다.');
  if (sizeBytes > ZNUS_MEDIA_MAX_VIDEO_BYTES)
    throw new Error(name + ': 영상은 30MiB 이하여야 합니다.');
  if (sizeBytes <= 0) throw new Error(name + ': 빈 파일은 사용할 수 없습니다.');

  const parsed = parseMp4Metadata_(file.getBlob().getBytes());
  metadata.durationSeconds = parsed.durationSeconds;
  metadata.width = parsed.width;
  metadata.height = parsed.height;
  validateMediaMetadata_(metadata, kind);
  return metadata;
}

/**
 * Move an accepted upload into 02_card_assets/<publicToken>, publish only that
 * asset. Previous files stay available if another asset or the Sheets save fails.
 */
function storeCardAsset_(fileId, oldFileId, publicToken, label, mode) {
  const metadata = inspectCardMedia_(fileId, mode, label);
  const id = metadata.id;
  const card = String(publicToken || '').trim();
  if (!/^[a-z0-9]{12}$/.test(card)) throw new Error('카드 자산을 저장할 publicToken이 올바르지 않습니다.');

  const folder = ensureCardAssetFolder_(card);
  const file = DriveApp.getFileById(id);
  file.setName(assetFileName_(label, metadata.mimeType));
  file.moveTo(folder);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return id;
}

function ensureCardAssetFolder_(cardId) {
  const parentId = PropertiesService.getScriptProperties().getProperty('ZNUS_FOLDER_ASSETS');
  if (!parentId) throw new Error('ZNUS_FOLDER_ASSETS가 설정되지 않았습니다. 초기 설정을 먼저 실행하세요.');
  const parent = DriveApp.getFolderById(parentId);
  if (parent.isTrashed && parent.isTrashed()) throw new Error('카드 자산 폴더가 휴지통에 있습니다.');
  const matches = parent.getFoldersByName(cardId);
  if (matches.hasNext()) {
    const folder = matches.next();
    if (matches.hasNext()) throw new Error(cardId + ': 카드 자산 폴더가 여러 개입니다.');
    if (folder.isTrashed && folder.isTrashed()) throw new Error('카드 자산 폴더가 휴지통에 있습니다.');
    return folder;
  }
  return parent.createFolder(cardId);
}

function assetFileName_(label, mimeType) {
  const safe = String(label || 'asset').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'asset';
  const ext = mimeType === 'image/jpeg' ? '.jpg' : mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.mp4';
  return safe + '_current' + ext;
}

function trashCardAsset_(fileId) {
  try {
    const file = DriveApp.getFileById(String(fileId));
    if (!file.isTrashed || !file.isTrashed()) file.setTrashed(true);
  } catch (error) {
    // A missing previous asset must not make the new valid asset unusable.
  }
}

/** Parse the movie header and the first video track in an ISO BMFF/MP4 file. */
function parseMp4Metadata_(bytes) {
  if (!bytes || bytes.length < 16) throw new Error('MP4 메타데이터를 읽을 수 없습니다.');
  const moov = mp4Children_(bytes, 0, bytes.length).find(function (box) { return box.type === 'moov'; });
  if (!moov) throw new Error('MP4의 moov 상자를 찾을 수 없습니다.');

  const movie = mp4Child_(bytes, moov, 'mvhd');
  let timescale = 0, duration = 0;
  if (movie) {
    const version = byteAt_(bytes, movie.start);
    const offset = version === 1 ? 20 : 12;
    timescale = readU32_(bytes, movie.start + offset);
    duration = version === 1 ? readU64_(bytes, movie.start + 4 + 8 + 8 + 4) : readU32_(bytes, movie.start + 16);
  }

  let width = 0, height = 0, trackDuration = 0, trackTimescale = 0;
  mp4Children_(bytes, moov.start, moov.end).filter(function (box) { return box.type === 'trak'; }).some(function (trak) {
    const mdia = mp4Child_(bytes, trak, 'mdia');
    const handler = mdia && mp4Child_(bytes, mdia, 'hdlr');
    if (!handler || readAscii_(bytes, handler.start + 8, 4) !== 'vide') return false;
    const tkhd = mp4Child_(bytes, trak, 'tkhd');
    if (tkhd) {
      const version = byteAt_(bytes, tkhd.start);
      const dimensionOffset = version === 1 ? 88 : 76;
      width = readU32_(bytes, tkhd.start + dimensionOffset) / 65536;
      height = readU32_(bytes, tkhd.start + dimensionOffset + 4) / 65536;
    }
    const mdhd = mdia && mp4Child_(bytes, mdia, 'mdhd');
    if (mdhd) {
      const version = byteAt_(bytes, mdhd.start);
      const offset = version === 1 ? 20 : 12;
      trackTimescale = readU32_(bytes, mdhd.start + offset);
      trackDuration = version === 1 ? readU64_(bytes, mdhd.start + 24) : readU32_(bytes, mdhd.start + 16);
    }
    return true;
  });

  if (!timescale || !duration) {
    timescale = trackTimescale;
    duration = trackDuration;
  }
  const durationSeconds = timescale > 0 ? duration / timescale : 0;
  if (!width || !height || !durationSeconds) throw new Error('MP4 영상의 길이 또는 해상도를 읽을 수 없습니다.');
  return { durationSeconds: durationSeconds, width: Math.round(width), height: Math.round(height) };
}

function mp4Child_(bytes, parent, type) {
  return mp4Children_(bytes, parent.start, parent.end).find(function (box) { return box.type === type; }) || null;
}

function mp4Children_(bytes, start, end) {
  const boxes = [];
  let position = start;
  while (position + 8 <= end) {
    let size = readU32_(bytes, position), header = 8;
    if (size === 1) { size = readU64_(bytes, position + 8); header = 16; }
    if (size === 0) size = end - position;
    if (size < header || position + size > end) throw new Error('MP4 상자 크기가 올바르지 않습니다.');
    boxes.push({ type: readAscii_(bytes, position + 4, 4), start: position + header, end: position + size });
    position += size;
  }
  return boxes;
}

function byteAt_(bytes, index) { const value = Number(bytes[index]); return value < 0 ? value + 256 : value; }
function readU32_(bytes, index) { return byteAt_(bytes, index) * 16777216 + byteAt_(bytes, index + 1) * 65536 + byteAt_(bytes, index + 2) * 256 + byteAt_(bytes, index + 3); }
function readU64_(bytes, index) { return readU32_(bytes, index) * 4294967296 + readU32_(bytes, index + 4); }
function readAscii_(bytes, index, length) { let text = ''; for (let i = 0; i < length; i++) text += String.fromCharCode(byteAt_(bytes, index + i)); return text; }


// Each account supplies its own connection. Never fall back to another account's IDs.
function formSpreadsheetId_() { return formConnectionId_('ZNUS_SPREADSHEET_ID'); }
function formId_() { return formConnectionId_('ZNUS_FORM_ID'); }
function formConnectionId_(key) {
  const id = PropertiesService.getScriptProperties().getProperty(key);
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(key + ' 연결 설정을 먼저 확인해 주세요.');
  return id;
}
const FORM_BG_KEYS = ['role','contact','company','links'];
const FORM_REQUIRED = ['nameKo','nameEn','department','jobTitleKo','jobTitleEn','roleItem1Ko','roleItem2Ko','roleItem3Ko','roleItem4Ko','roleItem5Ko','roleItem1En','roleItem2En','roleItem3En','roleItem4En','roleItem5En'];
const FORM_UPLOAD_KEYS = ['profileImageFileId'].concat(FORM_BG_KEYS.map(function (key) { return key + 'BackgroundFileId'; }));
const FORM_QUESTION_TITLES = {
  nameKo: '이름 (국문)', nameEn: '이름 (영문)', department: '부서', jobTitleKo: '직책 (국문)', jobTitleEn: '직책 (영문)',
  roleItem1Ko: '주요 업무 1 (국문)', roleItem2Ko: '주요 업무 2 (국문)', roleItem3Ko: '주요 업무 3 (국문)', roleItem4Ko: '주요 업무 4 (국문)', roleItem5Ko: '주요 업무 5 (국문)',
  roleItem1En: '주요 업무 1 (영문)', roleItem2En: '주요 업무 2 (영문)', roleItem3En: '주요 업무 3 (영문)', roleItem4En: '주요 업무 4 (영문)', roleItem5En: '주요 업무 5 (영문)',
  mobilePhone: '공개 휴대전화', publicEmail: '공개 이메일', profileImageFileId: '프로필 사진 또는 영상',
  roleBackgroundMode: '직무 카드 배경', contactBackgroundMode: '연락처 카드 배경', companyBackgroundMode: '회사 카드 배경', linksBackgroundMode: '링크 카드 배경',
  roleBackgroundFileId: '직무 카드 배경 파일', contactBackgroundFileId: '연락처 카드 배경 파일', companyBackgroundFileId: '회사 카드 배경 파일', linksBackgroundFileId: '링크 카드 배경 파일'
};
const FORM_MODE_LABELS = { '현재 배경 유지 / 첨부 파일 적용': 'AUTO', '기본 디자인 사용': 'DEFAULT', '이미지로 변경': 'IMAGE', '영상으로 변경': 'VIDEO' };

// 최초 1회만 실행합니다. 필요한 Google 권한을 한 번에 승인하고,
// 데이터 시트·입력 Form·제출 트리거를 모두 구성합니다.
function setupFormAutomationAll() {
  const spreadsheetUrl = setupFormAutomationWorkspace();
  const form = setupFormAutomationForm();
  return {
    spreadsheetUrl: spreadsheetUrl,
    formEditUrl: form.editUrl,
    formPublishedUrl: form.publishedUrl,
    formItemCount: form.itemCount
  };
}

function setupFormAutomationWorkspace() {
  return withWorkspaceLock_(function () {
    const ss = SpreadsheetApp.openById(formSpreadsheetId_());
    workspaceSchemaNames_().forEach(name => inspectSchema_(ss.getSheetByName(name), name));
    workspaceSchemaNames_().forEach(name => ensureSheet_(ss, name));
    PropertiesService.getScriptProperties().setProperties({ ZNUS_SCHEMA_VERSION: '1' });
    ensureWorkspaceFolders_();
    return ss.getUrl();
  });
}

/** Keep the already approved Form questions; configure only response behavior. */
function setupFormAutomationForm() {
  const form = FormApp.openById(formId_());
  if (form.getDestinationId() !== formSpreadsheetId_()) throw new Error('설문의 응답 저장 위치가 정본 Sheet와 다릅니다.');
  form.setCollectEmail(true).setLimitOneResponsePerUser(true).setAllowResponseEdits(true).setShowLinkToRespondAgain(false);
  if (!ScriptApp.getProjectTriggers().some(function (trigger) { return trigger.getHandlerFunction() === 'onFormSubmitCard'; }))
    ScriptApp.newTrigger('onFormSubmitCard').forForm(form).onFormSubmit().create();
  return {editUrl: form.getEditUrl(), publishedUrl: form.getPublishedUrl(), itemCount: form.getItems().length};
}

/**
 * One-time, explicit migration for workbooks that still have the old Cards
 * tab. The old tab is never used as a live source after this succeeds and is
 * intentionally left untouched so the operator can archive it safely.
 */
function migrateCardsToFormResponseSheet() {
  return withWorkspaceLock_(function () {
    const ss = workspace_(), source = ss.getSheetByName('Cards'), target = employeeSheet_(ss);
    if (!source) return {status: 'NOT_NEEDED', migrated: 0};
    const sourceRows = readRecords_(source, 'Cards');
    const targetRows = formRecords_(target);
    const accounts = new Set(targetRows.map(entry => String(entry.value.googleAccountEmail || '').trim().toLowerCase()).filter(Boolean));
    const tokens = new Set(targetRows.map(entry => String(entry.value.publicToken || '').trim()).filter(Boolean));
    const deletedTokens = new Set(readRecords_(ss.getSheetByName('DeletedTokens'), 'DeletedTokens').map(entry => String(entry.value.publicToken || '').trim()));
    let migrated = 0;
    sourceRows.forEach(function (entry) {
      const account = String(entry.value.googleAccountEmail || '').trim().toLowerCase();
      const token = String(entry.value.publicToken || '').trim();
      if (account && accounts.has(account)) throw new Error('직원 계정이 응답 시트에 이미 있습니다: ' + account);
      if (token && tokens.has(token)) throw new Error('공개 토큰이 응답 시트에 이미 있습니다: ' + token);
      if (token && deletedTokens.has(token)) throw new Error('삭제 토큰은 재사용할 수 없습니다: ' + token);
      formWrite_(target, entry.value);
      if (account) accounts.add(account);
      if (token) tokens.add(token);
      migrated++;
    });
    return {status: 'MIGRATED', migrated: migrated, source: 'Cards', target: ZNUS_EMPLOYEE_SHEET};
  });
}

function legacySetupFormAutomationForm_() {
  const form = FormApp.openById(formId_());
  const existingTitles = form.getItems().map(function (item) { return item.getTitle(); });
  const existingUploadTitles = existingTitles.filter(function (title) { return FORM_UPLOAD_KEYS.indexOf(formQuestionKey_(title)) >= 0 || title === '프로필 카드 배경 파일'; });
  if (existingUploadTitles.length) {
    throw new Error('파일 업로드 질문은 Google Forms 화면에서 수동으로 관리합니다. 기존 파일 질문을 보존하기 위해 자동 재구성을 중단했습니다: ' + existingUploadTitles.join(', '));
  }
  form.setTitle('ZNUS 디지털 명함 입력').setDescription('신규 명함 생성과 기존 명함 수정을 위한 입력 양식입니다. 수정 시 기존 공개 토큰과 주소는 유지됩니다.').setCollectEmail(true).setLimitOneResponsePerUser(false).setShowLinkToRespondAgain(true);
  form.getItems().forEach(function (item) { form.deleteItem(item); });
  FORM_REQUIRED.forEach(function (key) { form.addTextItem().setTitle(formQuestionTitle_(key)).setHelpText(formQuestionHelp_(key)).setRequired(true); });
  form.addTextItem().setTitle(formQuestionTitle_('mobilePhone')).setHelpText('명함에 공개할 번호를 입력하세요. 예: 010-1234-5678').setRequired(true);
  form.addTextItem().setTitle(formQuestionTitle_('publicEmail')).setHelpText('명함에 공개할 이메일 주소를 입력하세요.').setRequired(true);
  configureFormBackgroundQuestions_(form);
  form.addSectionHeaderItem().setTitle('사진과 배경 파일 업로드').setHelpText('프로필 사진 또는 영상은 한 개만 받습니다. JPG, PNG, WEBP 이미지 또는 MP4 영상(최대 5초·2560×1440·30MB)을 첨부하세요. 신규 프로필은 필수이며 재제출 시 미첨부하면 기존 파일을 유지합니다. 다른 카드 배경은 미첨부 시 신규는 기본 영상, 재제출은 기존 배경을 사용합니다. 필요한 질문: ' + FORM_UPLOAD_KEYS.map(formQuestionTitle_).join(', '));
  form.setDestination(FormApp.DestinationType.SPREADSHEET, formSpreadsheetId_());
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onFormSubmitCard'; })) ScriptApp.newTrigger('onFormSubmitCard').forForm(form).onFormSubmit().create();
  return { editUrl: form.getEditUrl(), publishedUrl: form.getPublishedUrl(), itemCount: form.getItems().length, manualUploadQuestionTitles: FORM_UPLOAD_KEYS.map(formQuestionTitle_) };
}

// 파일 업로드 질문을 이미 추가한 Form을 새 입력 방식으로 바꿀 때 한 번 실행합니다.
// 기본 배경 복원 질문을 추가하고, 기존 업로드 질문을 보존합니다.
function simplifyFormBackgroundUploads() {
  const form = FormApp.openById(formId_());
  configureFormBackgroundQuestions_(form);
  const header = form.getItems().find(function (item) { return item.getTitle() === '사진과 배경 파일 업로드'; });
  if (header) form.moveItem(header, form.getItems().length - 1);
  FORM_UPLOAD_KEYS.forEach(function (key) {
    const item = form.getItems().find(function (candidate) { return candidate.getTitle() === formQuestionTitle_(key); });
    if (item) form.moveItem(item, form.getItems().length - 1);
  });
  return { editUrl: form.getEditUrl(), itemCount: form.getItems().length };
}

// Existing upload questions and responses are preserved when adding reset controls.
function configureFormBackgroundQuestions_(form) {
  FORM_BG_KEYS.forEach(function (key) {
    const title = formQuestionTitle_(key + 'BackgroundMode');
    const existing = form.getItems().find(function (item) { return item.getTitle() === title; });
    const item = existing ? existing.asMultipleChoiceItem() : form.addMultipleChoiceItem().setTitle(title);
    item.setChoiceValues(['현재 배경 유지 / 첨부 파일 적용', '기본 디자인 사용'])
      .setHelpText('미첨부 시 기존 배경 유지, 신규 명함은 기본 배경입니다. 기본 디자인 사용을 선택하면 배경을 복원합니다. 이때 파일은 첨부하지 마세요.')
      .setRequired(false);
  });
}

function legacyOnFormSubmitCard_(e) {
  return withWorkspaceLock_(function () {
    const response = e && e.response;
    if (!response) throw new Error('Form 제출 이벤트가 필요합니다.');
    const account = email_(String(response.getRespondentEmail() || ''), 'Google 계정 이메일').toLowerCase();
    const ss = workspace_(), sheet = employeeSheet_(ss);
    const rows = formRecords_(sheet);
    const matches = rows.filter(r => String(r.value.googleAccountEmail).trim().toLowerCase() === account);
    if (matches.length > 1) throw new Error('같은 Google 계정의 직원 행이 여러 개입니다. Sheets를 확인하세요.');
    const existing = matches[0], old = existing ? existing.value : null;
    const responseId = String(response.getId() || '');
    if (!responseId) throw new Error('Form 응답 ID가 없습니다.');
    if (old && old.formResponseId === responseId && old.processingStatus === 'COMPLETED')
      return {status: 'UNCHANGED', cardId: old.cardId, publicToken: old.publicToken};
    const responseRow = findFormResponseRow_(sheet, response, account, rows);
    const answers = formAnswers_(response);
    answers.googleAccountEmail = account;
    const now = new Date().toISOString();
    const token = old ? old.publicToken : formUniqueToken_(ss);
    const base = ensureCardIdentity_(old || {cardId: Utilities.getUuid().toLowerCase(), googleAccountEmail: account,
      publicToken: token, publicUrl: formPublicUrl_(token), published: false, isActive: true,
      createdAt: now, qrUrl: '', nfcStatus: ''}, ss);
    const target = existing ? existing.row : (responseRow || sheet.getLastRow() + 1);
    if (existing && responseRow && responseRow !== existing.row)
      mergeFormResponseRow_(sheet, responseRow, existing.row);
    // Retain the last good payload until every new asset has been prepared.
    const processing = Object.assign({}, base, {processingStatus: 'PROCESSING', errorMessage: ''});
    formWrite_(sheet, processing, target);
    try {
      const data = formValidate_(answers, old);
      const ids = FORM_UPLOAD_KEYS.map(key => data[key]).filter(Boolean);
      if (new Set(ids).size !== ids.length) throw new Error('각 영역에 서로 다른 파일을 첨부하세요.');
      if (rows.some(r => (!existing || r.row !== existing.row) && FORM_UPLOAD_KEYS.some(key => ids.includes(r.value[key]))))
        throw new Error('다른 직원 명함에서 사용 중인 파일입니다.');
      const next = Object.assign({}, base, data, {googleAccountEmail: account, formResponseId: responseId,
        published: true, isActive: true, processingStatus: 'COMPLETED', errorMessage: '', updatedAt: now});
      next.profileImageFileId = formStoreAsset_(data.profileImageFileId, '', base.cardId, 'profile', data.profileBackgroundMode);
      next.profileBackgroundFileId = ''; // Legacy column; there is no second profile media slot.
      FORM_BG_KEYS.forEach(function (key) {
        next[key + 'BackgroundFileId'] = formApplyBackground_(data, base, key, base.cardId);
        if (data[key + 'BackgroundMode'] === 'KEEP_CURRENT') next[key + 'BackgroundMode'] = base[key + 'BackgroundMode'] || 'DEFAULT';
      });
      // Resolve by ID again: a manual Sheets row deletion must never overwrite another employee.
      const current = formRecords_(sheet).find(r => r.value.cardId === base.cardId);
      if (!current) throw new Error('처리 중 직원 행이 삭제되었습니다. 다시 제출해 주세요.');
      formWrite_(sheet, next, current.row);
      removeDuplicateFormRows_(sheet, account, current.row);
      SpreadsheetApp.flush();
      // Keep replaced uploads in Drive. A failed save must never destroy the last good media.
      return {status: old ? 'UPDATED' : 'CREATED', cardId: next.cardId, publicToken: token, publicUrl: next.publicUrl};
    } catch (error) {
      const current = formRecords_(sheet).find(r => r.value.cardId === base.cardId);
      if (current) {
        const failed = Object.assign({}, base, {processingStatus: 'ERROR', errorMessage: formErrorMessage_(error)});
        if (!old) FORM_REQUIRED.concat(['mobilePhone', 'publicEmail']).forEach(key => { failed[key] = String(answers[key] || '').slice(0, 254); });
        formWrite_(sheet, failed, current.row);
      }
      if (existing) removeDuplicateFormRows_(sheet, account, existing.row);
      throw error;
    }
  });
}

/**
 * The submitted Form row is the only employee record. We write only the
 * hidden system cells, leaving every Form-owned value and header untouched.
 */
function onFormSubmitCard(e) {
  return withWorkspaceLock_(function () {
    const response = e && e.response;
    if (!response) throw new Error('Form 제출 이벤트가 필요합니다.');
    const account = email_(String(response.getRespondentEmail() || ''), 'Google 계정 이메일').toLowerCase();
    const ss = workspace_(), sheet = employeeSheet_(ss), rows = formRecords_(sheet);
    const responseId = String(response.getId() || '');
    if (!responseId) throw new Error('Form 응답 ID가 없습니다.');
    const rowFromEvent = findFormResponseRow_(sheet, response, account, rows);
    const matches = rows.filter(function (entry) { return formAccount_(entry.value) === account; });
    if (matches.length > 1) throw new Error('같은 Google 계정의 직원 행이 여러 개입니다. Sheets를 확인하세요.');
    const existing = matches[0] || null;
    const targetRow = rowFromEvent || (existing && existing.row);
    if (!targetRow) throw new Error('제출된 Form 응답 행을 찾지 못했습니다. 응답 저장 위치를 확인하세요.');
    if (existing && existing.row === targetRow && String(existing.value.formResponseId || '') === responseId &&
        String(existing.value.processingStatus || '') === 'COMPLETED') return {status: 'UNCHANGED', publicToken: existing.value.publicToken, publicUrl: publicUrl_(existing.value.publicToken)};

    const old = existing ? formCard_(existing.value) : null;
    const token = old && /^[a-z0-9]{12}$/.test(String(old.publicToken || '')) ? old.publicToken : formUniqueToken_(ss);
    writeEmployeeSystem_(sheet, targetRow, {publicToken: token, formResponseId: responseId, processingStatus: 'PROCESSING', errorMessage: ''});
    try {
      const data = formValidate_(formAnswers_(response), old);
      const ids = FORM_UPLOAD_KEYS.map(function (key) { return data[key]; }).filter(Boolean);
      if (new Set(ids).size !== ids.length) throw new Error('각 영역에 서로 다른 파일을 첨부하세요.');
      // New uploads are validated and moved, but their IDs remain in the
      // original Form cells. The public reader extracts them from those cells.
      if (data.profileImageFileId && (!old || data.profileImageFileId !== old.profileImageFileId))
        formStoreAsset_(data.profileImageFileId, '', token, 'profile', data.profileBackgroundMode);
      FORM_BG_KEYS.forEach(function (key) {
        const fileKey = key + 'BackgroundFileId';
        if (data[key + 'BackgroundMode'] !== 'DEFAULT' && data[fileKey] && (!old || data[fileKey] !== old[fileKey]))
          formStoreAsset_(data[fileKey], '', token, key + '_background', data[key + 'BackgroundMode']);
      });
      writeEmployeeSystem_(sheet, targetRow, {publicToken: token, formResponseId: responseId, processingStatus: 'COMPLETED', errorMessage: ''});
      if (existing && existing.row !== targetRow && typeof sheet.deleteRow === 'function') sheet.deleteRow(existing.row);
      return {status: existing ? 'UPDATED' : 'CREATED', publicToken: token, publicUrl: publicUrl_(token)};
    } catch (error) {
      writeEmployeeSystem_(sheet, targetRow, {publicToken: token, formResponseId: responseId, processingStatus: 'ERROR', errorMessage: formErrorMessage_(error)});
      throw error;
    }
  });
}

/** Map native Form titles (and historical title variants) to card fields. */
function formCard_(row) {
  const card = {publicToken: String(row.publicToken || '').trim(), formResponseId: String(row.formResponseId || '').trim(),
    processingStatus: String(row.processingStatus || '').trim(), errorMessage: String(row.errorMessage || '').trim()};
  Object.keys(row).forEach(function (header) {
    const key = formQuestionKey_(header);
    if (FORM_REQUIRED.concat(['mobilePhone', 'publicEmail']).indexOf(key) >= 0) card[key] = String(row[header] || '').trim();
    if (FORM_UPLOAD_KEYS.indexOf(key) >= 0) card[key] = formFileIdOrEmpty_(row[header]);
    if (FORM_BG_KEYS.some(function (background) { return key === background + 'BackgroundMode'; })) card[key] = FORM_MODE_LABELS[String(row[header] || '').trim()] || String(row[header] || '').trim();
  });
  card.googleAccountEmail = formAccount_(row);
  FORM_BG_KEYS.forEach(function (key) {
    const fileKey = key + 'BackgroundFileId', modeKey = key + 'BackgroundMode';
    if (card[fileKey] && !card[modeKey]) card[modeKey] = formStoredMediaKind_(card[fileKey]);
    if (!card[modeKey]) card[modeKey] = 'DEFAULT';
  });
  return card;
}
function formAccount_(row) {
  const key = Object.keys(row).find(function (header) { return /^(email address|이메일 주소|이메일)$/i.test(String(header).trim()); });
  return key ? String(row[key] || '').trim().toLowerCase() : String(row.googleAccountEmail || '').trim().toLowerCase();
}
function formFileIdOrEmpty_(value) {
  const text = String(value == null ? '' : value).trim();
  return text ? formFile_(text, '업로드 파일') : '';
}
function formStoredMediaKind_(fileId) {
  try { return DriveApp.getFileById(fileId).getMimeType() === 'video/mp4' ? 'VIDEO' : 'IMAGE'; }
  catch (error) { return 'DEFAULT'; }
}

const CARD_ID_PATTERN_ = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function ensureCardIdentity_(record, ss) {
  const next = Object.assign({}, record);
  if (!CARD_ID_PATTERN_.test(String(next.cardId || ''))) next.cardId = Utilities.getUuid().toLowerCase();
  if (!/^[a-z0-9]{12}$/.test(String(next.publicToken || ''))) {
    next.publicToken = formUniqueToken_(ss);
    next.publicUrl = formPublicUrl_(next.publicToken);
  }
  return next;
}

// Run once after fixing a failed Form response. It reuses the original response IDs,
// so existing cards keep their public token and URL.
function reprocessAllFormResponses() {
  const form = FormApp.openById(formId_());
  return form.getResponses().map(function (response) {
    try { return onFormSubmitCard({response: response}); }
    catch (error) { return {status: 'ERROR', responseId: response.getId(), error: formErrorMessage_(error)}; }
  });
}

function formErrorMessage_(error) {
  const message = String(error && error.message || error || '알 수 없는 오류').trim();
  return message.slice(0, 1000);
}

function formQuestionTitle_(key) { return FORM_QUESTION_TITLES[key] || key; }
function formQuestionKey_(title) { if (title === '프로필 사진') return 'profileImageFileId'; return Object.keys(FORM_QUESTION_TITLES).find(function (key) { return FORM_QUESTION_TITLES[key] === title; }) || title; }
function formQuestionHelp_(key) { if (key.indexOf('roleItem') === 0) return '명함의 업무 목록에 순서대로 표시됩니다. 최대 200자까지 입력할 수 있습니다.'; if (key === 'nameKo') return '명함에 표시할 한글 이름을 입력하세요. 예: 홍길동'; if (key === 'nameEn') return '명함에 표시할 영문 이름을 입력하세요. 예: Gildong Hong'; if (key === 'department') return '소속 부서를 입력하세요. 예: 브랜드전략팀'; return '명함에 표시할 내용을 입력하세요. 최대 100자까지 입력할 수 있습니다.'; }
function formAnswers_(response) { const out = {}; if (!response) return out; response.getItemResponses().forEach(function (ir) { const key = formQuestionKey_(ir.getItem().getTitle()); let v = ir.getResponse(); if (Array.isArray(v)) v = v[0] || ''; v = String(v == null ? '' : v).trim(); out[key] = key.endsWith('BackgroundMode') ? (FORM_MODE_LABELS[v] || v) : v; }); return out; }
function formValidate_(input, existing) {
  const normalized = Object.assign({}, input);
  if (String(input.profileImageFileId || '').trim())
    normalized.profileImageFileId = formFile_(input.profileImageFileId, '프로필 사진 또는 영상');
  FORM_BG_KEYS.forEach(function (key) {
    const modeKey = key + 'BackgroundMode', fileKey = key + 'BackgroundFileId';
    const mode = String(input[modeKey] || '').trim(), id = String(input[fileKey] || '').trim();
    if (!['', 'AUTO', 'DEFAULT', 'IMAGE', 'VIDEO'].includes(mode)) throw new Error(key + ': 배경 선택을 확인하세요.');
    if (mode === 'DEFAULT') {
      if (id) throw new Error(key + ': 기본 디자인 복원 시 파일을 첨부하지 마세요.');
      normalized[modeKey] = 'DEFAULT'; normalized[fileKey] = '';
    } else if (id) {
      normalized[fileKey] = formFile_(id, fileKey);
      normalized[modeKey] = formBackgroundModeForFile_(normalized[fileKey], fileKey);
      if (['IMAGE', 'VIDEO'].includes(mode) && mode !== normalized[modeKey]) throw new Error(key + ': 파일 유형과 선택이 다릅니다.');
    } else {
      if (['IMAGE', 'VIDEO'].includes(mode)) throw new Error(key + ': 배경 파일이 필요합니다.');
      normalized[modeKey] = ''; normalized[fileKey] = '';
    }
  });
  const out = validateCardInput_(normalized, existing);
  out.profileBackgroundMode = formBackgroundModeForFile_(out.profileImageFileId, '프로필 사진 또는 영상');
  FORM_BG_KEYS.forEach(function (key) {
    if (!normalized[key + 'BackgroundMode'] && existing) {
      out[key + 'BackgroundMode'] = 'KEEP_CURRENT'; out[key + 'BackgroundFileId'] = '';
    }
  });
  return out;
}
function formBackgroundModeForFile_(id, label) { const mime = String(DriveApp.getFileById(id).getMimeType() || '').toLowerCase(); const mode = ['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) >= 0 ? 'IMAGE' : mime === 'video/mp4' ? 'VIDEO' : ''; if (!mode) throw new Error(label + ': JPG, PNG, WEBP 이미지 또는 MP4 영상만 허용합니다.'); formInspectAsset_(id, mode, label); return mode; }
function formInspectAsset_(id, mode, label) { return inspectCardMedia_(id, mode, label); }
function formApplyBackground_(data, old, key, cardId) { const modeKey = key + 'BackgroundMode', fileKey = key + 'BackgroundFileId'; if (data[modeKey] === 'DEFAULT') return ''; if (data[modeKey] === 'KEEP_CURRENT') return old[fileKey] || ''; return formStoreAsset_(data[fileKey], '', cardId || old.cardId, key + '_background', data[modeKey]); }
function formStoreAsset_(id, oldId, cardId, label, mode) { if (!id) return ''; return storeCardAsset_(id, oldId, cardId, label, mode); }
function formTrashFiles_(a) { [a.profileImageFileId].concat(FORM_BG_KEYS.map(function (k) { return a[k + 'BackgroundFileId']; })).filter(Boolean).forEach(formTrashById_); }
function formTrashById_(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (err) {} }
function formUniqueToken_(ss) { return uniqueToken_(formRecords_(employeeSheet_(ss)), readRecords_(ss.getSheetByName('DeletedTokens'), 'DeletedTokens')); }
function formPublicUrl_(token) { return publicUrl_(token); }
function formRequired_(v, key, max) { const s = String(v == null ? '' : v).trim(); if (!s) throw new Error(key + ': 필수 입력입니다.'); if (s.length > max) throw new Error(key + ': 최대 ' + max + '자입니다.'); return s; }
function formEmail_(v, key) { const s = formRequired_(v, key, 254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error(key + ': 이메일 형식을 확인하세요.'); return s.toLowerCase(); }
function formFile_(v, key) {
  const s = formRequired_(v, key, 500);
  const match = s.match(/(?:[?&]id=|\/d\/)([A-Za-z0-9_-]+)/);
  const id = match ? match[1] : s;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(key + ': Drive 파일 ID 형식을 확인하세요.');
  return id;
}
function ensureFormSheet_(ss, name, headers) { let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name); if (!sh.getLastRow()) sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); sh.getRange(1,1,1,headers.length).setFontWeight('bold'); return sh; }
function formRecords_(sheet) { return readRecords_(sheet, ZNUS_EMPLOYEE_SHEET); }
function formWrite_(sheet, record, row) { return writeRecord_(sheet, ZNUS_EMPLOYEE_SHEET, record, row); }

/**
 * Form triggers expose FormResponse but not the destination row. Match the
 * row written by Forms using its timestamp and collected account email. The
 * response sheet can contain the system columns after the native Form columns.
 */
function findFormResponseRow_(sheet, response, account, rows) {
  const headers = sheetHeaders_(sheet);
  const timestampIndex = headers.findIndex(h => /^(timestamp|타임스탬프)$/i.test(String(h).trim()));
  const emailIndex = headers.findIndex(h => /^(email address|이메일 주소|이메일)$/i.test(String(h).trim()));
  const formTimestamp = response && typeof response.getTimestamp === 'function' ? response.getTimestamp() : null;
  const expectedTime = formTimestamp instanceof Date ? formTimestamp.getTime() : NaN;
  if (timestampIndex >= 0 || emailIndex >= 0) {
    const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
    for (let i = values.length - 1; i >= 0; i--) {
      const row = i + 2, value = values[i];
      const rowEmail = emailIndex >= 0 ? String(value[emailIndex] || '').trim().toLowerCase() : account;
      if (rowEmail !== account) continue;
      const rowTime = timestampIndex >= 0 && value[timestampIndex] instanceof Date ? value[timestampIndex].getTime() : NaN;
      if (Number.isFinite(expectedTime) && Number.isFinite(rowTime) && expectedTime !== rowTime) continue;
      const canonical = rows.find(entry => entry.row === row);
      if (!canonical || !canonical.value.formResponseId) return row;
    }
  }
  // Test doubles and manually imported responses may not have native Form
  // columns. Only reuse a blank system row; never overwrite a live employee.
  for (let i = sheet.getLastRow(); i >= 2; i--) {
    const row = rows.find(entry => entry.row === i);
    if (!row || !row.value.formResponseId) return i;
  }
  return null;
}

function mergeFormResponseRow_(sheet, sourceRow, targetRow) {
  const headers = sheetHeaders_(sheet);
  const source = sheet.getRange(sourceRow, 1, 1, headers.length).getValues()[0];
  const target = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
  const system = new Set(ZNUS_EMPLOYEE_SCHEMA);
  sheet.getRange(targetRow, 1, 1, headers.length).setValues([headers.map((header, i) => system.has(header) ? target[i] : source[i])]);
}

/** Remove old/native duplicate rows after their values have been folded into the master row. */
function removeDuplicateFormRows_(sheet, account, canonicalRow) {
  if (typeof sheet.deleteRow !== 'function') return;
  const headers = sheetHeaders_(sheet);
  const emailIndex = headers.findIndex(h => /^(email address|이메일 주소|이메일)$/i.test(String(h).trim()));
  const accountIndex = headers.indexOf('googleAccountEmail');
  const responseIndex = headers.indexOf('formResponseId');
  if (emailIndex < 0 || accountIndex < 0 || responseIndex < 0) return;
  for (let row = sheet.getLastRow(); row >= 2; row--) {
    if (row === canonicalRow) continue;
    const values = sheet.getRange(row, 1, 1, headers.length).getValues()[0];
    const nativeEmail = String(values[emailIndex] || '').trim().toLowerCase();
    if (nativeEmail === account && !String(values[accountIndex] || '').trim() && !String(values[responseIndex] || '').trim()) {
      sheet.deleteRow(row);
      if (row < canonicalRow) canonicalRow--;
    }
  }
}


/** Generated read adapter. Sheet-bound editor preview only. */
function getAdminPreviewCard(token) {
  if (!/^[a-z0-9]{12}$/.test(String(token || ''))) return null;
  const ss = publicSpreadsheet_();
  const raw = publicRows_(ss.getSheetByName('설문지 응답 시트1'));
  const card = raw.map(publicEmployeeCard_).find(function (row) { return row.publicToken === token; });
  if (!card || card.processingStatus !== 'COMPLETED' || !card.profileImageFileId) return null;
  const company = publicRows_(ss.getSheetByName('CompanySettings'))[0] || {};
  return {
    slug: token, name: card.nameKo, nameEn: card.nameEn, department: card.department,
    position: card.jobTitleKo, positionEn: card.jobTitleEn, phone: card.mobilePhone, email: card.publicEmail,
    address: String(company.officeAddress || ''), website: safeUrl_(company.companyWebsite),
    profileImageUrl: imageUrl_(card.profileImageFileId), logoUrl: imageUrl_(company.companyLogoFileId),
    publicUrl: publicUrlForToken_(token), companyName: String(company.companyName || ''),
    companyPhone: String(company.companyPhone || ''), companyFax: String(company.companyFax || ''),
    slogans: [1, 2, 3].map(function (i) { return String(company['sloganLine' + i] || ''); }),
    roles: [1, 2, 3, 4, 5].map(function (i) { return {ko: card['roleItem' + i + 'Ko'] || '', en: card['roleItem' + i + 'En'] || ''}; }),
    assetBase: safeUrl_(PropertiesService.getScriptProperties().getProperty('ZNUS_ASSET_BASE_URL')).replace(/\/+$/, ''),
    sections: ['profile', 'role', 'contact', 'company', 'links'].map(function (type) {
      const media = publicCardMedia_(card, type);
      return {type: type, kind: media.kind, imageUrl: media.kind === 'IMAGE' ? imageUrl_(media.fileId) : ''};
    })
  };
}
function getAdminPreviewMedia(token, section, useDefault) {
  const publicCard = getAdminPreviewCard(token);
  if (!publicCard || !['logo', 'profile', 'role', 'contact', 'company', 'links'].includes(section)) return null;
  const ss = publicSpreadsheet_();
  const card = publicRows_(ss.getSheetByName('설문지 응답 시트1')).map(publicEmployeeCard_)
    .find(function (row) { return row.publicToken === token; });
  const company = publicRows_(ss.getSheetByName('CompanySettings'))[0] || {};
  const media = publicCardMedia_(card, section);
  const defaultVideo = section !== 'logo' && (useDefault === true || media.kind === 'DEFAULT');
  if (section !== 'logo' && !defaultVideo && media.kind !== 'VIDEO') return null;
  const fileId = section === 'logo' ? company.companyLogoFileId : defaultVideo ? company[section + 'DefaultVideoFileId'] : media.fileId;
  if (!fileId) return null;
  const file = DriveApp.getFileById(fileId), mime = String(file.getMimeType() || '').toLowerCase();
  if (file.isTrashed() || file.getSize() > (section === 'logo' ? 2 : 30) * 1024 * 1024) throw new Error('미디어 크기를 확인해 주세요.');
  if (section === 'logo' ? !['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(mime) : mime !== 'video/mp4') throw new Error('지원하지 않는 미디어입니다.');
  return {mime: mime, base64: Utilities.base64Encode(file.getBlob().getBytes())};
}
function publicSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID');
  if (!id) throw new Error('공개 명함의 데이터 연결이 설정되지 않았습니다.');
  return SpreadsheetApp.openById(id);
}
function publicUrlForToken_(token) {
  const base = String(PropertiesService.getScriptProperties().getProperty('ZNUS_PUBLIC_BASE_URL') || '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(base)) return '';
  return base + (/^https:\/\/script\.google\.com\//.test(base) ? '?card=' : '/') + token;
}
function publicEmployeeCard_(row) {
  const names = {
    '이름 (국문)': 'nameKo', '이름 (영문)': 'nameEn', '부서': 'department', '직책 (국문)': 'jobTitleKo', '직책 (영문)': 'jobTitleEn',
    '공개 휴대전화': 'mobilePhone', '공개 이메일': 'publicEmail', '프로필 사진': 'profileImageFileId', '프로필 사진 또는 영상': 'profileImageFileId',
    '직무 카드 배경 파일': 'roleBackgroundFileId', '연락처 카드 배경 파일': 'contactBackgroundFileId', '회사 카드 배경 파일': 'companyBackgroundFileId', '링크 카드 배경 파일': 'linksBackgroundFileId',
    '직무 카드 배경': 'roleBackgroundMode', '연락처 카드 배경': 'contactBackgroundMode', '회사 카드 배경': 'companyBackgroundMode', '링크 카드 배경': 'linksBackgroundMode'
  };
  [1,2,3,4,5].forEach(function (i) { names['주요 업무 ' + i + ' (국문)'] = 'roleItem' + i + 'Ko'; names['주요 업무 ' + i + ' (영문)'] = 'roleItem' + i + 'En'; });
  const card = {publicToken: String(row.publicToken || '').trim(), processingStatus: String(row.processingStatus || '').trim()};
  Object.keys(row).forEach(function (header) {
    const key = names[header] || header;
    if (/^(nameKo|nameEn|department|jobTitleKo|jobTitleEn|mobilePhone|publicEmail|profileImageFileId|roleItem[1-5](Ko|En)|(?:role|contact|company|links)Background(FileId|Mode))$/.test(key)) card[key] = String(row[header] || '').trim();
  });
  ['profileImageFileId', 'roleBackgroundFileId', 'contactBackgroundFileId', 'companyBackgroundFileId', 'linksBackgroundFileId'].forEach(function (key) { card[key] = publicFileId_(card[key]); });
  ['role', 'contact', 'company', 'links'].forEach(function (type) {
    const mode = card[type + 'BackgroundMode'];
    card[type + 'BackgroundMode'] = mode === '기본 디자인 사용' || !card[type + 'BackgroundFileId'] ? 'DEFAULT' : mode || publicMediaKind_(card[type + 'BackgroundFileId']);
  });
  return card;
}
function publicFileId_(value) {
  const text = String(value || '').trim(), match = text.match(/(?:[?&]id=|\/d\/)([A-Za-z0-9_-]+)/);
  return match ? match[1] : /^[A-Za-z0-9_-]+$/.test(text) ? text : '';
}
function publicMediaKind_(fileId) {
  try { return DriveApp.getFileById(fileId).getMimeType() === 'video/mp4' ? 'VIDEO' : 'IMAGE'; }
  catch (error) { return 'DEFAULT'; }
}
function legacyGetPublicCard_(token) {
  if (typeof token !== 'string' || !/^[a-z0-9]{12}$/.test(token)) return null;
  const id = PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID');
  if (!id) throw new Error('공개 명함의 데이터 연결이 설정되지 않았습니다.');
  const ss = SpreadsheetApp.openById(id);
  const cards = publicRows_(ss.getSheetByName('설문지 응답 시트1'));
  const card = cards.find(row => row.publicToken === token);
  if (!card) return null;
  // A profile has no shared default. An incomplete card must never fall back to
  // the design's local placeholder media on its public URL.
  if (!String(card.profileImageFileId || '').trim()) return null;
  // Explicit allowlist. Never return account email, cardId, processing errors, or raw rows.
  const company = publicRows_(ss.getSheetByName('CompanySettings'))[0] || {};
  return {
    slug: token, name: String(card.nameKo || ''), nameEn: String(card.nameEn || ''),
    department: String(card.department || ''), position: String(card.jobTitleKo || ''), positionEn: String(card.jobTitleEn || ''),
    phone: String(card.mobilePhone || ''), email: String(card.publicEmail || ''),
    address: String(company.officeAddress || ''), website: safeUrl_(company.companyWebsite),
    profileImageUrl: imageUrl_(card.profileImageFileId), logoUrl: imageUrl_(company.companyLogoFileId),
    publicUrl: safeUrl_(card.publicUrl), companyName: String(company.companyName || ''),
    companyPhone: String(company.companyPhone || ''), companyFax: String(company.companyFax || ''),
    slogans: [1,2,3].map(i => String(company['sloganLine' + i] || '')),
    roles: [1,2,3,4,5].map(i => ({ko: String(card['roleItem' + i + 'Ko'] || ''), en: String(card['roleItem' + i + 'En'] || '')})),
    assetBase: safeUrl_(PropertiesService.getScriptProperties().getProperty('ZNUS_ASSET_BASE_URL')).replace(/\/+$/, ''),
    sections: ['profile', 'role', 'contact', 'company', 'links'].map(type => {
      const media = publicCardMedia_(card, type);
      return {type: type, kind: media.kind, imageUrl: media.kind === 'IMAGE' ? imageUrl_(media.fileId) : ''};
    })
  };
}
/** File IDs are resolved on the server; callers cannot request arbitrary Drive files. */
function legacyGetPublicMedia_(token, section, useDefault) {
  if (!getAdminPreviewCard(token)) return null;
  if (!['logo', 'profile', 'role', 'contact', 'company', 'links'].includes(section)) return null;
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID'));
  const card = publicRows_(ss.getSheetByName('설문지 응답 시트1')).find(row => row.publicToken === token);
  if (!card) return null;
  const company = publicRows_(ss.getSheetByName('CompanySettings'))[0] || {};
  const media = publicCardMedia_(card, section);
  const defaultVideo = section !== 'logo' && (useDefault === true || media.kind === 'DEFAULT');
  if (section !== 'logo' && !defaultVideo && media.kind !== 'VIDEO') return null;
  const fileId = section === 'logo' ? company.companyLogoFileId : defaultVideo ? company[section + 'DefaultVideoFileId'] : media.fileId;
  if (!fileId) return null;
  const file = DriveApp.getFileById(fileId);
  const mime = file.getMimeType();
  if (file.isTrashed() || file.getSize() > (section === 'logo' ? 2 : 30) * 1024 * 1024) throw new Error('미디어 크기를 확인해 주세요.');
  if (section === 'logo' ? !['image/jpeg','image/png','image/webp','image/svg+xml'].includes(mime) : mime !== 'video/mp4') throw new Error('지원하지 않는 미디어입니다.');
  return {mime: mime, base64: Utilities.base64Encode(file.getBlob().getBytes())};
}
function publicCardMedia_(card, type) {
  if (type === 'profile') {
    // Old rows used this field for a photo and may have an unrelated background mode.
    // Infer from the canonical file itself so both old photos and new videos work.
    if (!card.profileImageFileId) return {kind: 'DEFAULT', fileId: ''};
    let kind = 'IMAGE';
    try { kind = DriveApp.getFileById(card.profileImageFileId).getMimeType() === 'video/mp4' ? 'VIDEO' : 'IMAGE'; } catch (error) {}
    return {kind: kind, fileId: card.profileImageFileId};
  }
  return {kind: String(card[type + 'BackgroundMode'] || 'DEFAULT'), fileId: card[type + 'BackgroundFileId'] || ''};
}
function publicTrue_(value) { return value === true || String(value).toUpperCase() === 'TRUE'; }
function publicRows_(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values.shift().map(String);
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) return [];
  return values.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i]])));
}
function imageUrl_(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]+$/.test(id) ?
    'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600' : '';
}
function safeUrl_(value) {
  const url = String(value || '').trim();
  return /^https?:\/\//i.test(url) ? url : '';
}


/** These RPCs run only in the Sheet-bound dialog as the signed-in editor. */
/** Web entry point for the administrator dashboard during the Drive integration test. */
function doGet() {
  return adminGalleryOutput_()
    .setTitle('ZNUS 직원 명함 갤러리')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
function showAdminDashboard() {
  connectAdminWorkspace();
  SpreadsheetApp.getUi().showModalDialog(
    adminGalleryOutput_().setWidth(1440).setHeight(900),
    'ZNUS 직원 명함 갤러리'
  );
}
function adminGalleryOutput_() {
  const html = HtmlService.createHtmlOutputFromFile('AdminGallery').getContent();
  const qr = HtmlService.createHtmlOutputFromFile('QrLibrary').getContent();
  return HtmlService.createHtmlOutput(html.replace('<script>', () => qr + '<script>'));
}
function safeAdminJson_(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/'/g, '\\u0027')
    .replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}
/** Connect an existing database without creating folders or changing Form triggers. */
function connectAdminWorkspace() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw new Error('명함 데이터베이스 Google Sheet에 연결된 프로젝트에서 실행하세요.');
  const props = PropertiesService.getScriptProperties();
  const configured = props.getProperty('ZNUS_SPREADSHEET_ID');
  if (configured && configured !== ss.getId()) throw new Error('현재 시트와 설정된 데이터베이스가 다릅니다. 연결 설정을 확인하세요.');
  workspaceSchemaNames_().forEach(name => readRecords_(ss.getSheetByName(name), name));
  props.setProperty('ZNUS_SPREADSHEET_ID', ss.getId());
  return {spreadsheetId: ss.getId()};
}
function getAdminDashboard() {
  const cards = getEmployees();
  return {cards: cards, company: getCompanySettings() || {}, stats: {
    total: cards.length, public: cards.filter(function (card) { return card.status === '생성완료'; }).length,
    private: cards.filter(function (card) { return card.status !== '생성완료'; }).length,
    processing: cards.filter(function (card) { return card.status === '입력완료'; }).length,
    error: cards.filter(function (card) { return card.status === '검토필요'; }).length
  }};
}
/** Adapter for the existing Admin.html gallery design. The source of truth is the Form response sheet. */
function getEmployees() {
  const company = getCompanySettings() || {};
  const text = function (value) { return String(value == null ? '' : value).trim(); };
  const records = formRecords_(employeeSheet_(workspace_()));
  return records.map(function (entry) {
    const card = formCard_(entry.value);
    const complete = card.processingStatus === 'COMPLETED' && /^[a-z0-9]{12}$/.test(card.publicToken);
    const status = card.processingStatus === 'ERROR' ? '검토필요' : complete ? '생성완료' : '입력완료';
    return {
      employeeId: card.publicToken || ('row-' + entry.row), name: text(card.nameKo), nameEn: text(card.nameEn),
      department: text(card.department), position: text(card.jobTitleKo), positionEn: text(card.jobTitleEn),
      accountEmail: text(card.googleAccountEmail),
      roles: [1,2,3,4,5].map(function (i) { return {ko: text(card['roleItem' + i + 'Ko']), en: text(card['roleItem' + i + 'En'])}; }),
      backgrounds: ['profile', 'role', 'contact', 'company', 'links'].map(function (key) {
        const media = publicCardMedia_(card, key); return {type: key, mode: media.kind};
      }),
      errorMessage: text(card.errorMessage),
      missingFields: ZNUS_REQUIRED_TEXT.concat(['mobilePhone', 'publicEmail', 'profileImageFileId']).filter(function (key) { return !text(card[key]); }),
      profileImage: imageUrl_(text(card.profileImageFileId)), phone: text(card.mobilePhone), email: text(card.publicEmail),
      companyPhone: text(company.companyPhone), companyAddress: text(company.officeAddress),
      mobileUrl: complete ? publicUrl_(card.publicToken) : '', status: status,
      updatedAt: text(entry.value.Timestamp || entry.value['타임스탬프'] || '')
    };
  });
}
function legacyGetEmployees_() {
  const cards = readRecords_(employeeSheet_(workspace_()), ZNUS_EMPLOYEE_SHEET).map(entry => entry.value);
  const company = getCompanySettings() || {};
  const text = value => String(value == null ? '' : value).trim();
  const status = value => {
    const state = text(value).toUpperCase();
    if (state === 'COMPLETED') return '생성완료';
    if (state === 'ERROR') return '검토필요';
    return '입력완료';
  };
  return cards.map(card => ({
    employeeId: text(card.cardId),
    name: text(card.nameKo),
    nameEn: text(card.nameEn),
    department: text(card.department),
    position: text(card.jobTitleKo),
    positionEn: text(card.jobTitleEn),
    accountEmail: text(card.googleAccountEmail),
    roles: [1, 2, 3, 4, 5].map(i => ({ko: text(card['roleItem' + i + 'Ko']), en: text(card['roleItem' + i + 'En'])})),
    backgrounds: ['profile', 'role', 'contact', 'company', 'links'].map(key => ({type: key, mode: publicCardMedia_(card, key).kind})),
    errorMessage: text(card.errorMessage),
    missingFields: ZNUS_REQUIRED_TEXT.concat(['mobilePhone', 'publicEmail', 'profileImageFileId']).filter(key => !text(card[key])),
    profileImage: imageUrl_(text(card.profileImageFileId)),
    phone: text(card.mobilePhone),
    email: text(card.publicEmail),
    companyPhone: text(company.companyPhone),
    companyAddress: text(company.officeAddress),
    mobileUrl: safeUrl_(card.publicUrl),
    status: status(card.processingStatus),
    updatedAt: text(card.updatedAt)
  }));
}
function adminCard_(id, revision) {
  const sheet = employeeSheet_(workspace_());
  const entry = readRecords_(sheet, ZNUS_EMPLOYEE_SHEET).find(entry => entry.value.cardId === id);
  if (!entry) throw new Error('명함을 찾을 수 없습니다. 목록을 새로고침해 주세요.');
  if (String(entry.value.updatedAt) !== String(revision)) throw new Error('다른 작업에서 명함이 변경되었습니다. 새로고침 후 다시 수정해 주세요.');
  if (entry.value.processingStatus === 'PROCESSING') throw new Error('설문을 처리하고 있습니다. 처리가 끝나면 다시 시도해 주세요.');
  return {sheet: sheet, entry: entry};
}
function setAdminCardState(id, revision, action) {
  throw new Error('대시보드는 조회 전용입니다. 직원 삭제는 Sheets에서 처리하세요.');
}
function saveAdminCard(id, revision, input) {
  throw new Error('대시보드는 조회 전용입니다. 정보 수정은 Google Form에서 제출하세요.');
}
function openAdminPreview(token) {
  if (!/^[a-z0-9]{12}$/.test(String(token))) throw new Error('명함 주소를 확인하세요.');
  const template = HtmlService.createTemplateFromFile('Preview'); template.slug = token;
  SpreadsheetApp.getUi().showModalDialog(template.evaluate().setWidth(430).setHeight(760), '명함 미리보기 · 비공개 명함도 표시됩니다');
}
function saveAdminPublicBaseUrl(url) { return configurePublicBaseUrl_(url); }


/** Sheet-bound administration only. Never deploy as a public web app. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('ZNUS 명함 서비스')
    .addItem('명함 관리', 'showAdminDashboard')
    .addItem('운영 기반 확인', 'showAdminSidebar')
    .addItem('초기 설정 / 점검', 'setupWorkspace').addToUi();
}
function showAdminSidebar() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('ZNUS 운영 기반'));
}
/** Repeatable; preflight ALL schemas before mutating anything. */
function setupWorkspace() {
  return withWorkspaceLock_(function () {
    const ss = SpreadsheetApp.getActive();
    if (!ss) throw new Error('운영 Google Sheet에 바인드된 스크립트에서 실행하세요.');
    workspaceSchemaNames_().forEach(name => inspectSchema_(ss.getSheetByName(name), name));
    workspaceSchemaNames_().forEach(name => ensureSheet_(ss, name));
    const folders = ensureWorkspaceFolders_();
    PropertiesService.getScriptProperties().setProperties({
      ZNUS_SPREADSHEET_ID: ss.getId(), ZNUS_SCHEMA_VERSION: '1'
    });
    return workspaceInfo_(ss, folders);
  });
}
function getWorkspaceInfo() { return workspaceInfo_(workspace_(), readFolderConfig_()); }
function workspaceInfo_(ss, folders) {
  return {
    spreadsheetId: ss.getId(), spreadsheetUrl: ss.getUrl(), folders: folders,
    schemaVersion: PropertiesService.getScriptProperties().getProperty('ZNUS_SCHEMA_VERSION'),
    cardCount: readRecords_(employeeSheet_(ss), ZNUS_EMPLOYEE_SHEET).length,
    deletedTokenCount: readRecords_(ss.getSheetByName('DeletedTokens'), 'DeletedTokens').length,
    publicBaseUrl: PropertiesService.getScriptProperties().getProperty('ZNUS_PUBLIC_BASE_URL') || '',
    message: '직원 수정은 Google Form, 조회는 설문지 응답 시트1의 직원 행으로 처리합니다. 직원 행 삭제 전 publicToken을 DeletedTokens에 보존하세요.'
  };
}
