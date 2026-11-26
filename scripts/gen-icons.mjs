// Generates PWA icons from public/favicon.svg
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url));
// Maskable: full-bleed background, logo within the 80% safe zone
const maskable = Buffer.from(
  svg.toString().replace('rx="116"', 'rx="0"').replace('<g fill', '<g transform="translate(51.2 51.2) scale(.8)" fill'),
);
const out = (n) => new URL(`../public/${n}`, import.meta.url).pathname;
await sharp(svg).resize(192, 192).png().toFile(out('pwa-192.png'));
await sharp(svg).resize(512, 512).png().toFile(out('pwa-512.png'));
await sharp(maskable).resize(512, 512).png().toFile(out('pwa-maskable-512.png'));
// iOS ignores transparency; use full-bleed square
await sharp(maskable).resize(180, 180).png().toFile(out('apple-touch-icon.png'));
console.log('icons generated');
