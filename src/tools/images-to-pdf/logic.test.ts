import { describe, expect, it } from 'vitest';
import { readDateTaken } from './exif';
import {
  MAX_IMAGES,
  baseFilename,
  defaultFilename,
  formatTextFile,
  isImage,
  layoutPage,
  movePage,
  orderByTaps,
  rotateClockwise,
  selectImages,
  sortByDate,
  sortByName,
  type PageItem,
} from './logic';
import { toIndexed } from './pixels';

const page = (name: string, takenAt = 0): PageItem => ({
  id: name,
  file: new File(['x'], name),
  rotation: 0,
  takenAt,
});

describe('choosing images', () => {
  const jpg = (name: string) => ({ name, type: 'image/jpeg' });

  it('recognises images by extension or by type (Android names often have no extension)', () => {
    expect(isImage({ name: 'a.WEBP', type: '' })).toBe(true);
    expect(isImage({ name: 'photo.HEIC', type: '' })).toBe(true);
    expect(isImage({ name: '1000001234', type: 'image/png' })).toBe(true);
    expect(isImage({ name: 'notes.pdf', type: 'application/pdf' })).toBe(false);
  });

  it('keeps the first 100 and says so', () => {
    const files = Array.from({ length: 105 }, (_, i) => jpg(`${i}.jpg`));
    const { accepted, notes } = selectImages(0, files);
    expect(accepted).toHaveLength(MAX_IMAGES);
    expect(accepted[99]?.name).toBe('99.jpg');
    expect(notes.join()).toContain('first 100');
  });

  it('counts the pages already there, and adds nothing when full', () => {
    expect(selectImages(98, [jpg('a.jpg'), jpg('b.jpg'), jpg('c.jpg')]).accepted).toHaveLength(2);
    expect(selectImages(100, [jpg('a.jpg')]).accepted).toHaveLength(0);
  });

  it('says when something was not an image', () => {
    const { accepted, notes } = selectImages(0, [jpg('a.jpg'), { name: 'b.txt', type: 'text/plain' }]);
    expect(accepted).toHaveLength(1);
    expect(notes).toEqual(['1 file was not a JPG, PNG, WEBP or HEIC image.']);
  });
});

