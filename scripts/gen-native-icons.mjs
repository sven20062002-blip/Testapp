// Generates the app icons for the native iOS/Android projects from public/favicon.svg
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url)).toString();
const BG = '#0E0F11';
const path = (p) => new URL(`../${p}`, import.meta.url).pathname;
// logo only (no background), scaled into the centre – used as adaptive-icon foreground
const logo = (scale) =>
  Buffer.from(svg.replace(/<rect width="512" height="512"[^>]*\/>/, '').replace('<g fill', `<g transform="translate(${(256 * (1 - scale)).toFixed(1)} ${(256 * (1 - scale)).toFixed(1)}) scale(${scale})" fill`));
const fullBleed = Buffer.from(svg.replace('rx="116"', 'rx="0"').replace('<g fill', '<g transform="translate(51.2 51.2) scale(.8)" fill'));
const round = Buffer.from(svg.replace(/<rect width="512" height="512" rx="116"/, '<circle cx="256" cy="256" r="256"').replace('<g fill', '<g transform="translate(38.4 38.4) scale(.85)" fill'));

// Android: adaptive icon (108dp canvas, 66dp safe zone) + legacy square/round icons (48dp)
const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, f] of Object.entries(dens)) {
  const dir = `android/app/src/main/res/mipmap-${d}`;
  await sharp(logo(0.6)).resize(Math.round(108 * f), Math.round(108 * f)).png().toFile(path(`${dir}/ic_launcher_foreground.png`));
  await sharp(Buffer.from(svg)).resize(Math.round(48 * f), Math.round(48 * f)).png().toFile(path(`${dir}/ic_launcher.png`));
  await sharp(round).resize(Math.round(48 * f), Math.round(48 * f)).png().toFile(path(`${dir}/ic_launcher_round.png`));
}
writeFileSync(
  path('android/app/src/main/res/values/ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`,
);

// iOS: one 1024×1024 icon, no transparency (Apple rejects alpha)
await sharp(fullBleed).resize(1024, 1024).flatten({ background: BG }).removeAlpha().png().toFile(path('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
// Play Store listing icon 512×512 (no transparency)
await sharp(fullBleed).resize(512, 512).flatten({ background: BG }).removeAlpha().png().toFile(path('store/play-icon-512.png'));
console.log('native icons generated');

// Splash screens: light background with the app icon in the centre (replaces the Capacitor default)
import { readdirSync, statSync } from 'node:fs';
const splashLogo = Buffer.from(svg);
const splashFiles = [];
const walk = (dir) => {
  for (const f of readdirSync(dir)) {
    const p = `${dir}/${f}`;
    if (statSync(p).isDirectory()) walk(p);
    else if (/^splash.*\.png$/i.test(f)) splashFiles.push(p);
  }
};
walk(path('android/app/src/main/res'));
walk(path('ios/App/App/Assets.xcassets'));
for (const f of splashFiles) {
  const { width, height } = await sharp(f).metadata();
  const s = Math.round(Math.min(width, height) * 0.22);
  const icon = await sharp(splashLogo).resize(s, s).png().toBuffer();
  await sharp({ create: { width, height, channels: 3, background: '#F6F6F8' } })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(f + '.tmp');
  const { renameSync } = await import('node:fs');
  renameSync(f + '.tmp', f);
}
console.log(`${splashFiles.length} splash screens generated`);
