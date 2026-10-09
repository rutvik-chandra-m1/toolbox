// Renders every app icon (PWA, favicon, Android launcher) from one glyph.
// Run with `npm run icons`; the generated files are committed, so this is only
// needed when the artwork below changes.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BRAND = '#4f46e5';
const BRAND_DARK = '#3730a3';

// 2x2 grid of tiles (three plain, one with a check) on a 512x512 canvas.
// `scale` shrinks the glyph around the centre so it fits a safe zone.
function glyph(scale = 1) {
  const tile = (x, y, check) => `
    <rect x="${x}" y="${y}" width="150" height="150" rx="38" fill="#ffffff" fill-opacity="${check ? 1 : 0.92}"/>
    ${
      check
        ? `<path d="M${x + 38} ${y + 78} l28 28 l48 -56" fill="none" stroke="${BRAND}" stroke-width="22" stroke-linecap="round" stroke-linejoin="round"/>`
        : ''
    }`;
  return `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    ${tile(100, 100, false)}${tile(262, 100, false)}${tile(100, 262, false)}${tile(262, 262, true)}
  </g>`;
}

const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${BRAND}"/><stop offset="1" stop-color="${BRAND_DARK}"/></linearGradient></defs>`;

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${defs}${body}</svg>`;

// Rounded-square icon (favicon, "any" purpose, legacy Android launcher).
const rounded = svg(`<rect width="512" height="512" rx="112" fill="url(#g)"/>${glyph()}`);
// Full-bleed icon (maskable / iOS: the OS applies its own mask).
const bleed = (scale) => svg(`<rect width="512" height="512" fill="url(#g)"/>${glyph(scale)}`);
// Foreground layer of an Android adaptive icon: transparent, glyph in the 66% safe zone.
const foreground = svg(glyph(0.62));

async function png(svgString, size, file) {
  await mkdir(dirname(file), { recursive: true });
  await sharp(Buffer.from(svgString)).resize(size, size).png().toFile(file);
}

await writeFile(join(root, 'public/icon.svg'), rounded);
await png(rounded, 192, join(root, 'public/pwa-192x192.png'));
await png(rounded, 512, join(root, 'public/pwa-512x512.png'));
await png(bleed(0.72), 512, join(root, 'public/pwa-maskable-512x512.png'));
await png(bleed(0.8), 180, join(root, 'public/apple-touch-icon.png'));

// Android mipmaps. Only written when the platform has been added.
const res = join(root, 'android/app/src/main/res');
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const { existsSync } = await import('node:fs');
if (existsSync(res)) {
  for (const [name, factor] of Object.entries(densities)) {
    const dir = join(res, `mipmap-${name}`);
    await png(rounded, Math.round(48 * factor), join(dir, 'ic_launcher.png'));
    await png(rounded, Math.round(48 * factor), join(dir, 'ic_launcher_round.png'));
    await png(foreground, Math.round(108 * factor), join(dir, 'ic_launcher_foreground.png'));
  }
  // Adaptive-icon background colour.
  const colors = join(res, 'values/ic_launcher_background.xml');
  await writeFile(
    colors,
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BRAND}</color>\n</resources>\n`,
  );
  console.log('Android launcher icons written.');
}
console.log('Icons written.');
