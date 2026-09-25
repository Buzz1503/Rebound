import type { SetLog, Side, WorkoutExerciseState } from '../../data/records'
import type { Exercise, Joint } from '../../data/types'
import { RULES } from '../../data/seed'
import { roundToIncrement } from '../../engine/load'

export interface SetSlot {
  setIndex: number
  side: Side | null
}

/** Every set to log, in order. Unilateral sets log left then right. */
export function setSlots(sets: number, perSide: boolean): SetSlot[] {
  const out: SetSlot[] = []
  for (let i = 0; i < sets; i++) {
    if (perSide) out.push({ setIndex: i, side: 'left' }, { setIndex: i, side: 'right' })
    else out.push({ setIndex: i, side: null })
  }
  return out
}

export function nextSlot(state: WorkoutExerciseState, logged: SetLog[]): SetSlot | null {
  const done = new Set(logged.map((s) => `${s.setIndex}:${s.side ?? ''}`))
  return setSlots(state.plan.sets, state.plan.perSide).find((s) => !done.has(`${s.setIndex}:${s.side ?? ''}`)) ?? null
}

export type EntryStatus = 'todo' | 'partial' | 'done' | 'skipped'

export function entryStatus(state: WorkoutExerciseState, logged: SetLog[]): EntryStatus {
  if (state.skipped) return 'skipped'
  if (logged.length === 0) return 'todo'
  return nextSlot(state, logged) === null ? 'done' : 'partial'
}

/** First exercise at or after `from` that still needs work (wraps around). */
export function nextOpenIndex(states: WorkoutExerciseState[], setsByEntry: Map<string, SetLog[]>, from: number): number | null {
  const n = states.length
  for (let k = 0; k < n; k++) {
    const i = (from + k) % n
    const s = states[i]
    if (!s || s.plan.optional) continue
    const st = entryStatus(s, setsByEntry.get(s.key) ?? [])
    if (st === 'todo' || st === 'partial') return i
  }
  return null
}

/** Planned weight with any swap load change applied, rounded to the machine. */
export function effectiveWeight(state: WorkoutExerciseState, ex: Exercise | undefined): number | null {
  const w = state.plan.weightKg
  if (w === null) return null
  if (!state.loadPct) return w
  const inc = ex?.increment?.unit === 'kg' ? ex.increment.amount : 2.5
  return roundToIncrement(w * (1 + state.loadPct / 100), inc)
}

/** Joints over their limit on any logged set of this exercise today. */
export function jointsOverLimitToday(logged: SetLog[]): { joint: Joint; pain: number }[] {
  const worst = new Map<Joint, number>()
  for (const s of logged) {
    for (const [j, v] of Object.entries(s.pain) as [Joint, number][]) {
      if (v > RULES.painLimit[j]) worst.set(j, Math.max(worst.get(j) ?? 0, v))
    }
  }
  return [...worst].map(([joint, pain]) => ({ joint, pain }))
}

export function maxPainToday(all: SetLog[], joint: Joint): number | null {
  const v = all.map((s) => s.pain[joint]).filter((x): x is number => x !== undefined)
  return v.length ? Math.max(...v) : null
}

export function groupByEntry(sets: SetLog[]): Map<string, SetLog[]> {
  const m = new Map<string, SetLog[]>()
  for (const s of sets) m.set(s.entryKey, [...(m.get(s.entryKey) ?? []), s])
  for (const v of m.values()) v.sort((a, b) => a.setIndex - b.setIndex || (a.side ?? '').localeCompare(b.side ?? ''))
  return m
}
