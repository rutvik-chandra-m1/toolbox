import { sanitizeFilename } from '@/shared/files';
import { toISODate } from '@/shared/lib/dates';

/* ------------------------------------------------------------------ */
/* Picked images                                                       */
/* ------------------------------------------------------------------ */

export const MAX_IMAGES = 100;

/** Both the extensions and the MIME types: Android pickers filter by MIME type. */
export const ACCEPTED_TYPES = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type Rotation = 0 | 90 | 180 | 270;

export interface PageItem {
  id: string;
  file: File;
  /** Clockwise, on top of the photo's own EXIF orientation. */
  rotation: Rotation;
  /** EXIF date taken, else the file's date (ms). */
  takenAt: number;
  /** Object URL of a small preview. */
  thumbnail?: string;
  /** The preview could not be decoded, so the page will be skipped. */
  broken?: boolean;
}

type Named = Pick<File, 'name' | 'type'>;

export const isHeic = ({ name, type }: Named) => /\.hei[cf]$/i.test(name) || /^image\/hei[cf]$/i.test(type);

export const isJpeg = ({ name, type }: Named) => /\.jpe?g$/i.test(name) || type === 'image/jpeg';

/** Judged by name or type: Android file names often have no extension. */
export const isImage = (file: Named) =>
  isHeic(file) || isJpeg(file) || /\.(png|webp)$/i.test(file.name) || /^image\/(png|webp)$/i.test(file.type);

/** Keeps the images that fit under the limit and says what happened to the rest. */
export function selectImages<T extends Named>(existing: number, files: readonly T[]) {
  const images = files.filter(isImage);
  const room = Math.max(0, MAX_IMAGES - existing);
  const notes: string[] = [];

  const ignored = files.length - images.length;
  if (ignored > 0) notes.push(`${ignored} ${ignored === 1 ? 'file was' : 'files were'} not a JPG, PNG, WEBP or HEIC image.`);
  if (images.length > room) notes.push(`The limit is ${MAX_IMAGES} images, so only the first ${existing + room} were kept.`);

  return { accepted: images.slice(0, room), notes };
}

export function rotateClockwise(rotation: Rotation): Rotation {
  return ((rotation + 90) % 360) as Rotation;
}

/* ------------------------------------------------------------------ */
/* Page order                                                          */
/* ------------------------------------------------------------------ */

export function movePage<T>(pages: readonly T[], from: number, to: number): T[] {
  const moved = [...pages];
  const [page] = moved.splice(from, 1);
  if (page !== undefined) moved.splice(to, 0, page);
  return moved;
}

/** "IMG_2.jpg" comes before "IMG_10.jpg". */
export function sortByName(pages: readonly PageItem[]): PageItem[] {
  return [...pages].sort((a, b) =>
    a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' }),
  );
}

export function sortByDate(pages: readonly PageItem[]): PageItem[] {
  return [...pages].sort((a, b) => a.takenAt - b.takenAt);
}

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

export type PageSize = 'fit' | 'a4' | 'letter';
export type Margin = 'none' | 'small';
export type Quality = 'high' | 'balanced' | 'small';

export interface Options {
  filename: string;
  pageSize: PageSize;
  margin: Margin;
  quality: Quality;
  ocr: boolean;
  saveText: boolean;
}

/** Longest edge in pixels and JPEG quality of the page image. */
export const QUALITY: Record<Quality, { longEdge: number; jpeg: number }> = {
  high: { longEdge: 3000, jpeg: 0.9 },
  balanced: { longEdge: 2000, jpeg: 0.8 },
  small: { longEdge: 1400, jpeg: 0.65 },
};

/** OCR gets its own copy at this size, whatever the page image's quality. */
export const OCR_LONG_EDGE = 2500;
export const THUMBNAIL_LONG_EDGE = 160;

export function defaultFilename(now: Date): string {
  const time = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  return `images_${toISODate(now)}_${time}`;
}

export function defaultOptions(now: Date): Options {
  return {
    filename: defaultFilename(now),
    pageSize: 'fit',
    margin: 'none',
    quality: 'balanced',
    ocr: true,
    saveText: false,
  };
}

/** What the user typed, without a ".pdf" of its own and safe as a file name. */
export function baseFilename(typed: string, now: Date): string {
  return sanitizeFilename(typed.trim().replace(/\.pdf$/i, ''), defaultFilename(now));
}

/* ------------------------------------------------------------------ */
/* Page geometry (PDF points)                                          */
/* ------------------------------------------------------------------ */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PageLayout {
  width: number;
  height: number;
  image: Rect;
}

const SHEETS = { a4: [595.28, 841.89], letter: [612, 792] } as const;
const SMALL_MARGIN = 18; // a quarter of an inch
/** "Fit to image" pages are as long as an A4 sheet, so the quality setting doesn't change their size. */
const FIT_LONG_EDGE = SHEETS.a4[1];

/** Where an image of this shape goes on its page. Portrait or landscape follows the image. */
export function layoutPage(imageWidth: number, imageHeight: number, pageSize: PageSize, margin: Margin): PageLayout {
  const inset = margin === 'small' ? SMALL_MARGIN : 0;

  if (pageSize === 'fit') {
    const scale = FIT_LONG_EDGE / Math.max(imageWidth, imageHeight);
    const [width, height] = [imageWidth * scale, imageHeight * scale];
    return { width: width + 2 * inset, height: height + 2 * inset, image: { x: inset, y: inset, width, height } };
  }

  const [short, long] = SHEETS[pageSize];
  const landscape = imageWidth > imageHeight;
  const [sheetWidth, sheetHeight] = landscape ? [long, short] : [short, long];
  const scale = Math.min((sheetWidth - 2 * inset) / imageWidth, (sheetHeight - 2 * inset) / imageHeight);
  const [width, height] = [imageWidth * scale, imageHeight * scale];
  return {
    width: sheetWidth,
    height: sheetHeight,
    image: { x: (sheetWidth - width) / 2, y: (sheetHeight - height) / 2, width, height },
  };
}

/* ------------------------------------------------------------------ */
/* The .txt file                                                       */
/* ------------------------------------------------------------------ */

export function formatTextFile(pages: readonly string[]): string {
  return `${pages.map((text, index) => `=== Page ${index + 1} ===\n${text}`).join('\n')}\n`;
}
