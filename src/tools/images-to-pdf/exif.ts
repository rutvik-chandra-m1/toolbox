const DATE_TIME_ORIGINAL = 0x9003;
const EXIF_IFD_POINTER = 0x8769;
const EXIF_HEADER = 0x45786966; // "Exif"

/** EXIF lives at the start of a JPEG; there is no need to read a 10 MB photo to get it. */
export const EXIF_SEARCH_BYTES = 128 * 1024;

/**
 * The "date taken" of a JPEG in local-time milliseconds, or null if it has none
 * or the bytes make no sense. Other formats fall back to the file's date.
 */
export function readDateTaken(buffer: ArrayBuffer): number | null {
  try {
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xffd8) return null;

    for (let at = 2; at + 4 < view.byteLength; at += 2 + view.getUint16(at + 2)) {
      if (view.getUint8(at) !== 0xff) return null;
      if (view.getUint8(at + 1) === 0xe1 && view.getUint32(at + 4) === EXIF_HEADER) return readTiff(view, at + 10);
      if (view.getUint8(at + 1) === 0xda) return null; // the image data has started
    }
  } catch {
    // Cut off or damaged: same as having no date.
  }
  return null;
}

function readTiff(view: DataView, tiff: number): number | null {
  const little = view.getUint16(tiff) === 0x4949;

  /** The offset of an entry's value in a TIFF directory, or null if the directory doesn't have the tag. */
  const entry = (directory: number, tag: number): number | null => {
    const count = view.getUint16(directory, little);
    for (let i = 0; i < count; i++) {
      const at = directory + 2 + i * 12;
      if (view.getUint16(at, little) === tag) return at + 8;
    }
    return null;
  };

  const pointer = entry(tiff + view.getUint32(tiff + 4, little), EXIF_IFD_POINTER);
  if (pointer === null) return null;
  const value = entry(tiff + view.getUint32(pointer, little), DATE_TIME_ORIGINAL);
  if (value === null) return null;

  const text = new TextDecoder().decode(new Uint8Array(view.buffer, tiff + view.getUint32(value, little), 19));
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number) as [number, number, number, number, number, number, number];
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}
