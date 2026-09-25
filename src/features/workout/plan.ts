// Build today's exercise list from a session template, current stages and
// history. Pure: everything it needs is passed in, so it is unit-tested.

import type { FlareState, ISODate, PlannedExercise, SetLog, Workout } from '../../data/records'
import { HOME_DAY, SHOULDER_CARE, WRIST_STAGES } from '../../data/seed'
import type { Exercise, SessionEntry, SessionItem, WristStageId } from '../../data/types'
import { nextDouble } from '../../engine/double'
import { flarePhase } from '../../engine/flare'
import { nextKneeLift, stage2Week, type KneeFlare } from '../../engine/knee'
import { slotKey } from '../../engine/slots'
import type { Comparison, SlotSession, Suggestion } from '../../engine/types'

export interface SlotRecord {
  workout: Workout
  sets: SetLog[]
}

export interface PlanContext {
  today: ISODate
  exercises: Map<string, Exercise>
  wristStage: WristStageId
  stage2Start: ISODate | null
  /** Latest morning check vs baseline, knee. */
  kneeMorning: Comparison | null
  flare: FlareState | null
  /** Finished workouts per slot key, most recent first. */
  history: Map<string, SlotRecord[]>
}

const isItem = (e: SessionEntry): e is SessionItem => 'exerciseId' in e

/** Expand stage blocks (wrist block, shoulder care) into plain items. */
export function expandEntries(entries: SessionEntry[], wristStage: WristStageId): { item: SessionItem; optional: boolean }[] {
  const out: { item: SessionItem; optional: boolean }[] = []
  for (const e of entries) {
    if (isItem(e)) {
      out.push({ item: e, optional: false })
    } else if (e.block === 'wristBlock') {
      const stage = WRIST_STAGES.find((w) => w.id === wristStage)
      for (const item of stage?.exercises ?? []) out.push({ item, optional: e.optional })
    } else {
      for (const item of SHOULDER_CARE) out.push({ item, optional: e.optional })
    }
  }
  return out
}

/** Turn a finished workout's sets into the engine's view of one past session. */
export function toSlotSession(rec: SlotRecord, key: string): SlotSession {
  const planned = rec.workout.exercises.find((x) => x.slotKey === key)?.plan
  const sets = [...rec.sets].sort((a, b) => a.setIndex - b.setIndex || (a.side ?? '').localeCompare(b.side ?? ''))
  const weights = sets.map((s) => s.weightKg).filter((w): w is number => w !== null)
  const target = planned?.suggestion
    ? planned.suggestion.holdSec ?? planned.suggestion.reps.min
    : planned?.holdSec?.min ?? planned?.reps?.min ?? 0
  return {
    date: rec.workout.date,
    weightKg: weights.length ? (weights[weights.length - 1] ?? null) : null,
    target,
    sets: sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps, holdSec: s.holdSec, rir: s.rir, pain: s.pain })),
  }
}

/** For unilateral lifts, judge each set by its weaker side. */
function mergeSides(session: SlotSession, perSide: boolean): SlotSession {
  if (!perSide) return session
  const merged = []
  for (let i = 0; i < session.sets.length; i += 2) {
    const a = session.sets[i]
    const b = session.sets[i + 1]
    if (!a) continue
    if (!b) {
      merged.push(a)
      continue
    }
    const min = (x: number | null, y: number | null) => (x === null ? y : y === null ? x : Math.min(x, y))
    const pain = { ...a.pain }
    for (const [j, v] of Object.entries(b.pain) as [keyof typeof pain, number][]) pain[j] = Math.max(pain[j] ?? 0, v)
    merged.push({ weightKg: a.weightKg, reps: min(a.reps, b.reps), holdSec: min(a.holdSec, b.holdSec), rir: min(a.rir, b.rir), pain })
  }
  return { ...session, sets: merged }
}

function kneeFlare(flare: FlareState | null, today: ISODate, exerciseId: string): KneeFlare {
  const phase = flarePhase(flare, today)
  if (!phase) return null
  if (phase.phase === 'isometric') return { phase: 'isometric', daysLeft: phase.daysLeft }
  return { phase: 'restart', preFlareWeightKg: flare?.preFlareWeights[exerciseId] ?? null }
}

export function suggestFor(item: SessionItem, ex: Exercise, ctx: PlanContext): Suggestion | null {
  const key = slotKey(item)
  const recs = ctx.history.get(key) ?? []
  const recent = recs.map((r) => mergeSides(toSlotSession(r, key), item.perSide))
  const p = item.prescription

  if (ex.progression === 'kneeHsr') {
    const week = ctx.stage2Start ? stage2Week(ctx.stage2Start, ctx.today) : 1
    const last = recs[0]
    const lastWeek = last && ctx.stage2Start ? stage2Week(ctx.stage2Start, last.workout.date) : null
    return nextKneeLift({
      name: ex.name,
      startWeightKg: ex.startWeightKg ?? 0,
      incrementKg: ex.increment?.amount ?? 2.5,
      week,
      lastWeek,
      last: recent[0] ?? null,
      morning: ctx.kneeMorning,
      flare: kneeFlare(ctx.flare, ctx.today, ex.id),
    })
  }
  if (ex.progression === 'none') return null
  const range = p.kind === 'fixed' || p.kind === 'holdReps' ? p.reps : p.kind === 'timed' ? p.holdSec : null
  const sets = p.kind === 'fixed' || p.kind === 'holdReps' || p.kind === 'timed' ? p.sets : 1
  if (!range) return null
  return nextDouble({
    progression: ex.progression,
    startWeightKg: ex.startWeightKg,
    startWeightNote: ex.startWeightNote,
    increment: ex.increment,
    sets,
    range,
    recent,
  })
}

export function planItem(item: SessionItem, optional: boolean, ctx: PlanContext): PlannedExercise | null {
  const ex = ctx.exercises.get(item.exerciseId)
  if (!ex) return null
  const p = item.prescription
  const suggestion = suggestFor(item, ex, ctx)
  const base: PlannedExercise = {
    exerciseId: ex.id,
    slotKey: slotKey(item),
    section: item.section,
    optional,
    sets: 1,
    reps: null,
    holdSec: null,
    durationMin: null,
    restSec: item.restSec,
    tempo: item.tempo,
    note: item.note,
    perSide: item.perSide || ex.unilateral,
    skipIf: item.skipIf,
    progression: ex.progression,
    weightKg: suggestion?.weightKg ?? (ex.startWeightKg && ex.startWeightKg > 0 ? ex.startWeightKg : null),
    suggestion,
  }
  switch (p.kind) {
    case 'kneeStage':
      return { ...base, sets: suggestion?.sets ?? 3, reps: suggestion?.reps ?? { min: 15, max: 15 } }
    case 'fixed':
      return { ...base, sets: p.sets, reps: suggestion?.reps ?? p.reps }
    case 'timed': {
      const hold = suggestion?.holdSec ?? null
      return { ...base, sets: p.sets, holdSec: hold !== null ? { min: hold, max: hold } : p.holdSec }
    }
    case 'holdReps':
      return { ...base, sets: p.sets, reps: p.reps, holdSec: p.holdSec }
    case 'duration':
      return { ...base, durationMin: p.minutes }
  }
}

export function buildPlan(entries: SessionEntry[], ctx: PlanContext): PlannedExercise[] {
  return expandEntries(entries, ctx.wristStage)
    .map(({ item, optional }) => planItem(item, optional, ctx))
    .filter((x): x is PlannedExercise => x !== null)
}

export const homeDayEntries = HOME_DAY
