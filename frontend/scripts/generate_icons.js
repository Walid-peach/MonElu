// Generates the PWA icons from the canonical app icon (src/app/icon.svg).
// Run from frontend/: node scripts/generate_icons.js
// Outputs: public/icon-192.png, public/icon-512.png, public/icon-512-maskable.png
// (manifest icons) and src/app/apple-icon.png (iOS home-screen icon, served by
// Next.js convention).
const path = require('path')
const { readFileSync } = require('fs')
const sharp = require('sharp')

const root = path.join(__dirname, '..')
const svg = readFileSync(path.join(root, 'src', 'app', 'icon.svg'))
// Maskable variant: same art, scaled to ~78% and centered on a flat (unrounded)
// navy background so it survives circular/squircle adaptive-icon masks. See
// https://web.dev/articles/maskable-icon
const maskableSvg = readFileSync(path.join(root, 'src', 'app', 'icon-maskable.svg'))

// The source SVG is 100px; density 1024 rasterizes it well above 512px so
// every output size is a downscale (no upscaling blur).
const DENSITY = 1024

async function main() {
  for (const size of [192, 512]) {
    await sharp(svg, { density: DENSITY })
      .resize(size, size)
      .png()
      .toFile(path.join(root, 'public', `icon-${size}.png`))
    console.log(`public/icon-${size}.png`)
  }
  await sharp(maskableSvg, { density: DENSITY })
    .resize(512, 512)
    .png()
    .toFile(path.join(root, 'public', 'icon-512-maskable.png'))
  console.log('public/icon-512-maskable.png')
  // iOS applies its own corner mask, so flatten onto the navy background for a
  // full-bleed square instead of a rounded shape over transparency.
  await sharp(svg, { density: DENSITY })
    .resize(180, 180)
    .flatten({ background: '#0D1F3C' })
    .png()
    .toFile(path.join(root, 'src', 'app', 'apple-icon.png'))
  console.log('src/app/apple-icon.png')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
