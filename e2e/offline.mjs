// First load online, then airplane mode: the app must still open and work.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/Rebound/'
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const t0 = Date.now()
await page.goto(BASE)
await page.getByRole('button', { name: /Start/ }).first().waitFor()
console.log('first paint with Start button:', Date.now() - t0, 'ms')
await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready
  return reg.active?.state
})
// let the SW finish precaching, including lazy screens
await page.waitForTimeout(2000)
await ctx.setOffline(true)
await page.reload()
await page.getByRole('button', { name: /Start/ }).first().waitFor({ timeout: 5000 })
await page.getByRole('button', { name: 'Progress', exact: true }).click()
await page.getByText('Estimated strength').waitFor({ timeout: 5000 })
await page.getByRole('button', { name: 'Rehab', exact: true }).click()
await page.getByText('Flare mode').first().waitFor({ timeout: 5000 })
const manifest = await page.evaluate(() => document.querySelector('link[rel="manifest"]')?.getAttribute('href'))
console.log('offline OK; manifest:', manifest, 'persisted storage:', await page.evaluate(() => navigator.storage.persisted()))
console.log('errors', errors)
await browser.close()
