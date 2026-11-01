// End-to-end check of the Images to PDF tool:  npm run verify:images-to-pdf
//
// Generates images with known sentences, feeds them to the real tool in a real
// browser (the production build, through its UI), then reads the PDF back with
// tools that have nothing to do with this app: pdftotext, PyMuPDF and pypdf.
// Needs Chrome, pdftotext, and Python with pymupdf and pypdf
// (pip install pymupdf pypdf). The npm script builds the app first.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'images-to-pdf-'));
const PORT = 4179;
const WIDTH = 2400;
const HEIGHT = 1600;

const svg = (lines) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"><rect width="100%" height="100%" fill="#fbfaf6"/>${lines
      .map((text, i) => `<text x="120" y="${300 + i * 200}" font-family="Arial" font-size="84" fill="#222">${text}</text>`)
      .join('')}</svg>`,
  );

const PAGES = {
  jpg: ['The quick brown fox jumps over', 'Invoice number 48213 was paid today'],
  png: ['Searchable documents help readers', 'Keep receipts for the annual audit'],
  webp: ['Photosynthesis converts sunlight', 'Mount Everest stands 8849 metres'],
  exif: ['Sideways photographs stay upright'],
  manual: ['Manual rotation fixes this page'],
};

async function makeImages() {
  const file = (name) => join(work, name);
  await sharp(svg(PAGES.jpg)).jpeg({ quality: 90 }).toFile(file('1-sentences.jpg'));
  await sharp(svg(PAGES.png)).png().toFile(file('2-sentences.png'));
  await sharp(svg(PAGES.webp)).webp({ quality: 90 }).toFile(file('3-sentences.webp'));
  writeFileSync(file('4-corrupt.jpg'), Buffer.from('this is not really an image'));

  // Stored on its side with an EXIF tag saying so, like a phone held sideways.
  const upright = await sharp(svg(PAGES.exif)).png().toBuffer();
  await sharp(upright).rotate(-90).withMetadata({ orientation: 6 }).jpeg({ quality: 90 }).toFile(file('5-exif.jpg'));

  // Stored on its side with no tag: the user has to rotate it in the tool.
  await sharp(await sharp(svg(PAGES.manual)).png().toBuffer()).rotate(-90).jpeg({ quality: 90 }).toFile(file('6-manual.jpg'));

  // A "photo": colourful noise and no text at all.
  const noise = Buffer.alloc(900 * 600 * 3);
  for (let i = 0; i < noise.length; i += 3) {
    noise[i] = (i / 3) % 256;
    noise[i + 1] = 90 + ((i * 7) % 90);
    noise[i + 2] = 200 - ((i / 900) % 150);
  }
  await sharp(noise, { raw: { width: 900, height: 600, channels: 3 } }).blur(4).jpeg().toFile(file('7-photo.jpg'));

  // Flat colours only: should stay lossless.
  const diagram = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="100%" height="100%" fill="#fff"/><rect x="100" y="100" width="300" height="200" fill="#c00"/><rect x="500" y="300" width="300" height="200" fill="#06c"/></svg>`,
  );
  await sharp(diagram).png().toFile(file('8-diagram.png'));

  return {
    mixed: ['1-sentences.jpg', '2-sentences.png', '3-sentences.webp', '4-corrupt.jpg', '5-exif.jpg', '6-manual.jpg'].map(file),
    textFree: ['7-photo.jpg', '8-diagram.png'].map(file),
  };
}

const passed = [];
function check(name, test) {
  test();
  passed.push(name);
  console.log(`  ok   ${name}`);
}

const pdftotext = (pdf) => execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });

/** Everything the checks want to know about a PDF, as PyMuPDF sees it. */
const INSPECT = `
import base64, json, sys
import pymupdf
doc = pymupdf.open(sys.argv[1])
pages = []
for page in doc:
    pixmap = page.get_pixmap(dpi=40, alpha=False)
    pages.append({
        'width': page.rect.width,
        'height': page.rect.height,
        'text': page.get_text(),
        'words': [{'xMin': w[0], 'yMin': w[1], 'xMax': w[2], 'yMax': w[3], 'text': w[4]} for w in page.get_text('words')],
        'fonts': [f[2:4] for f in page.get_fonts()],
        'images': [{'colourSpace': i[5], 'filter': i[8]} for i in page.get_images()],
        'pixels': base64.b64encode(pixmap.samples).decode(),
    })
print(json.dumps({'metadata': doc.metadata, 'pages': pages}))
`;
const inspect = (pdf) => JSON.parse(execFileSync('python', ['-c', INSPECT, pdf], { encoding: 'utf8', maxBuffer: 1 << 28 }));

const PYPDF = `
import json, sys
from pypdf import PdfReader
reader = PdfReader(sys.argv[1])
print(json.dumps({'title': reader.metadata.title, 'creator': reader.metadata.creator, 'text': [p.extract_text() for p in reader.pages]}))
`;

