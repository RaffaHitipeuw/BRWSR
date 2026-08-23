import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const size = 1024;
const iconDir = './src-tauri/icons';

if (!fs.existsSync(iconDir)) {
  fs.mkdirSync(iconDir, { recursive: true });
}

const svg = `
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4F46E5"/>
      <stop offset="100%" style="stop-color:#7C3AED"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="180" fill="url(#bg)"/>
  <text x="50%" y="55%" font-family="Arial, sans-serif" font-size="${size * 0.5}" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">T</text>
</svg>
`;

async function generateIcons() {
  const pngBuffer = await sharp(Buffer.from(svg))
    .resize(1024, 1024)
    .png()
    .toBuffer();

  await sharp(pngBuffer).resize(32, 32).toFile(path.join(iconDir, '32x32.png'));
  await sharp(pngBuffer).resize(128, 128).toFile(path.join(iconDir, '128x128.png'));
  await sharp(pngBuffer).resize(256, 256).toFile(path.join(iconDir, '128x128@2x.png'));
  await sharp(pngBuffer).resize(512, 512).toFile(path.join(iconDir, 'icon.png'));

  console.log('Icons generated successfully!');
}

generateIcons().catch(console.error);
