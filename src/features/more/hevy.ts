// Hevy CSV export → historical sessions. Imported sets use a ':hevy' slot key
// so they show in history and charts without steering the progression engine.

import type { SetLog, Workout } from '../../data/records'
import type { Exercise } from '../../data/types'
import { toISODate } from '../../engine/dates'
import { parseCsv } from './csv'

export interface HevySet {
  weightKg: number | null
  reps: number | null
  durationSec: number | null
  type: string
}

export interface HevyWorkout {
  key: string
  title: string
  start: Date
  end: Date | null
  exercises: { title: string; sets: HevySet[] }[]
}

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }

/** Hevy writes "25 Sep 2026, 07:30"; newer exports may use ISO. */
export function parseHevyDate(s: string): Date | null {
  const m = s.trim().match(/^(\d{1,2}) (\w{3})\w* (\d{4}),? (\d{1,2}):(\d{2})/)
  if (m) {
    const mon = MONTHS[(m[2] ?? '').toLowerCase()]
    if (mon === undefined) return null
    return new Date(Number(m[3]), mon, Number(m[1]), Number(m[4]), Number(m[5]))
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function parseHevy(text: string): { workouts: HevyWorkout[]; error: string | null } {
  const rows = parseCsv(text)
  const header = rows[0]?.map((h) => h.trim().toLowerCase())
  if (!header) return { workouts: [], error: 'The file is empty.' }
  const col = (name: string) => header.indexOf(name)
  const iTitle = col('title')
  const iStart = col('start_time')
  const iEx = col('exercise_title')
  if (iTitle < 0 || iStart < 0 || iEx < 0) return { workouts: [], error: 'This does not look like a Hevy workout export (missing title, start_time or exercise_title).' }
  const iEnd = col('end_time')
  const iKg = col('weight_kg')
  const iLbs = col('weight_lbs')
  const iReps = col('reps')
  const iDur = col('duration_seconds')
  const iType = col('set_type')

  const byKey = new Map<string, HevyWorkout>()
  for (const r of rows.slice(1)) {
    const start = parseHevyDate(r[iStart] ?? '')
    if (!start) continue
    const title = r[iTitle] ?? 'Workout'
    const key = `${title}|${r[iStart]}`
    const w = byKey.get(key) ?? { key, title, start, end: iEnd >= 0 ? parseHevyDate(r[iEnd] ?? '') : null, exercises: [] }
    const exTitle = (r[iEx] ?? '').trim()
    let ex = w.exercises.find((e) => e.title === exTitle)
    if (!ex) {
      ex = { title: exTitle, sets: [] }
      w.exercises.push(ex)
    }
    const lbs = iLbs >= 0 ? num(r[iLbs]) : null
    ex.sets.push({
      weightKg: iKg >= 0 ? num(r[iKg]) : lbs !== null ? Math.round(lbs * 0.45359237 * 100) / 100 : null,
      reps: iReps >= 0 ? num(r[iReps]) : null,
      durationSec: iDur >= 0 ? num(r[iDur]) : null,
      type: (iType >= 0 ? r[iType] : 'normal')?.trim().toLowerCase() || 'normal',
    })
    byKey.set(key, w)
  }
  return { workouts: [...byKey.values()].sort((a, b) => a.start.getTime() - b.start.getTime()), error: null }
}

/** Common gym-name variants mapped to the words this library uses. */
const SYNONYMS: [RegExp, string][] = [
  [/\bleg curl\b/g, 'hamstring curl'],
  [/\btriceps\b/g, 'tricep'],
  [/\babductors?\b/g, 'abduction'],
  [/\badductors?\b/g, 'adduction'],
  [/\bhip thrusts?\b/g, 'hip thrust'],
  [/\bseated row\b/g, 'row'],
  [/\bkickbacks?\b/g, 'kickback'],
  [/\bcalf raises?\b/g, 'calf raise'],
]

const norm = (s: string) =>
  SYNONYMS.reduce((acc, [re, to]) => acc.replace(re, to), s.toLowerCase())
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(machine|cable|rope|the|a|with)\b/g, ' ')
    .replace(/\bcurls?\b/g, 'curl')
    .replace(/\bextensions?\b/g, 'extension')
    .replace(/\s+/g, ' ')
    .trim()

function bigrams(s: string): string[] {
  const t = ` ${s} `
  return Array.from({ length: Math.max(0, t.length - 1) }, (_, i) => t.slice(i, i + 2))
}

/** Dice similarity on character bigrams of normalised names, 0..1. */
export function similarity(a: string, b: string): number {
  const x = bigrams(norm(a))
  const y = bigrams(norm(b))
  if (!x.length || !y.length) return 0
  const pool = [...y]
  let hit = 0
  for (const g of x) {
    const i = pool.indexOf(g)
    if (i >= 0) {
      hit++
      pool.splice(i, 1)
    }
  }
  return (2 * hit) / (x.length + y.length)
}

export const AUTO_MATCH = 0.72

export function bestMatch(title: string, library: Exercise[]): { exerciseId: string | null; score: number } {
  let best: { exerciseId: string | null; score: number } = { exerciseId: null, score: 0 }
  for (const e of library) {
    const sc = similarity(title, e.name)
    if (sc > best.score) best = { exerciseId: e.id, score: sc }
  }
  return best.score >= AUTO_MATCH ? best : { exerciseId: null, score: best.score }
}

/** Build workouts and sets for the mapped exercises. Unmapped exercises and warm-up sets are skipped. */
export function buildHevyImport(workouts: HevyWorkout[], mapping: Record<string, string | null>, newId: () => string): { workouts: Workout[]; sets: SetLog[] } {
  const outW: Workout[] = []
  const outS: SetLog[] = []
  for (const hw of workouts) {
    const id = newId()
    const sets: SetLog[] = []
    for (const ex of hw.exercises) {
      const exerciseId = mapping[ex.title]
      if (!exerciseId) continue
      ex.sets
        .filter((s) => s.type !== 'warmup')
        .forEach((s, i) =>
          sets.push({
            id: newId(),
            workoutId: id,
            entryKey: `hevy:${exerciseId}`,
            exerciseId,
            slotKey: `${exerciseId}:hevy`,
            setIndex: i,
            side: null,
            weightKg: s.weightKg,
            reps: s.reps,
            holdSec: s.durationSec,
            rir: null,
            pain: {},
            loggedAt: hw.start.getTime() + i,
          }),
        )
    }
    if (!sets.length) continue
    outS.push(...sets)
    outW.push({
      id,
      date: toISODate(hw.start),
      kind: 'gym',
      sessionId: null,
      status: 'done',
      startedAt: hw.start.getTime(),
      finishedAt: hw.end?.getTime() ?? hw.start.getTime(),
      exercises: [],
      cursor: 0,
      source: 'hevy',
    })
  }
  return { workouts: outW, sets: outS }
}
