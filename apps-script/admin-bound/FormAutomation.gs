const FORM_AUTOMATION_SHEET_ID = '1FlJ8xn523nMo07iVwm-5TaWCfCHt4Q8_KqdZhyjrO_Y';
const FORM_AUTOMATION_FORM_ID = '1xnDZARmNjZtz8OwLCkVv8Tw14JC-M_VS2pjdA7fdCqA';
const FORM_CARD_HEADERS = ['cardId','googleAccountEmail','publicToken','published','isActive','nameKo','nameEn','department','jobTitleKo','jobTitleEn','roleItem1Ko','roleItem2Ko','roleItem3Ko','roleItem4Ko','roleItem5Ko','roleItem1En','roleItem2En','roleItem3En','roleItem4En','roleItem5En','mobilePhone','publicEmail','profileImageFileId','roleBackgroundMode','roleBackgroundFileId','contactBackgroundMode','contactBackgroundFileId','companyBackgroundMode','companyBackgroundFileId','linksBackgroundMode','linksBackgroundFileId','publicUrl','qrUrl','nfcStatus','formResponseId','createdAt','updatedAt','processingStatus','errorMessage'];
const FORM_BG_KEYS = ['role','contact','company','links'];
const FORM_REQUIRED = ['nameKo','nameEn','department','jobTitleKo','jobTitleEn','roleItem1Ko','roleItem2Ko','roleItem3Ko','roleItem4Ko','roleItem5Ko','roleItem1En','roleItem2En','roleItem3En','roleItem4En','roleItem5En'];

function setupFormAutomationWorkspace() {
  return withWorkspaceLock_(function () {
    const ss = SpreadsheetApp.openById(FORM_AUTOMATION_SHEET_ID);
    ensureFormSheet_(ss, 'Cards', FORM_CARD_HEADERS);
    ensureFormSheet_(ss, 'CompanySettings', ['companyName','companyWebsite','companyPhone','companyFax','officeAddress','companyLogoFileId','sloganLine1','sloganLine2','sloganLine3']);
    ensureFormSheet_(ss, 'DeletedTokens', ['publicToken']);
    PropertiesService.getScriptProperties().setProperty('ZNUS_SPREADSHEET_ID', FORM_AUTOMATION_SHEET_ID);
    return ss.getUrl();
  });
}

function setupFormAutomationForm() {
  const form = FormApp.openById(FORM_AUTOMATION_FORM_ID);
  form.setTitle('ZNUS 디지털 명함 입력').setDescription('신규 명함 생성과 기존 명함 수정을 위한 입력 양식입니다. 수정 시 기존 공개 토큰과 주소는 유지됩니다.').setCollectEmail(true).setLimitOneResponsePerUser(false).setShowLinkToRespondAgain(true);
  form.getItems().forEach(function (item) { form.deleteItem(item); });
  FORM_REQUIRED.forEach(function (key) { form.addTextItem().setTitle(key).setHelpText('최대 ' + (key.indexOf('roleItem') === 0 ? 200 : 100) + '자').setRequired(true); });
  form.addTextItem().setTitle('mobilePhone').setHelpText('공개 휴대전화').setRequired(true);
  form.addTextItem().setTitle('publicEmail').setRequired(true);
  form.addFileUploadItem().setTitle('profileImageFileId').setHelpText('JPG, PNG, WEBP 이미지 1개').setRequired(true);
  FORM_BG_KEYS.forEach(function (key) {
    form.addMultipleChoiceItem().setTitle(key + 'BackgroundMode').setChoiceValues(['KEEP_CURRENT','DEFAULT','IMAGE','VIDEO']).setRequired(true);
    form.addFileUploadItem().setTitle(key + 'BackgroundFileId').setRequired(false);
  });
  form.setDestination(FormApp.DestinationType.SPREADSHEET, FORM_AUTOMATION_SHEET_ID);
  if (!ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'onFormSubmitCard'; })) ScriptApp.newTrigger('onFormSubmitCard').forForm(form).onFormSubmit().create();
  return { editUrl: form.getEditUrl(), publishedUrl: form.getPublishedUrl(), itemCount: form.getItems().length };
}

