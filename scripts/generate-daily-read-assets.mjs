// Generates Daily Read's two Android notification assets:
//   - the logo shown on its notifications (android/app/src/main/res/drawable-nodpi/daily_read_logo.png)
//   - its own alert sound, a short bell chime (android/app/src/main/res/raw/daily_read_chime.wav)
// Run with `npm run daily-read:assets`; the generated files are committed, so this is only
// needed when the artwork or the sound below changes. (A channel's sound is fixed once Android
// has created it: after changing the chime, give the channel a new id in src/tools/daily-read/scheduler.ts.)
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const res = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res');

/* ----------------------------------- logo ----------------------------------- */

const AMBER = '#d97706';
const BOOK = 'M18,2H6C4.9,2 4,2.9 4,4v16c0,1.1 0.9,2 2,2h12c1.1,0 2,-0.9 2,-2V4C20,2.9 19.1,2 18,2zM6,4h5v8l-2.5,-1.5L6,12V4z';
const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="192" height="192">
  <circle cx="12" cy="12" r="12" fill="${AMBER}"/>
  <g transform="translate(5.1 5.1) scale(0.575)"><path fill="#ffffff" d="${BOOK}"/></g>
</svg>`;

await mkdir(join(res, 'drawable-nodpi'), { recursive: true });
await sharp(Buffer.from(logo)).png().toFile(join(res, 'drawable-nodpi', 'daily_read_logo.png'));

/* ----------------------------------- chime ---------------------------------- */

const RATE = 44100;
const DURATION = 1.7; // seconds
const samples = new Float32Array(Math.round(RATE * DURATION));

/** One struck bell: a few partials with their own decay, so it rings and fades like metal. */
function bell(startSeconds, frequency, gain, ring) {
  const partials = [
    [1, 1.0, 1.0], // [frequency ratio, level, decay speed]
    [2.0, 0.55, 1.6],
    [3.01, 0.35, 2.2],
    [4.2, 0.18, 3.2],
  ];
  const first = Math.round(startSeconds * RATE);
  for (let i = first; i < samples.length; i++) {
    const t = (i - first) / RATE;
    const attack = Math.min(1, t / 0.004); // 4 ms: no click
    let value = 0;
    for (const [ratio, level, speed] of partials) {
      value += level * Math.exp(-t * speed * (3 / ring)) * Math.sin(2 * Math.PI * frequency * ratio * t);
    }
    samples[i] += gain * attack * value;
  }
}

// A rising C - E - G arpeggio, high enough (1-3 kHz and up) to cut through background noise, ending on a longer ring.
bell(0.0, 1046.5, 0.55, 0.5);
bell(0.16, 1318.5, 0.6, 0.55);
bell(0.32, 1568.0, 0.7, 1.4);

// Fade out the last 150 ms so the file ends in silence (no click).
const fade = Math.round(RATE * 0.15);
for (let i = 0; i < fade; i++) samples[samples.length - 1 - i] *= i / fade;

// Normalise to a loud, safe peak (-1 dBFS).
const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
const scale = 0.89 / peak;

const pcm = Buffer.alloc(samples.length * 2);
samples.forEach((s, i) => pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s * scale)) * 32767), i * 2));

const header = Buffer.alloc(44);
header.write('RIFF', 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write('WAVEfmt ', 8);
header.writeUInt32LE(16, 16); // PCM header size
header.writeUInt16LE(1, 20); // PCM
header.writeUInt16LE(1, 22); // mono
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28);
header.writeUInt16LE(2, 32);
header.writeUInt16LE(16, 34);
header.write('data', 36);
header.writeUInt32LE(pcm.length, 40);

await mkdir(join(res, 'raw'), { recursive: true });
await writeFile(join(res, 'raw', 'daily_read_chime.wav'), Buffer.concat([header, pcm]));

console.log('Wrote daily_read_logo.png and daily_read_chime.wav');
