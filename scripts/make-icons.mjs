// Render app icons and iOS splash screens from one SVG design.
// Run: node scripts/make-icons.mjs   (uses the preinstalled Chromium)
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const BG = '#0a0c0f'
const GREEN = '#3ddc97'
const mark = (size, pad) => {
  const s = size - pad * 2
  // A dip and a rebound: down, then up past where it started.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <g transform="translate(${pad} ${pad}) scale(${s / 100})">
    <path d="M14 34 L38 62 L56 46 L86 18" fill="none" stroke="${GREEN}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M66 18 H86 V38" fill="none" stroke="${GREEN}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="14" y="76" width="72" height="8" rx="4" fill="#eceef1" opacity="0.9"/>
  </g>
</svg>`
}

mkdirSync('public/splash', { recursive: true })
writeFileSync('public/favicon.svg', mark(64, 6).replace(`<rect width="64" height="64" fill="${BG}"/>`, `<rect width="64" height="64" rx="14" fill="${BG}"/>`))

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' })
const page = await browser.newPage()
async function png(svg, w, h, out) {
  await page.setViewportSize({ width: w, height: h })
  await page.setContent(`<html><body style="margin:0;background:${BG}">${svg}</body></html>`)
  await page.screenshot({ path: out, omitBackground: false })
}

await png(mark(192, 20), 192, 192, 'public/pwa-192x192.png')
await png(mark(512, 52), 512, 512, 'public/pwa-512x512.png')
await png(mark(512, 110), 512, 512, 'public/pwa-maskable-512x512.png') // safe zone for masks
await png(mark(180, 18), 180, 180, 'public/apple-touch-icon.png')

// iOS splash screens (portrait): device CSS size x pixel ratio.
export const SPLASH = [
  [430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [414, 896, 3], [375, 812, 3], [414, 896, 2], [375, 667, 2], [440, 956, 3], [402, 874, 3],
]
for (const [w, h, r] of SPLASH) {
  const W = w * r
  const H = h * r
  const icon = Math.round(W * 0.28)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${BG}"/>
  <g transform="translate(${(W - icon) / 2} ${(H - icon) / 2 - H * 0.04})">${mark(icon, 0).replace(/<svg[^>]*>|<\/svg>/g, '').replace(`<rect width="${icon}" height="${icon}" fill="${BG}"/>`, '')}</g>
  <text x="${W / 2}" y="${H / 2 + icon / 2 + r * 28}" fill="#eceef1" font-family="-apple-system, system-ui, sans-serif" font-size="${r * 26}" font-weight="600" text-anchor="middle">Rebound</text></svg>`
  await png(svg, W, H, `public/splash/splash-${W}x${H}.png`)
}
await browser.close()
console.log('icons and', SPLASH.length, 'splash screens written')
