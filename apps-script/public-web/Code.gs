/** Read-only public project. Do not copy admin-bound files into this project. */
function doGet(event) {
  const token = String(event && event.parameter && event.parameter.card || '').trim();
  const template = HtmlService.createTemplateFromFile('Card');
  // Card.html embeds this in JavaScript; only the token alphabet may cross that boundary.
  template.slug = /^[a-z0-9]{12}$/.test(token) ? token : '';
  return template.evaluate().setTitle('ZNUS Digital Card');
}
function getPublicCard(token) {
  if (typeof token !== 'string' || !/^[a-z0-9]{12}$/.test(token)) return null;
  const id = PropertiesService.getScriptProperties().getProperty('ZNUS_SPREADSHEET_ID');
  if (!id) throw new Error('공개 명함의 데이터 연결이 설정되지 않았습니다.');
  const ss = SpreadsheetApp.openById(id);
  const cards = publicRows_(ss.getSheetByName('Cards'));
  const card = cards.find(row => row.publicToken === token);
  if (!card || !publicTrue_(card.published) || !publicTrue_(card.isActive)) return null;
  // Explicit allowlist. Never return account email, cardId, processing errors, or raw rows.
  const company = publicRows_(ss.getSheetByName('CompanySettings'))[0] || {};
  return {
    slug: token, name: String(card.nameKo || ''), nameEn: String(card.nameEn || ''),
    department: String(card.department || ''), position: String(card.jobTitleKo || ''),
    phone: String(card.mobilePhone || ''), email: String(card.publicEmail || ''),
    address: String(company.officeAddress || ''), website: safeUrl_(company.companyWebsite),
    profileImageUrl: imageUrl_(card.profileImageFileId), logoUrl: imageUrl_(company.companyLogoFileId),
    // Temporary compatibility with the existing demo. Fixed design is stage 4.
    sections: ['profile', 'role', 'contact', 'links'].map(type => ({
      type: type, title: '', body: type === 'role' ? [1,2,3,4,5].map(i => String(card['roleItem' + i + 'Ko'] || '')).join('\n') : '',
      buttonLabel: '', buttonUrl: '', background: { kind: 'none', url: '', posterUrl: '', overlay: 0.48, position: '50% 50%' }
    }))
  };
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
