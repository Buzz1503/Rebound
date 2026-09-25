// Drive a full Session A in a phone-sized viewport with a fake clock.
// BASE_URL defaults to the local preview (npm run build && npx vite preview).
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/Rebound/'
const SHOTS = process.env.SHOTS ?? 'e2e/shots'
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true })
const page = await ctx.newPage()
await page.clock.install({ time: new Date('2026-09-28T07:00:00') })
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))

const shot = (n) => page.screenshot({ path: `${SHOTS}/${n}.png` })
const title = () => page.locator('article h2').first().innerText()
const tick = (ms) => page.clock.runFor(ms)
const click = async (name, opts = {}) => {
  await page.getByRole('button', { name, ...opts }).first().click()
  await tick(400)
}

async function closeRest(joint) {
  const sheet = page.getByRole('dialog', { name: 'Rest' })
  if (!(await sheet.isVisible().catch(() => false))) return
  if (await sheet.getByRole('radiogroup', { name: 'Reps in reserve' }).isVisible().catch(() => false)) {
    await sheet.getByRole('radiogroup', { name: 'Reps in reserve' }).getByRole('radio', { name: '2' }).click()
  }
  for (const j of joint) {
    const g = sheet.getByRole('radiogroup', { name: `${j} pain` })
    if (await g.isVisible().catch(() => false)) await g.getByRole('radio', { name: '1', exact: true }).click()
  }
  await sheet.getByRole('button', { name: /Skip rest|Next set|Done/ }).click()
  await tick(400)
}

await page.goto(BASE)
await tick(500)
await shot('00-today')
// Morning check first, the way it's meant to be used.
await click(/Morning check first/)
const tap = (group, v) => page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: String(v), exact: true }).click()
await tap('Left knee', 1)
await tap('Right knee', 1)
await tap('Wrist pain', 1)
await page.getByRole('radio', { name: 'No' }).click()
await click(/See today/)
await shot('00-morning-result')
await click('Done')
await click(/^Start Session A/)
await shot('01-bike')

const seen = []
const shots = new Set()
for (let guard = 0; guard < 120; guard++) {
  await closeRest(['Knee', 'Wrist', 'Shoulder'])
  const done = page.getByRole('button', { name: 'Finish session' })
  if (await done.isVisible().catch(() => false)) break
  const name = await title()
  if (!seen.includes(name)) {
    seen.push(name)
    await shot(`card-${String(seen.length).padStart(2, '0')}`)
  }
  const start = page.getByRole('button', { name: /^Start set/ })
  const doneBtn = page.getByRole('button', { name: /^(Done as planned|Log set|Done:)/ })
  if (await start.isVisible().catch(() => false)) {
    await start.click()
    await tick(200)
    if (!shots.has('hold')) {
      shots.add('hold')
      await tick(3000)
      await shot('hold-running')
    }
    // Step the clock until the hold timer finishes.
    for (let t = 0; t < 400; t++) {
      await tick(2000)
      if (!(await page.getByRole('button', { name: /^(Pause|Resume)$/ }).isVisible().catch(() => false))) break
    }
  } else if (await doneBtn.isVisible().catch(() => false)) {
    if (await doneBtn.isDisabled()) {
      // "Set on day 1" exercise: choose a working weight first.
      await page.getByRole('textbox', { name: 'kg' }).fill('40')
      await page.getByRole('textbox', { name: 'kg' }).press('Enter')
      await tick(100)
    }
    await doneBtn.click()
    await tick(300)
    if (name === 'Leg press' && !shots.has('rest')) {
      shots.add('rest')
      await tick(20_000)
      await shot('rest-sheet')
      // Resume: the app closes mid-session and reopens on the same exercise.
      await page.reload()
      await tick(800)
      await click('Workout')
      await tick(800)
      await shot('resume-debug')
      const resumed = await title()
      if (resumed !== 'Leg press') throw new Error(`Resume landed on ${resumed}`)
      console.log('resume ok:', resumed, await page.locator('header').innerText())
    }
  } else {
    await click(/^Next exercise/)
    continue
  }
  await closeRest(['Knee', 'Wrist', 'Shoulder'])
}
await shot('97-finish-ready')
await click('Finish session')
await click('Finish and see summary')
await tick(1000)
await shot('98-summary')
console.log('cards', seen.join(' | '))
console.log('summary', (await page.locator('main').innerText()).replace(/\n+/g, ' / '))
console.log('errors', errors)
await browser.close()
