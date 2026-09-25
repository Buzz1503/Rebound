import type { ISODate, MorningCheck, SetLog, StageChange, Workout } from '../../data/records'
import type { Exercise, Joint, MuscleGroup } from '../../data/types'
import { addDays, daysBetween } from '../../engine/dates'
import { estimatedOneRepMax } from '../../engine/load'

export type Range = '4w' | '12w' | 'all'

export function rangeStart(range: Range, today: ISODate): ISODate | null {
  return range === '4w' ? addDays(today, -27) : range === '12w' ? addDays(today, -83) : null
}

const inRange = (date: ISODate, from: ISODate | null) => from === null || date >= from

function doneWorkouts(workouts: Workout[]): Map<string, Workout> {
  return new Map(workouts.filter((w) => w.status === 'done').map((w) => [w.id, w]))
}

/** Best estimated one-rep max per session date for one exercise. */
export function strengthSeries(sets: SetLog[], workouts: Workout[], exerciseId: string, from: ISODate | null): { date: ISODate; e1rm: number }[] {
  const done = doneWorkouts(workouts)
  const best = new Map<ISODate, number>()
  for (const s of sets) {
    const w = done.get(s.workoutId)
    if (!w || s.exerciseId !== exerciseId || !inRange(w.date, from) || !s.weightKg || !s.reps) continue
    best.set(w.date, Math.max(best.get(w.date) ?? 0, estimatedOneRepMax(s.weightKg, s.reps)))
  }
  return [...best].map(([date, e1rm]) => ({ date, e1rm })).sort((a, b) => a.date.localeCompare(b.date))
}

export type PainRow = { date: ISODate } & Record<Joint, number | null>

/** Daily max pain per joint: morning checks (knee = worse leg, wrist) and every logged set. */
export function painSeries(checks: MorningCheck[], sets: SetLog[], workouts: Workout[], from: ISODate | null): PainRow[] {
  const rows = new Map<ISODate, PainRow>()
  const row = (date: ISODate) => rows.get(date) ?? { date, knee: null, wrist: null, shoulder: null }
  const bump = (date: ISODate, j: Joint, v: number) => {
    const r = row(date)
    r[j] = Math.max(r[j] ?? 0, v)
    rows.set(date, r)
  }
  for (const c of checks) {
    if (!inRange(c.date, from)) continue
    bump(c.date, 'knee', Math.max(c.kneeLeft, c.kneeRight))
    bump(c.date, 'wrist', c.wristPain)
  }
  const done = doneWorkouts(workouts)
  for (const s of sets) {
    const w = done.get(s.workoutId)
    if (!w || !inRange(w.date, from)) continue
    for (const [j, v] of Object.entries(s.pain) as [Joint, number][]) bump(w.date, j, v)
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date))
}

export function stageMarkers(knee: StageChange[], wrist: StageChange[], from: ISODate | null): { date: ISODate; label: string }[] {
  return [...knee, ...wrist].filter((h) => inRange(h.date, from)).map((h) => ({ date: h.date, label: h.to }))
}

/** Average working sets per week per muscle group across the range (Hevy imports included). */
export function weeklySetsByMuscle(sets: SetLog[], workouts: Workout[], exercises: Map<string, Exercise>, from: ISODate | null, today: ISODate): { muscle: MuscleGroup; perWeek: number }[] {
  const done = doneWorkouts(workouts)
  const totals = new Map<MuscleGroup, number>()
  let first: ISODate | null = null
  for (const s of sets) {
    const w = done.get(s.workoutId)
    const ex = exercises.get(s.exerciseId)
    if (!w || !ex || !inRange(w.date, from)) continue
    if (ex.category === 'warmup' || ex.category === 'wristRehab' || ex.category === 'shoulderCare' || ex.category === 'home') continue
    if (s.side === 'right') continue // a left + right pair is one set
    if (!first || w.date < first) first = w.date
    for (const m of ex.muscles) totals.set(m, (totals.get(m) ?? 0) + 1)
  }
  const start = from ?? first ?? today
  const weeks = Math.max(1, (daysBetween(start, today) + 1) / 7)
  return [...totals]
    .map(([muscle, n]) => ({ muscle, perWeek: Math.round((n / weeks) * 10) / 10 }))
    .sort((a, b) => b.perWeek - a.perWeek)
}

export const MUSCLE_LABEL: Record<MuscleGroup, string> = {
  quads: 'Quads',
  kneeTendon: 'Knee tendon',
  glutes: 'Glutes',
  gluteMedius: 'Side glutes',
  hamstrings: 'Hamstrings',
  adductors: 'Adductors',
  calves: 'Calves',
  chest: 'Chest',
  triceps: 'Triceps',
  upperBack: 'Upper back',
  lats: 'Lats',
  biceps: 'Biceps',
  abs: 'Abs',
  deepCore: 'Deep core',
  obliques: 'Obliques',
  forearm: 'Forearm',
  rotatorCuff: 'Rotator cuff',
  cardio: 'Cardio',
}

export const GLUTE_HAM: MuscleGroup[] = ['glutes', 'gluteMedius', 'hamstrings']
