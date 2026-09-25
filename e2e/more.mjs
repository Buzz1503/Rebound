// More tab: program editor edit + add, Hevy import with matching, export, theme.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = process.env.BASE_URL ?? 'http://localhost:4173/Rebound/'
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium' })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
page.on('pageerror', (e) => errors.push(String(e)))
const shot = (n, full = false) => page.screenshot({ path: `e2e/shots/${n}.png`, fullPage: full })

await page.goto(BASE)
await page.getByRole('button', { name: 'More', exact: true }).click()
await shot('m-more', true)
await page.getByRole('button', { name: /Program editor/ }).click()
await page.getByRole('button', { name: /Session B/ }).click()
await shot('m-session-b', true)
await page.getByRole('button', { name: /^Lying hamstring curl \d/ }).click()
await page.getByRole('button', { name: 'More Sets' }).click()
await shot('m-edit-item')
await page.getByRole('button', { name: 'Save' }).click()
await page.waitForTimeout(300)
console.log('hamstring now:', await page.getByRole('button', { name: /^Lying hamstring curl \d/ }).innerText())
await page.getByRole('button', { name: 'Add exercise' }).click()
await page.waitForTimeout(300)
await shot('m-add')
await page.getByRole('dialog', { name: 'Add exercise' }).getByRole('button', { name: /Machine hip adduction/ }).click()
await page.waitForTimeout(300)
console.log('B entries:', (await page.locator('ul > li').allInnerTexts()).map((t) => t.split('\n')[0]).join(' | '))
await page.getByRole('button', { name: '‹ Program' }).click()
await page.getByRole('button', { name: '‹ More' }).click()

writeFileSync('e2e/shots/hevy.csv', `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Legs","10 Sep 2026, 07:30","10 Sep 2026, 08:40","","Leg Press (Machine)","","","0","normal","80","12","","",""
"Legs","10 Sep 2026, 07:30","10 Sep 2026, 08:40","","Lying Leg Curl (Machine)","","","0","normal","35","12","","",""
"Legs","10 Sep 2026, 07:30","10 Sep 2026, 08:40","","Bulgarian Split Squat","","","0","normal","20","8","","",""
`)
await page.getByRole('button', { name: /Import from Hevy/ }).click()
const chooser = page.waitForEvent('filechooser')
await page.getByRole('button', { name: 'Choose Hevy CSV' }).click()
await (await chooser).setFiles('e2e/shots/hevy.csv')
await page.waitForTimeout(400)
await shot('m-hevy', true)
await page.getByRole('button', { name: /^Import \d/ }).click()
await page.waitForTimeout(400)
console.log('toast:', await page.getByRole('status').innerText())

const dl = page.waitForEvent('download')
await page.getByRole('button', { name: /Export backup/ }).click()
console.log('download:', (await dl).suggestedFilename())
await page.getByRole('radio', { name: 'light' }).click()
await page.waitForTimeout(200)
await shot('m-light')
console.log('errors', errors)
await browser.close()
