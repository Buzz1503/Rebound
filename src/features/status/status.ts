// Everything Today and Rehab need to know about "where am I", computed from the
// database with the pure engine. Read-only.

import type { FlareState, ISODate, KneeStageState, MorningCheck, QuestionnaireType, SetLog, Workout, WristStageState } from '../../data/records'
import type { Joint } from '../../data/types'
import type { ReboundDB } from '../../db/db'
import { getSettings } from '../../db/repo'
import { addDays, daysBetween } from '../../engine/dates'
import { flarePhase, shouldSuggestFlare, type FlarePhase } from '../../engine/flare'
import { kneeStage3Gate, wristDays, wristGate, type Criterion, type WristGate } from '../../engine/gates'
import { stage2Week } from '../../engine/knee'
import { kneeStatus, wristStatus, type JointStatus } from '../../engine/morning'
import { questionnaireDue } from '../../engine/questionnaires'

export interface DayPain {
  date: ISODate
  pain: number
}

/** Highest pain per joint per day, from logged sets (by workout date). */
export function sessionPainByDay(sets: SetLog[], workouts: Map<string, Workout>, joint: Joint): DayPain[] {
  const byDay = new Map<ISODate, number>()
  for (const s of sets) {
    const v = s.pain[joint]
    const w = workouts.get(s.workoutId)
    if (v === undefined || !w || w.status === 'abandoned') continue
    byDay.set(w.date, Math.max(byDay.get(w.date) ?? 0, v))
  }
  return [...byDay].map(([date, pain]) => ({ date, pain })).sort((a, b) => a.date.localeCompare(b.date))
}

/** Dates of finished leg press sessions done at 4 x 6 with every rep hit. */
export function legPress4x6Dates(sets: SetLog[], workouts: Map<string, Workout>): ISODate[] {
  const out = new Set<ISODate>()
  for (const w of workouts.values()) {
    if (w.status !== 'done') continue
    const entry = w.exercises.find((e) => e.slotKey === 'leg-press:knee')
    if (!entry || entry.plan.sets !== 4 || entry.plan.reps?.min !== 6) continue
    const ls = sets.filter((s) => s.workoutId === w.id && s.entryKey === entry.key)
    if (ls.length >= 4 && ls.every((s) => (s.reps ?? 0) >= 6)) out.add(w.date)
  }
  return [...out].sort()
}

export interface Status {
  today: ISODate
  check: MorningCheck | null
  checkDoneToday: boolean
  knee: JointStatus
  wrist: JointStatus
  kneeStage: KneeStageState
  wristStage: WristStageState
  week: number | null
  wristGate: WristGate
  kneeGate: { criteria: Criterion[]; allMet: boolean }
  flare: FlarePhase
  flareState: FlareState | null
  suggestFlare: boolean
  due: QuestionnaireType[]
  /** Prompts waiting on "Your physio agrees?" */
  prompts: { wristUp: boolean; wristDown: boolean; kneeUp: boolean }
}

export async function loadStatus(db: ReboundDB, today: ISODate): Promise<Status> {
  const [settings, checks, knee, wrist, workoutsArr, sets, qs, decline] = await Promise.all([
    getSettings(db),
    db.morningChecks.orderBy('date').toArray(),
    db.stages.get('knee') as Promise<KneeStageState | undefined>,
    db.stages.get('wrist') as Promise<WristStageState | undefined>,
    db.workouts.toArray(),
    db.sets.toArray(),
    db.questionnaires.orderBy('date').toArray(),
    db.declineSquatTests.orderBy('date').last(),
  ])
  const kneeStage: KneeStageState = knee ?? { id: 'knee', current: 'K2', stage2Start: null, history: [] }
  const wristStage: WristStageState = wrist ?? { id: 'wrist', current: 'W1', history: [] }
  const workouts = new Map(workoutsArr.map((w) => [w.id, w]))
  const check = checks[checks.length - 1] ?? null
  const checkDoneToday = check?.date === today

  const lastDone = workoutsArr.filter((w) => w.status === 'done').sort((a, b) => b.startedAt - a.startedAt)[0]
  const lastPain = (joint: Joint): number | null => {
    if (!lastDone) return null
    const v = sets.filter((s) => s.workoutId === lastDone.id).map((s) => s.pain[joint]).filter((x): x is number => x !== undefined)
    return v.length ? Math.max(...v) : null
  }

  const flare = flarePhase(settings.flare, today)
  const knee_ = kneeStatus({ check: checkDoneToday ? check : null, baseline: settings.baseline, lastSessionPain: lastPain('knee'), flareActive: flare?.phase === 'isometric' })
  const wrist_ = wristStatus({ check: checkDoneToday ? check : null, baseline: settings.baseline, lastSessionPain: lastPain('wrist') })

  // The 14-day wrist streak restarts at the last wrist stage change.
  const lastWristChange = wristStage.history[wristStage.history.length - 1]?.date ?? null
  const wDays = wristDays(checks, sessionPainByDay(sets, workouts, 'wrist')).filter((d) => !lastWristChange || d.date >= lastWristChange)
  const wGate = wristGate(wDays, today)

  const kGate = kneeStage3Gate({
    today,
    stage2Start: kneeStage.stage2Start,
    declineSquat: decline ?? null,
    legPress4x6Dates: legPress4x6Dates(sets, workouts),
    checks,
    baseline: settings.baseline,
  })

  const lastOf = (t: QuestionnaireType) => qs.filter((q) => q.type === t).pop()?.date ?? null
  const due = (['VISA-P', 'PRWE'] as const).filter((t) => questionnaireDue(lastOf(t), today, daysBetween))

  const snoozed = (k: keyof typeof settings.snooze) => settings.snooze[k] === today
  const recentChecks = checks.filter((c) => c.date > addDays(today, -2))
  return {
    today,
    check,
    checkDoneToday,
    knee: knee_,
    wrist: wrist_,
    kneeStage,
    wristStage,
    week: kneeStage.current === 'K2' && kneeStage.stage2Start ? stage2Week(kneeStage.stage2Start, today) : null,
    wristGate: wGate,
    kneeGate: kGate,
    flare,
    flareState: settings.flare,
    suggestFlare: !settings.flare && !snoozed('flare') && shouldSuggestFlare(recentChecks, settings.baseline),
    due,
    prompts: {
      wristUp: wGate.eligible && wristStage.current !== 'W3' && !snoozed('wrist'),
      wristDown: wGate.regress && wristStage.current !== 'W1' && !snoozed('wristRegress') && lastWristChange !== today,
      kneeUp: kGate.allMet && kneeStage.current === 'K2' && !snoozed('knee'),
    },
  }
}
