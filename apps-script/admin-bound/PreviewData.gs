/** Generated read adapter. Sheet-bound editor preview only. */
function getAdminPreviewCard(token) {
  if (typeof token !== 'string' || !/^[a-z0-9]{12}$/.test(token)) return null;
  const id = PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID');
  if (!id) throw new Error('공개 명함의 데이터 연결이 설정되지 않았습니다.');
  const ss = SpreadsheetApp.openById(id);
  const cards = publicRows_(ss.getSheetByName('Cards'));
  const card = cards.find(row => row.publicToken === token);
  if (!card) return null;
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
    sections: ['role', 'contact', 'company', 'links'].map(type => ({
      type: type, kind: String(card[type + 'BackgroundMode'] || 'DEFAULT'),
      imageUrl: card[type + 'BackgroundMode'] === 'IMAGE' ? imageUrl_(card[type + 'BackgroundFileId']) : ''
    }))
  };
}
/** File IDs are resolved on the server; callers cannot request arbitrary Drive files. */
function getAdminPreviewMedia(token, section) {
  if (!getAdminPreviewCard(token)) return null;
  if (!['logo', 'role', 'contact', 'company', 'links'].includes(section)) return null;
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID'));
  const card = publicRows_(ss.getSheetByName('Cards')).find(row => row.publicToken === token);
  if (!card) return null;
  const company = publicRows_(ss.getSheetByName('CompanySettings'))[0] || {};
  if (section !== 'logo' && card[section + 'BackgroundMode'] !== 'VIDEO') return null;
  const file = DriveApp.getFileById(section === 'logo' ? company.companyLogoFileId : card[section + 'BackgroundFileId']);
  const mime = file.getMimeType();
  if (file.isTrashed() || file.getSize() > (section === 'logo' ? 2 : 18) * 1024 * 1024) throw new Error('미디어 크기를 확인해 주세요.');
  if (section === 'logo' ? !['image/jpeg','image/png','image/webp'].includes(mime) : mime !== 'video/mp4') throw new Error('지원하지 않는 미디어입니다.');
  return {mime: mime, base64: Utilities.base64Encode(file.getBlob().getBytes())};
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
