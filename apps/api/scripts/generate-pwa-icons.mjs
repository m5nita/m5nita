// Rasterizes the SVG app icons into PNGs for PWA install + iOS apple-touch-icon
// (iOS Safari does not render SVG touch icons). Run from apps/api so the
// @resvg/resvg-js dependency resolves:
//   node scripts/generate-pwa-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Resvg } from '@resvg/resvg-js'

const here = dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = join(here, '../../web/public')
const FONTS_DIR = join(here, '../assets/fonts')
const fontFiles = [
  join(FONTS_DIR, 'BarlowCondensed-Black.ttf'),
  join(FONTS_DIR, 'Inter-Bold.ttf'),
  join(FONTS_DIR, 'Inter-Regular.ttf'),
]

function render(svgPath, size, outName) {
  const svg = readFileSync(join(PUBLIC_DIR, svgPath), 'utf8')
  const png = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
    font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Barlow Condensed' },
  })
    .render()
    .asPng()
  writeFileSync(join(PUBLIC_DIR, outName), png)
  console.log(`wrote ${outName} (${size}x${size}, ${png.length} bytes)`)
}

render('icon-512.svg', 180, 'apple-touch-icon.png')
render('icon-512.svg', 192, 'icon-192.png')
render('icon-512.svg', 512, 'icon-512.png')
render('icon-maskable.svg', 512, 'icon-maskable-512.png')
