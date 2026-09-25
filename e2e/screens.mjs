// Screenshot Today, morning check, Rehab and Progress at 390px.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/rebound/'
const THEME = process.env.THEME ?? 'dark'
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, colorScheme: THEME })).newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
const shot = (n) => page.screenshot({ path: `e2e/shots/${n}.png`, fullPage: true })

await page.goto(BASE)
await page.waitForTimeout(500)
await shot('s-today-fresh')
await page.getByRole('button', { name: /Morning check first/ }).click()
const tap = (group, v) => page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: String(v), exact: true }).click()
await tap('Left knee', 2)
await tap('Right knee', 1)
await tap('Wrist pain', 2)
await page.getByRole('radio', { name: 'No' }).click()
await shot('s-morning')
await page.getByRole('button', { name: /See today/ }).click()
await page.waitForTimeout(300)
await shot('s-morning-result')
await page.getByRole('button', { name: 'Done' }).click()
await page.waitForTimeout(300)
await shot('s-today-after')
await page.getByRole('button', { name: 'Rehab', exact: true }).click()
await page.waitForTimeout(500)
await shot('s-rehab')
await page.getByRole('button', { name: 'Progress', exact: true }).click()
await page.waitForTimeout(500)
await shot('s-progress')
console.log('errors', errors)
await browser.close()
