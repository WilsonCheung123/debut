#!/usr/bin/env node
// Converts the supplied source images into the public/ assets the site uses.
// Sources live outside the repo (Downloads/Desktop); run once, commit the output.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME;
const jobs = [
  {
    src: path.join(HOME, 'Downloads', 'Harvard student portrait card.png'),
    out: 'public/id-card.webp',
    resize: { width: 1024, withoutEnlargement: true },
  },
  {
    src: path.join(HOME, 'Downloads', 'Red-robed traveler in an antique forest.png'),
    out: 'public/forest.webp',
    resize: { height: 1200, withoutEnlargement: true },
  },
];

for (const j of jobs) {
  if (!fs.existsSync(j.src)) { console.error(`missing source: ${j.src}`); process.exit(1); }
  const info = await sharp(j.src).resize(j.resize).webp({ quality: 86, effort: 6 }).toFile(j.out);
  console.log(`${j.out}: ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
}
const svg = path.join(HOME, 'Desktop', 'Checker_shadow_illusion.svg');
fs.copyFileSync(svg, 'public/checker-shadow.svg');
console.log('public/checker-shadow.svg copied');