describe('page order', () => {
  it('moves a page', () => {
    expect(movePage(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(movePage(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('sorts names like a person would', () => {
    const sorted = sortByName([page('IMG_10.jpg'), page('img_2.jpg'), page('IMG_1.jpg')]);
    expect(sorted.map((p) => p.file.name)).toEqual(['IMG_1.jpg', 'img_2.jpg', 'IMG_10.jpg']);
  });

  it('sorts by date taken', () => {
    expect(sortByDate([page('b', 20), page('a', 10)]).map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('puts tapped pages first in tap order, and the rest after them as they were', () => {
    const pages = ['a', 'b', 'c', 'd', 'e'].map((name) => page(name));
    expect(orderByTaps(pages, ['d', 'a']).map((p) => p.id)).toEqual(['d', 'a', 'b', 'c', 'e']);
    expect(orderByTaps(pages, []).map((p) => p.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('rotates a quarter turn at a time and wraps around', () => {
    expect(rotateClockwise(0)).toBe(90);
    expect(rotateClockwise(270)).toBe(0);
  });
});

describe('file name', () => {
  const now = new Date(2026, 10, 1, 9, 5);

  it('defaults to images_YYYY-MM-DD_HHMM', () => {
    expect(defaultFilename(now)).toBe('images_2026-11-01_0905');
  });

  it('drops a typed .pdf, cleans unsafe characters, and falls back when empty', () => {
    expect(baseFilename('My notes.PDF', now)).toBe('My notes');
    expect(baseFilename('a/b:c', now)).toBe('a_b_c');
    expect(baseFilename('   ', now)).toBe('images_2026-11-01_0905');
  });
});

describe('page layout', () => {
  it('fit to image: the page has the shape of the image, with no margin by default', () => {
    const { width, height, image } = layoutPage(1000, 2000, 'fit', 'none');
    expect(height).toBeCloseTo(841.89);
    expect(width).toBeCloseTo(420.95);
    expect(image).toEqual({ x: 0, y: 0, width, height });
  });

  it('fit to image with a small margin grows the page around the image', () => {
    const { width, image } = layoutPage(1000, 1000, 'fit', 'small');
    expect(width).toBeCloseTo(image.width + 36);
    expect(image.x).toBe(18);
  });

  it('A4 turns to match the image and centres it', () => {
    const portrait = layoutPage(1000, 2000, 'a4', 'none');
    expect([portrait.width, portrait.height]).toEqual([595.28, 841.89]);
    expect(portrait.image.x).toBeCloseTo((595.28 - portrait.image.width) / 2);

    const landscape = layoutPage(2000, 1000, 'a4', 'none');
    expect([landscape.width, landscape.height]).toEqual([841.89, 595.28]);
    expect(landscape.image.width).toBeCloseTo(841.89);
  });

  it('Letter keeps the image inside the margins', () => {
    const { image, width, height } = layoutPage(3000, 2000, 'letter', 'small');
    expect([width, height]).toEqual([792, 612]);
    expect(image.x).toBeGreaterThanOrEqual(18);
    expect(image.y).toBeGreaterThanOrEqual(18);
  });
});

describe('text file', () => {
  it('has the agreed format, and a page with no text keeps its heading', () => {
    expect(formatTextFile(['first', '', 'third'])).toBe(
      '=== Page 1 ===\nfirst\n=== Page 2 ===\n\n=== Page 3 ===\nthird\n',
    );
  });
});

describe('lossless pages', () => {
  it('turns a few colours into a palette', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255]);
    const indexed = toIndexed(rgba);
    expect(Array.from(indexed?.indices ?? [])).toEqual([0, 1, 0]);
    expect(Array.from(indexed?.palette ?? [])).toEqual([255, 0, 0, 0, 0, 255]);
  });

  it('gives up on more than 256 colours', () => {
    const rgba = new Uint8ClampedArray(257 * 4);
    for (let i = 0; i < 257; i++) rgba.set([i & 255, i >> 8, 0, 255], i * 4);
    expect(toIndexed(rgba)).toBeNull();
    expect(toIndexed(rgba.subarray(0, 256 * 4))).not.toBeNull();
  });
});

describe('date taken', () => {
  /** A minimal JPEG start: SOI, then an APP1 with a little-endian TIFF and EXIF date. */
  function jpegWithDate(date: string): ArrayBuffer {
    const tiff = new DataView(new ArrayBuffer(64 + date.length + 1));
    tiff.setUint16(0, 0x4949);
    tiff.setUint16(2, 42, true);
    tiff.setUint32(4, 8, true); // first directory
    tiff.setUint16(8, 1, true); // one entry: the pointer to the EXIF directory
    tiff.setUint16(10, 0x8769, true);
    tiff.setUint32(18, 26, true);
    tiff.setUint16(26, 1, true); // one entry: DateTimeOriginal
    tiff.setUint16(28, 0x9003, true);
    tiff.setUint32(36, 44, true);
    Array.from(date).forEach((char, i) => tiff.setUint8(44 + i, char.charCodeAt(0)));

    const bytes = new Uint8Array(12 + tiff.byteLength);
    bytes.set([0xff, 0xd8, 0xff, 0xe1, (tiff.byteLength + 8) >> 8, (tiff.byteLength + 8) & 255]);
    bytes.set(new TextEncoder().encode('Exif\0\0'), 6);
    bytes.set(new Uint8Array(tiff.buffer), 12);
    return bytes.buffer;
  }

  it('reads EXIF DateTimeOriginal as local time', () => {
    expect(readDateTaken(jpegWithDate('2024:03:09 14:05:30'))).toBe(new Date(2024, 2, 9, 14, 5, 30).getTime());
  });

  it('returns null for anything else, including cut-off data', () => {
    expect(readDateTaken(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
    expect(readDateTaken(new ArrayBuffer(0))).toBeNull();
    expect(readDateTaken(jpegWithDate('2024:03:09 14:05:30').slice(0, 30))).toBeNull();
  });
});