function onFormSubmitCard(e) {
  return withWorkspaceLock_(function () {
    const ss = SpreadsheetApp.openById(FORM_AUTOMATION_SHEET_ID), sheet = ss.getSheetByName('Cards');
    const answers = formAnswers_(e && e.response), account = String((e && e.response && e.response.getRespondentEmail()) || '').trim().toLowerCase();
    if (!account) throw new Error('응답자 Google 계정을 확인할 수 없습니다. Form의 이메일 수집을 켜세요.');
    answers.googleAccountEmail = account;
    const rows = formRecords_(sheet), existing = rows.find(function (r) { return String(r.value.googleAccountEmail).toLowerCase() === account; });
    if (existing && String(existing.value.isActive).toLowerCase() !== 'true') { formTrashFiles_(answers); return { status: 'SKIPPED_INACTIVE', row: existing.row }; }
    const data = formValidate_(answers, existing && existing.value), now = new Date().toISOString(), responseId = e && e.response ? e.response.getId() : '';
    if (existing) {
      const next = Object.assign({}, existing.value, data, { googleAccountEmail: account, formResponseId: responseId, updatedAt: now, processingStatus: 'COMPLETED', errorMessage: '' });
      next.profileImageFileId = formStoreAsset_(data.profileImageFileId, existing.value.profileImageFileId, existing.value.cardId, 'profile');
      FORM_BG_KEYS.forEach(function (key) { next[key + 'BackgroundFileId'] = formApplyBackground_(data, existing.value, key); });
      formWrite_(sheet, next, existing.row); return { status: 'UPDATED', cardId: existing.value.cardId, publicToken: existing.value.publicToken };
    }
    const token = formUniqueToken_(ss), cardId = Utilities.getUuid().toLowerCase(), record = Object.assign({}, data, { cardId: cardId, googleAccountEmail: account, publicToken: token, published: false, isActive: true, publicUrl: formPublicUrl_(token), qrUrl: '', nfcStatus: '', formResponseId: responseId, createdAt: now, updatedAt: now, processingStatus: 'COMPLETED', errorMessage: '' });
    record.profileImageFileId = formStoreAsset_(data.profileImageFileId, '', cardId, 'profile'); FORM_BG_KEYS.forEach(function (key) { record[key + 'BackgroundFileId'] = formApplyBackground_(data, {}, key, cardId); }); formWrite_(sheet, record); return { status: 'CREATED', cardId: cardId, publicToken: token, publicUrl: record.publicUrl };
  });
}

