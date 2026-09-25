// Photo upload rules, shared by the browser pages and the /api functions so
// the two can never disagree. The storage bucket enforces the same limits
// (see the init migration); keep all three in sync.

export const MAX_BYTES = 15 * 1024 * 1024; // 15 MB per file
export const MAX_FILES_PER_REQUEST = 20;
export const DAILY_FILE_LIMIT = 100; // per upload link, rolling 24 hours

// content type -> file extension used in the storage path
export const ALLOWED_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const EXT_TO_TYPE = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif',
};

// Some browsers (notably Chrome on Windows/Android) report HEIC files with an
// empty type, so fall back to the file extension.
export function contentTypeFor(filename, reportedType) {
  const type = (reportedType || '').toLowerCase();
  if (ALLOWED_TYPES[type]) return type;
  const ext = String(filename || '').split('.').pop().toLowerCase();
  return EXT_TO_TYPE[ext] || null;
}
