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
  out.profileImageFileId = fileId_(input.profileImageFileId, '프로필 이미지');
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
    if (metadata.sizeBytes > 18 * 1024 * 1024) throw new Error('영상은 18MB 이하여야 합니다.');
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
