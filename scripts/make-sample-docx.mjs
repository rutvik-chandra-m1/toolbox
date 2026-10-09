// Generates a small sample Word document for trying the "Word to PDF" tool:
//   node scripts/make-sample-docx.mjs              -> docs/samples/sample.docx
//   node scripts/make-sample-docx.mjs --long out   -> a multi-page document at <out>
//
// The sample has a heading, bold/italic/underline/coloured text, bullet and
// numbered lists, a table, an image and an explicit page break.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const longIndex = process.argv.indexOf('--long');
const long = longIndex !== -1;
const outPath = long ? resolve(process.argv[longIndex + 1] ?? 'long.docx') : join(root, 'docs', 'samples', 'sample.docx');

// A small picture made of shapes (no fonts needed): bars on a tinted card.
const picture = await sharp(
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="720" height="360">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#e0e7ff"/><stop offset="1" stop-color="#c7d2fe"/></linearGradient></defs>
    <rect width="720" height="360" rx="24" fill="url(#g)"/>
    <rect x="70" y="190" width="90" height="110" rx="8" fill="#4f46e5"/>
    <rect x="200" y="140" width="90" height="160" rx="8" fill="#6366f1"/>
    <rect x="330" y="90" width="90" height="210" rx="8" fill="#818cf8"/>
    <rect x="460" y="50" width="90" height="250" rx="8" fill="#4338ca"/>
    <circle cx="620" cy="90" r="42" fill="#f59e0b"/>
  </svg>`),
)
  .png()
  .toBuffer();

const cell = (text, { header = false, width = 3000, align } = {}) =>
  new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: header ? { type: ShadingType.CLEAR, fill: '4F46E5', color: 'auto' } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        alignment: align,
        children: [new TextRun({ text, bold: header, color: header ? 'FFFFFF' : undefined })],
      }),
    ],
  });

const line = { style: BorderStyle.SINGLE, size: 4, color: '9CA3AF' };
const borders = { top: line, bottom: line, left: line, right: line, insideHorizontal: line, insideVertical: line };

const rows = [
  ['Region', 'Q1', 'Q2'],
  ['North', '$120,000', '$135,500'],
  ['South', '$98,250', '$101,000'],
  ['West', '$143,700', '$150,200'],
];

const table = new Table({
  width: { size: 9000, type: WidthType.DXA },
  columnWidths: [3000, 3000, 3000],
  borders,
  rows: rows.map(
    (values, i) =>
      new TableRow({
        tableHeader: i === 0,
        children: values.map((v, c) => cell(v, { header: i === 0, align: c > 0 ? AlignmentType.RIGHT : undefined })),
      }),
  ),
});

const filler = (n) =>
  Array.from(
    { length: n },
    (_, i) =>
      new Paragraph({
        spacing: { after: 160 },
        children: [
          new TextRun(
            `Paragraph ${i + 1}. Toolbox converts Word documents to PDF entirely on your device, so nothing is uploaded. ` +
              'This paragraph is only here to take up room and make the document run onto further pages, which lets us check that ' +
              'page breaks fall between paragraphs rather than through the middle of a line of text.',
          ),
        ],
      }),
  );

const children = [
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Quarterly Report')] }),
  new Paragraph({
    spacing: { after: 200 },
    children: [
      new TextRun('This document tests formatting: '),
      new TextRun({ text: 'bold', bold: true }),
      new TextRun(', '),
      new TextRun({ text: 'italic', italics: true }),
      new TextRun(', '),
      new TextRun({ text: 'underlined', underline: {} }),
      new TextRun(', '),
      new TextRun({ text: 'coloured', color: 'C2410C' }),
      new TextRun(' and '),
      new TextRun({ text: 'bold italic underlined', bold: true, italics: true, underline: {} }),
      new TextRun(' text.'),
    ],
  }),
  new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Highlights')] }),
  ...['Revenue grew in every region', 'Support tickets fell by a third', 'The new app shipped on time'].map(
    (text) => new Paragraph({ numbering: { reference: 'bullets', level: 0 }, children: [new TextRun(text)] }),
  ),
  new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun('Next steps')] }),
  ...['Review the budget', 'Hire two engineers', 'Plan the Q3 launch'].map(
    (text) => new Paragraph({ numbering: { reference: 'numbers', level: 0 }, children: [new TextRun(text)] }),
  ),
  new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun('Sales by region')] }),
  table,
  new Paragraph({ spacing: { before: 240, after: 120 }, children: [new TextRun({ text: 'Figure 1: growth by quarter', italics: true })] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: 'png',
        data: picture,
        transformation: { width: 420, height: 210 },
        altText: { title: 'Bar chart', description: 'Bars growing left to right', name: 'chart' },
      }),
    ],
  }),
  ...(long
    ? [
        new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 360 }, children: [new TextRun('Detailed notes')] }),
        ...filler(40),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Appendix table')] }),
        new Table({
          width: { size: 9000, type: WidthType.DXA },
          columnWidths: [3000, 3000, 3000],
          borders,
          rows: Array.from({ length: 45 }, (_, i) =>
            new TableRow({
              tableHeader: i === 0,
              children: (i === 0 ? ['Item', 'Value', 'Notes'] : [`Row ${i}`, `${i * 17}`, 'Some notes']).map((v) => cell(v, { header: i === 0 })),
            }),
          ),
        }),
      ]
    : [
        new Paragraph({ children: [new PageBreak()] }),
        new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun('Second page')] }),
        ...filler(3),
      ]),
];

const doc = new Document({
  creator: 'Toolbox',
  title: 'Quarterly Report',
  numbering: {
    config: [
      { reference: 'bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT }] },
      { reference: 'numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }] },
    ],
  },
  sections: [
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      children,
    },
  ],
});

await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, await Packer.toBuffer(doc));
console.log(`Wrote ${outPath}`);
