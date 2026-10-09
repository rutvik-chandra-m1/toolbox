const MAX_LENGTH = 120;
// Characters that are illegal on Windows/Android file systems, plus control characters.
const ILLEGAL = /[\\/:*?"<>|\u0000-\u001f]/g;

/**
 * Makes a string safe to use as a file name on any platform: no path
 * separators or reserved characters, no leading/trailing dots or spaces, and a
 * sane length (the extension is kept when shortening).
 */
export function sanitizeFilename(name: string, fallback = 'file'): string {
  let clean = name.replace(ILLEGAL, '_').replace(/\s+/g, ' ').trim();
  clean = clean.replace(/^\.+/, '').replace(/[. ]+$/, '');
  if (!clean) return fallback;

  if (clean.length > MAX_LENGTH) {
    const dot = clean.lastIndexOf('.');
    const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : '';
    clean = clean.slice(0, MAX_LENGTH - ext.length) + ext;
  }
  return clean;
}