function formAnswers_(response) { const out = {}; if (!response) return out; response.getItemResponses().forEach(function (ir) { let v = ir.getResponse(); if (Array.isArray(v)) v = v[0] || ''; out[ir.getItem().getTitle()] = String(v == null ? '' : v).trim(); }); return out; }
function formValidate_(input, existing) { const out = {}; FORM_REQUIRED.forEach(function (key) { out[key] = formRequired_(input[key], key, key.indexOf('roleItem') === 0 ? 200 : 100); }); out.mobilePhone = formRequired_(input.mobilePhone, 'mobilePhone', 40); if (!/^\+?[0-9 ()-]+$/.test(out.mobilePhone) || out.mobilePhone.replace(/\D/g, '').length < 7) throw new Error('mobilePhone 형식이 올바르지 않습니다.'); out.publicEmail = formEmail_(input.publicEmail, 'publicEmail'); out.profileImageFileId = formFile_(input.profileImageFileId, 'profileImageFileId'); FORM_BG_KEYS.forEach(function (key) { const modeKey = key + 'BackgroundMode', fileKey = key + 'BackgroundFileId', mode = String(input[modeKey] || '').trim() || (existing ? 'KEEP_CURRENT' : 'DEFAULT'), id = String(input[fileKey] || '').trim(); if (mode === 'KEEP_CURRENT') { out[modeKey] = existing ? existing[modeKey] : 'DEFAULT'; out[fileKey] = existing ? existing[fileKey] : ''; } else if (mode === 'DEFAULT') { if (id) throw new Error(key + ': DEFAULT에는 파일을 지정할 수 없습니다.'); out[modeKey] = mode; out[fileKey] = ''; } else if (mode === 'IMAGE' || mode === 'VIDEO') { out[modeKey] = mode; out[fileKey] = formFile_(id, fileKey); } else throw new Error(key + ': 배경 유형이 올바르지 않습니다.'); }); return out; }
function formApplyBackground_(data, old, key, cardId) { const modeKey = key + 'BackgroundMode', fileKey = key + 'BackgroundFileId'; if (data[modeKey] === 'DEFAULT') { if (old[fileKey]) formTrashById_(old[fileKey]); return ''; } if (data[modeKey] === 'KEEP_CURRENT') return old[fileKey] || ''; return formStoreAsset_(data[fileKey], old[fileKey] || '', cardId || old.cardId, key + '_background'); }
function formStoreAsset_(id, oldId, cardId, label) { if (!id) return ''; if (oldId && oldId !== id) formTrashById_(oldId); const file = DriveApp.getFileById(id); file.setName(label + '_' + file.getName()); file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); return file.getId(); }
function formTrashFiles_(a) { [a.profileImageFileId].concat(FORM_BG_KEYS.map(function (k) { return a[k + 'BackgroundFileId']; })).filter(Boolean).forEach(formTrashById_); }
function formTrashById_(id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (err) {} }
function formUniqueToken_(ss) { const used = new Set(formRecords_(ss.getSheetByName('Cards')).map(function (r) { return r.value.publicToken; })), d = ss.getSheetByName('DeletedTokens'); if (d.getLastRow() > 1) d.getRange(2,1,d.getLastRow()-1,1).getValues().forEach(function (r) { used.add(String(r[0])); }); for (let i = 0; i < 100; i++) { const t = Utilities.getUuid().replace(/-/g, '').slice(0, 12).toLowerCase(); if (!used.has(t)) return t; } throw new Error('고유 publicToken 생성에 실패했습니다.'); }
function formPublicUrl_(token) { const b = PropertiesService.getScriptProperties().getProperty('ZNUS_PUBLIC_BASE_URL'); return b ? b.replace(/\/+$/, '') + (b.indexOf('script.google.com') >= 0 ? '?card=' : '/') + token : ''; }
function formRequired_(v, key, max) { const s = String(v == null ? '' : v).trim(); if (!s) throw new Error(key + ': 필수 입력입니다.'); if (s.length > max) throw new Error(key + ': 최대 ' + max + '자입니다.'); return s; }
function formEmail_(v, key) { const s = formRequired_(v, key, 254); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new Error(key + ': 이메일 형식을 확인하세요.'); return s.toLowerCase(); }
function formFile_(v, key) { const s = formRequired_(v, key, 200); if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error(key + ': Drive 파일 ID 형식을 확인하세요.'); return s; }
function ensureFormSheet_(ss, name, headers) { let sh = ss.getSheetByName(name); if (!sh) sh = ss.insertSheet(name); if (!sh.getLastRow()) sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); sh.getRange(1,1,1,headers.length).setFontWeight('bold'); return sh; }
function formRecords_(sheet) { if (!sheet || sheet.getLastRow() < 2) return []; const h = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String); return sheet.getRange(2,1,sheet.getLastRow()-1,h.length).getValues().map(function (v,i) { return { row:i+2, value:Object.fromEntries(h.map(function (k,j) { return [k,v[j]]; })) }; }).filter(function (r) { return Object.values(r.value).some(function (v) { return v !== ''; }); }); }
function formWrite_(sheet, record, row) { const h = sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String), target = row || sheet.getLastRow() + 1; sheet.getRange(target,1,1,h.length).setNumberFormat('@').setValues([h.map(function (k) { return record[k] == null ? '' : record[k]; })]); }
