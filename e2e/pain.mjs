// Pain above limit: card turns amber, plan swaps appear, one tap applies for the rest of the session.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/Rebound/'
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' })
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

await page.goto(BASE)
await page.getByRole('button', { name: 'Workout' }).click()
await page.getByRole('button', { name: /^Start/ }).click()
await page.getByRole('button', { name: 'Session overview' }).click()
await page.screenshot({ path: 'e2e/shots/pain-01-overview.png' })
await page.getByRole('button', { name: /Cable rope tricep pushdown/ }).click()
await page.waitForTimeout(400)
await page.getByRole('textbox', { name: 'kg' }).fill('20')
await page.getByRole('textbox', { name: 'kg' }).press('Enter')
await page.getByRole('button', { name: /^Done as planned/ }).click()
const sheet = page.getByRole('dialog', { name: 'Rest' })
await sheet.getByRole('radiogroup', { name: 'Wrist pain' }).getByRole('radio', { name: '5' }).click()
await sheet.getByRole('button', { name: /Skip rest/ }).click()
await page.waitForTimeout(400)
await page.screenshot({ path: 'e2e/shots/pain-02-swaps.png' })
console.log('swap buttons:', (await page.locator('article button').allInnerTexts()).map((t) => t.trim()))
await page.getByRole('button', { name: '-30% load' }).click()
await page.waitForTimeout(400)
const w = await page.getByRole('textbox', { name: 'kg' }).inputValue()
if (w !== '15') throw new Error(`expected 15 kg after -30%, got ${w}`)
console.log('weight after swap:', await page.getByRole('textbox', { name: 'kg' }).inputValue())
await page.screenshot({ path: 'e2e/shots/pain-03-after.png' })
console.log('errors', errors)
await browser.close()
