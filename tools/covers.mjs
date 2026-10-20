#!/usr/bin/env node
// Converts the book covers in assets/covers/ (JPEG / AVIF, supplied) into
// public/covers/<id>.webp at 1024 px wide, aspect kept. The Innovator's
// Dilemma has no supplied scan: its cover comes from Open Library's covers
// API (search "the innovator's dilemma" by Christensen → cover_i 9274687 →
// https://covers.openlibrary.org/b/id/9274687-L.jpg), fetched once here and
// committed. Run: node tools/covers.mjs (needs the network for that one file).
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'public/covers';
fs.mkdirSync(OUT, { recursive: true });
const SRC = 'assets/covers';
for (const f of fs.readdirSync(SRC)) {
  if (!/\.(jpe?g|avif|png)$/i.test(f)) continue;
  const out = path.join(OUT, f.replace(/\.[^.]+$/, '.webp'));
  const info = await sharp(path.join(SRC, f)).resize({ width: 1024 }).webp({ quality: 86, effort: 6 }).toFile(out);
  console.log(`${out}: ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
}
const OL = 'https://covers.openlibrary.org/b/id/9274687-L.jpg';
const res = await fetch(OL);
if (!res.ok) { console.error(`Open Library ${res.status}`); process.exit(1); }
const buf = Buffer.from(await res.arrayBuffer());
const info = await sharp(buf).resize({ width: 1024 }).webp({ quality: 86, effort: 6 }).toFile(path.join(OUT, 'innovators-dilemma.webp'));
console.log(`${OUT}/innovators-dilemma.webp (Open Library): ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
