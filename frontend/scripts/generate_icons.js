// Generate web branding from the approved native app master.
// Run from frontend/: node scripts/generate_icons.js
const path = require('path')
const { mkdirSync } = require('fs')
const sharp = require('sharp')

const root = path.join(__dirname, '..')
const source = path.join(root, '..', 'ios/MonElu/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png')

async function main() {
  mkdirSync(path.join(root, 'public/brand'), { recursive: true })
  await sharp(source).resize(160, 160).webp({ quality: 90 })
    .toFile(path.join(root, 'public/brand/monelu-mark.webp'))
  for (const [file, size] of [
    ['public/icon-192.png', 192],
    ['public/icon-512.png', 512],
    ['src/app/apple-icon.png', 180],
    ['src/app/icon.png', 64],
  ]) {
    await sharp(source).resize(size, size).png().toFile(path.join(root, file))
    console.log(file)
  }
  // Extra breathing room keeps every part of the monogram inside the
  // central safe circle when Android applies its adaptive mask.
  const inset = await sharp(source).resize(410, 410).png().toBuffer()
  await sharp({ create: { width: 512, height: 512, channels: 3, background: '#FFFCF5' } })
    .composite([{ input: inset, left: 51, top: 51 }])
    .png().toFile(path.join(root, 'public/icon-512-maskable.png'))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
