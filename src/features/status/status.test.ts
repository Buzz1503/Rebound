import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ReboundDB } from '../../db/db'
import { saveMorningCheck, updateSettings } from '../../db/repo'
import { seedIfEmpty } from '../../db/seedDb'
import { addDays } from '../../engine/dates'
import { setWristStage, startFlare } from '../rehab/actions'
import { loadStatus } from './status'

let db: ReboundDB
let n = 0
beforeEach(async () => {
  db = new ReboundDB(`status-${n++}`)
  await seedIfEmpty(db)
})
afterEach(async () => {
  await db.delete()
})

const today = '2026-10-20'
const check = (date: string, wristPain = 1, kneeLeft = 1) =>
  saveMorningCheck(db, { date, kneeLeft, kneeRight: 1, wristPain, wristSwelling: false, createdAt: 0 })

describe('loadStatus', () => {
  it('fresh install: morning check due, both questionnaires due, no prompts', async () => {
    const s = await loadStatus(db, today)
    expect(s.checkDoneToday).toBe(false)
    expect(s.due).toEqual(['VISA-P', 'PRWE'])
    expect(s.prompts).toEqual({ wristUp: false, wristDown: false, kneeUp: false })
    expect(s.kneeStage.current).toBe('K2')
    expect(s.wristStage.current).toBe('W1')
  })

  it('offers the wrist unlock after 14 clean days and restarts the streak after the change', async () => {
    for (let i = 13; i >= 0; i--) await check(addDays(today, -i))
    const s = await loadStatus(db, today)
    expect(s.wristGate.streak).toBe(14)
    expect(s.prompts.wristUp).toBe(true)
    await setWristStage(db, 'W2', today, 'test', false)
    const after = await loadStatus(db, today)
    expect(after.wristStage.current).toBe('W2')
    expect(after.wristGate.streak).toBe(1)
    expect(after.prompts.wristUp).toBe(false)
  })

  it('suggests flare mode after two worse knee mornings, and not once it is on', async () => {
    await check(addDays(today, -2))
    await check(addDays(today, -1), 1, 3)
    await check(today, 1, 4)
    expect((await loadStatus(db, today)).suggestFlare).toBe(true)
    await startFlare(db, today)
    const s = await loadStatus(db, today)
    expect(s.suggestFlare).toBe(false)
    expect(s.flare).toEqual({ phase: 'isometric', day: 1, daysLeft: 3 })
    expect(s.knee.light).toBe('red')
  })

  it('offers a wrist regression on swelling', async () => {
    await updateSettings(db, {})
    await setWristStage(db, 'W2', addDays(today, -5), 'test', true)
    await check(addDays(today, -1))
    await saveMorningCheck(db, { date: today, kneeLeft: 1, kneeRight: 1, wristPain: 1, wristSwelling: true, createdAt: 0 })
    const s = await loadStatus(db, today)
    expect(s.prompts.wristDown).toBe(true)
    expect(s.wrist.light).toBe('red')
  })
})
