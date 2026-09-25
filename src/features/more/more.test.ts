import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EXERCISES } from '../../data/seed'
import { ReboundDB } from '../../db/db'
import { logSet, saveMorningCheck } from '../../db/repo'
import { seedIfEmpty } from '../../db/seedDb'
import { checkBackup, exportAll, exportSetsCsv, importAll } from './backup'
import { parseCsv, toCsv } from './csv'
import { bestMatch, buildHevyImport, parseHevy, parseHevyDate, similarity } from './hevy'

describe('csv', () => {
  it('round-trips quotes, commas and newlines', () => {
    const rows = [['a', 'b "q"', 'c,d'], ['1', 'line\nbreak', '']]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
  it('handles CRLF and a BOM', () => {
    expect(parseCsv('﻿x,y\r\n1,2\r\n')).toEqual([['x', 'y'], ['1', '2']])
  })
})

const HEVY = `"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_kg","reps","distance_km","duration_seconds","rpe"
"Legs","25 Sep 2026, 07:30","25 Sep 2026, 08:40","","Leg Press (Machine)","","","0","warmup","40","10","","",""
"Legs","25 Sep 2026, 07:30","25 Sep 2026, 08:40","","Leg Press (Machine)","","","1","normal","60","15","","",""
"Legs","25 Sep 2026, 07:30","25 Sep 2026, 08:40","","Lying Leg Curl (Machine)","","","0","normal","30","12","","",""
"Legs","25 Sep 2026, 07:30","25 Sep 2026, 08:40","","Plank","","","0","normal","","","","45",""
"Push","27 Sep 2026, 18:00","27 Sep 2026, 19:00","","Triceps Pushdown","","","0","normal","20","12","","",""
`

describe('hevy import', () => {
  it('parses Hevy dates', () => {
    expect(parseHevyDate('25 Sep 2026, 07:30')?.getMonth()).toBe(8)
    expect(parseHevyDate('nonsense')).toBeNull()
  })

  it('groups rows into workouts', () => {
    const { workouts, error } = parseHevy(HEVY)
    expect(error).toBeNull()
    expect(workouts.map((w) => w.title)).toEqual(['Legs', 'Push'])
    expect(workouts[0]?.exercises.map((e) => e.title)).toEqual(['Leg Press (Machine)', 'Lying Leg Curl (Machine)', 'Plank'])
  })

  it('rejects other CSVs', () => {
    expect(parseHevy('a,b\n1,2').error).toMatch(/Hevy/)
  })

  it('auto-matches similar names and leaves strangers unmatched', () => {
    expect(bestMatch('Leg Press (Machine)', EXERCISES).exerciseId).toBe('leg-press')
    expect(bestMatch('Lying Leg Curl (Machine)', EXERCISES).exerciseId).toBe('lying-hamstring-curl')
    expect(bestMatch('Triceps Pushdown', EXERCISES).exerciseId).toBe('cable-tricep-pushdown')
    expect(bestMatch('Barbell Back Squat', EXERCISES).exerciseId).toBeNull()
    expect(similarity('Leg Extension', 'Leg Extensions (Machine)')).toBeGreaterThan(0.9)
  })

  it('builds sessions from the confirmed mapping, skipping warm-ups and unmapped', () => {
    const { workouts } = parseHevy(HEVY)
    let i = 0
    const out = buildHevyImport(workouts, { 'Leg Press (Machine)': 'leg-press', 'Lying Leg Curl (Machine)': null, Plank: null, 'Triceps Pushdown': 'cable-tricep-pushdown' }, () => `id${i++}`)
    expect(out.workouts).toHaveLength(2)
    expect(out.workouts[0]).toMatchObject({ date: '2026-09-25', source: 'hevy', status: 'done' })
    expect(out.sets.map((s) => [s.exerciseId, s.weightKg, s.reps, s.slotKey])).toEqual([
      ['leg-press', 60, 15, 'leg-press:hevy'],
      ['cable-tricep-pushdown', 20, 12, 'cable-tricep-pushdown:hevy'],
    ])
  })
})

describe('backup', () => {
  let db: ReboundDB
  let n = 0
  beforeEach(async () => {
    db = new ReboundDB(`backup-${n++}`)
    await seedIfEmpty(db)
  })
  afterEach(async () => {
    await db.delete()
  })

  it('exports and re-imports everything', async () => {
    await saveMorningCheck(db, { date: '2026-09-25', kneeLeft: 2, kneeRight: 1, wristPain: 1, wristSwelling: false, createdAt: 0 })
    await db.workouts.put({ id: 'w', date: '2026-09-25', kind: 'gym', sessionId: 'A', status: 'done', startedAt: 1, finishedAt: 2, exercises: [], cursor: 0, source: 'app' })
    await logSet(db, { workoutId: 'w', entryKey: 'e', exerciseId: 'leg-press', slotKey: 'leg-press:knee', setIndex: 0, side: null, weightKg: 60, reps: 15, holdSec: null, rir: 2, pain: { knee: 1 } })
    const backup = JSON.parse(JSON.stringify(await exportAll(db)))
    expect(checkBackup(backup)).toBeNull()
    const other = new ReboundDB(`backup-other-${n++}`)
    await importAll(other, backup)
    expect(await other.sets.count()).toBe(1)
    expect((await other.settings.get('settings'))?.baseline?.kneeLeft).toBe(2)
    expect(await other.exercises.count()).toBe(await db.exercises.count())
    await other.delete()
    const csv = await exportSetsCsv(db)
    expect(csv.split('\n')[1]).toBe('2026-09-25,A,Leg press,1,,60,15,,2,1,,,app')
  })

  it('rejects files that are not backups', () => {
    expect(checkBackup({ foo: 1 })).toMatch(/Not a Rebound/)
    expect(checkBackup({ app: 'rebound', version: 99, tables: {} })).toMatch(/newer/)
    expect(checkBackup({ app: 'rebound', version: 1, tables: {} })).toMatch(/missing/)
  })
})

describe('program library', () => {
  it('offers machines and cables only', async () => {
    const { isMachineOrCable } = await import('./ProgramEditor')
    const ids = EXERCISES.filter(isMachineOrCable).map((e) => e.id)
    expect(ids).toContain('leg-press')
    expect(ids).toContain('cable-glute-kickback')
    expect(ids).toContain('hack-squat')
    expect(ids).not.toContain('dead-bug')
    expect(ids).not.toContain('forearm-side-plank')
    expect(ids).not.toContain('w1-grip-putty')
    expect(ids).not.toContain('bike')
  })
})
