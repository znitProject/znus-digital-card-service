/**
 * Stage 3 media processing for the Sheet-bound project.
 *
 * FormAutomation.gs validates the response shape. This file performs the
 * Drive-side checks that cannot be trusted from a Form response alone and
 * moves accepted files into the card's private asset folder.
 */
const ZNUS_MEDIA_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const ZNUS_MEDIA_VIDEO_MIME = 'video/mp4';
const ZNUS_MEDIA_MAX_VIDEO_BYTES = 18 * 1024 * 1024;

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
    throw new Error(name + ': 영상은 18MiB 이하여야 합니다.');
  if (sizeBytes <= 0) throw new Error(name + ': 빈 파일은 사용할 수 없습니다.');

  const parsed = parseMp4Metadata_(file.getBlob().getBytes());
  metadata.durationSeconds = parsed.durationSeconds;
  metadata.width = parsed.width;
  metadata.height = parsed.height;
  validateMediaMetadata_(metadata, kind);
  return metadata;
}

/**
 * Move an accepted upload into 02_card_assets/<cardId>, publish only that
 * asset. Previous files stay available if another asset or the Sheets save fails.
 */
function storeCardAsset_(fileId, oldFileId, cardId, label, mode) {
  const metadata = inspectCardMedia_(fileId, mode, label);
  const id = metadata.id;
  const card = String(cardId || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(card))
    throw new Error('카드 자산을 저장할 cardId가 올바르지 않습니다.');

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
