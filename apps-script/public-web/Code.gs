/** Read-only public project. Do not copy admin-bound files into this project. */
function doGet(event) {
  const token = String(event && event.parameter && event.parameter.card || '').trim();
  const template = HtmlService.createTemplateFromFile('Card');
  // Card.html embeds this in JavaScript; only the token alphabet may cross that boundary.
  template.slug = /^[a-z0-9]{12}$/.test(token) ? token : '';
  const output = template.evaluate()
    .setTitle('ZNUS Digital Card')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  // Apps Script exposes this mode in production; the guard keeps local source tests portable.
  if (HtmlService.XFrameOptionsMode && output.setXFrameOptionsMode) {
    output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return output;
}
/** Read the Form response row directly. No employee data is duplicated into system columns. */
function getPublicCard(token) {
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
function getPublicMedia(token, section, useDefault) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    if (!/^[a-z0-9]{12}$/.test(String(token || '')) || !['logo', 'profile', 'role', 'contact', 'company', 'links'].includes(section)) return null;
    const ss = publicSpreadsheet_();
    const card = publicRows_(ss.getSheetByName('설문지 응답 시트1')).map(publicEmployeeCard_)
      .find(function (row) { return row.publicToken === token; });
    if (!card || card.processingStatus !== 'COMPLETED' || !card.profileImageFileId) return null;
    const company = publicRows_(ss.getSheetByName('CompanySettings'))[0] || {};
    let fileId = '';
    let expectedKind = 'VIDEO';
    if (section === 'logo') {
      fileId = publicFileId_(company.companyLogoFileId);
      expectedKind = 'IMAGE';
    } else if (section === 'profile') {
      fileId = publicFileId_(card.profileImageFileId);
      expectedKind = '';
    } else {
      const customId = publicFileId_(card[section + 'BackgroundFileId']);
      const mode = String(card[section + 'BackgroundMode'] || '').trim();
      const defaultVideo = useDefault === true || mode === 'DEFAULT' || !customId;
      fileId = publicFileId_(defaultVideo ? company[section + 'DefaultVideoFileId'] : customId);
    }
    if (!fileId) return null;
    const file = DriveApp.getFileById(fileId);
    if (file.isTrashed() || file.getSize() > (section === 'logo' ? 2 : 30) * 1024 * 1024) throw new Error('미디어 크기를 확인해 주세요.');
    const kind = publicDriveMediaKind_(file);
    if (expectedKind && kind !== expectedKind) throw new Error('지원하지 않는 미디어입니다.');
    if (!expectedKind && !kind) throw new Error('지원하지 않는 미디어입니다.');
    const mime = publicDriveMediaMime_(file, kind);
    return {mime: mime, base64: Utilities.base64Encode(file.getBlob().getBytes())};
  } finally {
    lock.releaseLock();
  }
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
  try { return publicDriveMediaKind_(DriveApp.getFileById(fileId)) || 'IMAGE'; }
  catch (error) { return 'DEFAULT'; }
}
function publicDriveMediaKind_(file) {
  const mime = String(file.getMimeType() || '').toLowerCase();
  const name = String(file.getName() || '').toLowerCase();
  if (mime === 'video/mp4' || /\.mp4$/.test(name)) return 'VIDEO';
  if (['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(mime) || /\.(jpe?g|png|webp|svg)$/.test(name)) return 'IMAGE';
  return '';
}
function publicDriveMediaMime_(file, kind) {
  const mime = String(file.getMimeType() || '').toLowerCase();
  if (kind === 'VIDEO') return 'video/mp4';
  if (['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'].includes(mime)) return mime;
  const name = String(file.getName() || '').toLowerCase();
  return /\.svg$/.test(name) ? 'image/svg+xml' : /\.webp$/.test(name) ? 'image/webp' : /\.png$/.test(name) ? 'image/png' : 'image/jpeg';
}
function legacyGetPublicCard_(token) {
  if (typeof token !== 'string' || !/^[a-z0-9]{12}$/.test(token)) return null;
  const id = PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID');
  if (!id) throw new Error('공개 명함의 데이터 연결이 설정되지 않았습니다.');
  const ss = SpreadsheetApp.openById(id);
  const cards = publicRows_(ss.getSheetByName('설문지 응답 시트1'));
  const card = cards.find(row => row.publicToken === token);
  if (!card || !publicTrue_(card.published) || !publicTrue_(card.isActive)) return null;
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
  if (!getPublicCard(token)) return null;
  if (!['logo', 'profile', 'role', 'contact', 'company', 'links'].includes(section)) return null;
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID'));
  const card = publicRows_(ss.getSheetByName('설문지 응답 시트1')).find(row => row.publicToken === token);
  if (!card || !publicTrue_(card.published) || !publicTrue_(card.isActive)) return null;
  const company = publicRows_(ss.getSheetByName('CompanySettings'))[0] || {};
  const media = publicCardMedia_(card, section);
  const defaultVideo = section !== 'logo' && (useDefault === true || media.kind === 'DEFAULT');
  if (section !== 'logo' && !defaultVideo && media.kind !== 'VIDEO') return null;
  const fileId = section === 'logo' ? company.companyLogoFileId : defaultVideo ? company[section + 'DefaultVideoFileId'] : media.fileId;
  if (!fileId) return null;
  const file = DriveApp.getFileById(fileId);
  if (file.isTrashed() || file.getSize() > (section === 'logo' ? 2 : 30) * 1024 * 1024) throw new Error('미디어 크기를 확인해 주세요.');
  const kind = section === 'logo' ? 'IMAGE' : 'VIDEO';
  if (publicDriveMediaKind_(file) !== kind) throw new Error('지원하지 않는 미디어입니다.');
  const mime = publicDriveMediaMime_(file, kind);
  return {mime: mime, base64: Utilities.base64Encode(file.getBlob().getBytes())};
}
function publicCardMedia_(card, type) {
  if (type === 'profile') {
    // Old rows used this field for a photo and may have an unrelated background mode.
    // Infer from the canonical file itself so both old photos and new videos work.
    if (!card.profileImageFileId) return {kind: 'DEFAULT', fileId: ''};
    let kind = 'IMAGE';
    try { kind = publicDriveMediaKind_(DriveApp.getFileById(card.profileImageFileId)) || 'IMAGE'; } catch (error) {}
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