/** Where a line of text really is in the picture, measured from its ink. */
async function inkOf(text) {
  const { info } = await sharp(svg([text])).png().trim({ background: '#fbfaf6', threshold: 40 }).toBuffer({ resolveWithObject: true });
  return { left: -info.trimOffsetLeft, top: -info.trimOffsetTop, right: -info.trimOffsetLeft + info.width, bottom: -info.trimOffsetTop + info.height };
}

/** Mean difference (0-255) between the first pages of two PDFs, as rendered. */
function renderDifference(a, b) {
  const [first, second] = [a, b].map((pdf) => Buffer.from(pdf.pages[0].pixels, 'base64'));
  return first.reduce((sum, value, i) => sum + Math.abs(value - second[i]), 0) / first.length;
}

const server = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
let browser;

try {
  for (let i = 0; ; i++) {
    const ready = await fetch(`http://localhost:${PORT}/`).then((r) => r.ok, () => false);
    if (ready) break;
    assert(i < 50, 'the preview server did not start (did you run npm run build?)');
    await new Promise((r) => setTimeout(r, 200));
  }

  const images = await makeImages();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();

  const foreign = [];
  page.on('request', (request) => {
    if (!/^(http:\/\/localhost|blob:|data:)/.test(request.url())) foreign.push(request.url());
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));

  const addImages = async (files) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose images' }).click()]);
    await chooser.setFiles(files);
    await page.getByRole('listitem').nth(files.length - 1).waitFor();
    await page.getByRole('button', { name: 'By file name' }).click();
  };

  const create = async (name) => {
    await page.getByLabel('File name').fill(name);
    const started = Date.now();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /^Create PDF/ }).click();
    const file = await download;
    const path = join(work, file.suggestedFilename());
    await file.saveAs(path);
    await page.getByText('Your PDF is ready').waitFor();
    return { path, seconds: (Date.now() - started) / 1000 };
  };

  console.log('\nMixed images, OCR on');
  await page.goto(`http://localhost:${PORT}/#/images-to-pdf`);
  await addImages(images.mixed);
  await page.getByRole('button', { name: 'Rotate page 6' }).click(); // 6-manual.jpg, a quarter turn clockwise
  await page.getByRole('checkbox', { name: 'Also save a .txt file' }).check();
  const textDownload = page.waitForEvent('download', { predicate: (d) => d.suggestedFilename().endsWith('.txt') });
  const mixed = await create('verify-mixed');
  const txtPath = join(work, 'verify-mixed.txt');
  await (await textDownload).saveAs(txtPath);
  const summary = await page.getByRole('status').innerText();
  console.log(`  (${mixed.seconds.toFixed(1)} s, ${(statSync(mixed.path).size / 1024).toFixed(0)} KB)`);

  const text = pdftotext(mixed.path);
  const flat = text.toLowerCase().replace(/\s+/g, ' ');
  const { metadata, pages } = inspect(mixed.path);

  for (const [kind, lines] of Object.entries(PAGES)) {
    check(`pdftotext finds the ${kind} sentences`, () => {
      for (const line of lines) assert(flat.includes(line.toLowerCase()), `missing "${line}" in:\n${text}`);
    });
  }
  check('the corrupt file was skipped: 5 pages, in order', () => {
    assert.equal(pages.length, 5);
    assert.equal(pages[0].words[0].text, 'The');
  });
  check('the result screen names the skipped file and counts pages with text', () => {
    assert.match(summary, /5 pages/);
    assert.match(summary, /Text found on 5 of them/);
    assert.match(summary, /4-corrupt\.jpg/);
  });

  const ink = await inkOf(PAGES.jpg[0]);
  check('the invisible words line up with the words in the photo', () => {
    const { width, height, words } = pages[0];
    const line = words.filter(({ yMax }) => yMax < height * 0.25);
    const [first, last] = [line[0], line.at(-1)];
    assert.equal(first.text, 'The');
    assert.equal(last.text, 'over');
    assert(Math.abs(first.xMin - (ink.left / WIDTH) * width) < width * 0.01, `left edge ${first.xMin}`);
    assert(Math.abs(last.xMax - (ink.right / WIDTH) * width) < width * 0.01, `right edge ${last.xMax}`);
    const middle = (first.yMin + first.yMax) / 2;
    const expected = ((ink.top + ink.bottom) / 2 / HEIGHT) * height;
    assert(Math.abs(middle - expected) < height * 0.02, `line height ${middle} vs ${expected}`);
  });

  check('metadata: Title and Creator', () => {
    assert.equal(metadata.title, 'verify-mixed');
    assert.equal(metadata.creator, 'Toolbox - Images to PDF');
  });
  check('the text uses a standard font in render mode 3', () => {
    assert.deepEqual(pages[0].fonts, [['Type1', 'Helvetica']]);
    assert(readFileSync(mixed.path).includes('3 Tr'));
  });
  check('the .txt file has a heading per page and the text', () => {
    const txt = readFileSync(txtPath, 'utf8');
    for (let n = 1; n <= 5; n++) assert(txt.includes(`=== Page ${n} ===\n`), `page ${n}`);
    assert(txt.toLowerCase().includes(PAGES.png[1].toLowerCase()));
  });
  check('pypdf reads the same text and metadata', () => {
    const { title, creator, text: perPage } = JSON.parse(execFileSync('python', ['-c', PYPDF, mixed.path], { encoding: 'utf8' }));
    assert.equal(title, 'verify-mixed');
    assert.equal(creator, 'Toolbox - Images to PDF');
    const out = perPage.join(' ').toLowerCase().replace(/\s+/g, ' ');
    for (const lines of Object.values(PAGES)) {
      for (const sentence of lines) assert(out.includes(sentence.toLowerCase()), `missing "${sentence}" in:\n${out}`);
    }
  });

  console.log('\nThe text layer is really invisible');
  await page.getByRole('button', { name: 'Convert more' }).click();
  await addImages(images.mixed.slice(0, 1));
  await page.getByRole('checkbox', { name: 'Make text readable (OCR)' }).uncheck();
  const noOcr = await create('verify-no-ocr');
  console.log(`  (OCR off, one page: ${noOcr.seconds.toFixed(1)} s)`);
  await page.getByRole('button', { name: 'Convert more' }).click();
  await addImages(images.mixed.slice(0, 1));
  const withOcr = await create('verify-with-ocr');
  const difference = renderDifference(inspect(withOcr.path), inspect(noOcr.path));
  check('a page with text renders the same as one without', () => assert(difference < 0.01, `differs by ${difference}`));
  check('OCR off: no text in the PDF', () => assert.equal(pdftotext(noOcr.path).trim(), ''));

  console.log('\nText-free images');
  await page.getByRole('button', { name: 'Convert more' }).click();
  await addImages(images.textFree);
  const empty = await create('verify-text-free');
  const emptySummary = await page.getByRole('status').innerText();
  const blank = inspect(empty.path);
  check('a PDF of text-free images opens and renders', () => {
    assert.equal(blank.pages.length, 2);
    for (const { pixels } of blank.pages) assert(new Set(Buffer.from(pixels, 'base64')).size > 3, 'the page rendered blank');
  });
  check('it has no text, and says so', () => {
    assert.equal(pdftotext(empty.path).trim(), '');
    assert.equal(blank.pages.map(({ text: pageText }) => pageText).join('').trim(), '');
    assert.match(emptySummary, /Text found on 0 of them/);
  });
  check('the flat-colour PNG stayed lossless; the photo became a JPEG', () => {
    assert.equal(blank.pages[0].images[0].filter, 'DCTDecode');
    assert.equal(blank.pages[1].images[0].filter, 'FlateDecode');
  });

  console.log('\nPage order');
  await page.getByRole('button', { name: 'Convert more' }).click();
  // The list is handed over scrambled, as an OS might: 3, 1, 2.
  const [first, second, third] = images.mixed;
  const [orderChooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: 'Choose images' }).click()]);
  await orderChooser.setFiles([third, first, second]);
  await page.getByRole('listitem').nth(2).waitFor();
  const listed = (await page.getByRole('listitem').allInnerTexts()).map((row) => row.split('\n')[0]);
  check('a scrambled batch is listed by file name', () =>
    assert.deepEqual(listed, ['1. 1-sentences.jpg', '2. 2-sentences.png', '3. 3-sentences.webp']),
  );
  await page.getByRole('button', { name: 'Tap to set order' }).click();
  await page.getByRole('button', { name: 'Choose 3-sentences.webp next' }).click();
  await page.getByRole('button', { name: 'Choose 1-sentences.jpg next' }).click();
  await page.getByRole('button', { name: 'Choose 2-sentences.png next' }).click();
  await page.getByRole('button', { name: /^Done/ }).click();
  const ordered = inspect((await create('verify-order')).path);
  check('the PDF has the pages in the tapped order', () => {
    assert.deepEqual(
      ordered.pages.map(({ words }) => words[0].text),
      [PAGES.webp[0], PAGES.jpg[0], PAGES.png[0]].map((sentence) => sentence.split(' ')[0]),
    );
  });

  console.log('\nCancel');
  await page.getByRole('button', { name: 'Convert more' }).click();
  await addImages(images.mixed);
  let downloads = 0;
  page.on('download', () => downloads++);
  await page.getByRole('button', { name: /^Create PDF/ }).click();
  await page.getByText(/Reading text: page/).waitFor();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByText('Cancelled. Nothing was saved.').waitFor();
  const left = await page.getByRole('listitem').count();
  check('Cancel returns to the pages and saves nothing', () => {
    assert.equal(downloads, 0);
    assert.equal(left, images.mixed.length);
  });

  check('everything was loaded from the app itself', () => assert.deepEqual(foreign, []));
  check('no uncaught errors in the page', () => assert.deepEqual(errors, []));
  console.log(`\nAll ${passed.length} checks passed.`);
} finally {
  await browser?.close();
  server.kill();
  rmSync(work, { recursive: true, force: true });
}
