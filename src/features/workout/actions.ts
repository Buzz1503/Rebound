import type { ISODate, KneeStageState, PlannedExercise, SetLog, Workout, WorkoutExerciseState, WristStageState } from '../../data/records'
import type { DayKind, SessionEntry, SessionId } from '../../data/types'
import type { ReboundDB } from '../../db/db'
import { getSettings, newId, updateSettings } from '../../db/repo'
import { compareToBaseline } from '../../engine/morning'
import { buildPlan, homeDayEntries, type PlanContext, type SlotRecord } from './plan'

export async function loadPlanContext(db: ReboundDB, today: ISODate): Promise<PlanContext> {
  const [exercises, knee, wrist, settings, latestCheck, workouts, sets] = await Promise.all([
    db.exercises.toArray(),
    db.stages.get('knee') as Promise<KneeStageState | undefined>,
    db.stages.get('wrist') as Promise<WristStageState | undefined>,
    getSettings(db),
    db.morningChecks.orderBy('date').last(),
    db.workouts.where('status').equals('done').toArray(),
    db.sets.toArray(),
  ])
  const done = new Map(workouts.map((w) => [w.id, w]))
  const bySlotWorkout = new Map<string, Map<string, SetLog[]>>()
  for (const s of sets) {
    if (!done.has(s.workoutId)) continue
    const m = bySlotWorkout.get(s.slotKey) ?? new Map<string, SetLog[]>()
    m.set(s.workoutId, [...(m.get(s.workoutId) ?? []), s])
    bySlotWorkout.set(s.slotKey, m)
  }
  const history = new Map<string, SlotRecord[]>()
  for (const [key, m] of bySlotWorkout) {
    const recs = [...m].map(([wid, ss]) => ({ workout: done.get(wid) as Workout, sets: ss }))
    history.set(key, recs.sort((a, b) => b.workout.startedAt - a.workout.startedAt))
  }
  return {
    today,
    exercises: new Map(exercises.map((e) => [e.id, e])),
    wristStage: wrist?.current ?? 'W1',
    stage2Start: knee?.stage2Start ?? null,
    kneeMorning: latestCheck && settings.baseline ? compareToBaseline(latestCheck, settings.baseline).knee : null,
    flare: settings.flare,
    history,
  }
}

function toState(plan: PlannedExercise, i: number): WorkoutExerciseState {
  return {
    key: `${i}:${plan.slotKey}`,
    exerciseId: plan.exerciseId,
    slotKey: plan.slotKey,
    plan,
    // Flare mode pauses knee lifts: they start skipped with the reason on the card.
    skipped: plan.suggestion?.status === 'paused',
    swappedTo: null,
    modification: null,
    loadPct: 0,
    note: '',
  }
}

export async function entriesFor(db: ReboundDB, kind: DayKind, sessionId: SessionId | null): Promise<SessionEntry[]> {
  if (kind === 'gym' && sessionId) return (await db.sessions.get(sessionId))?.entries ?? []
  if (kind === 'home') return homeDayEntries
  return [{ block: 'wristBlock', section: 'wristBlock', optional: false }]
}

/** Start a workout: freeze today's plan into the record so it can be resumed exactly. */
export async function startWorkout(db: ReboundDB, today: ISODate, kind: DayKind, sessionId: SessionId | null): Promise<Workout> {
  const ctx = await loadPlanContext(db, today)
  const knee = (await db.stages.get('knee')) as KneeStageState | undefined
  const entries = await entriesFor(db, kind, sessionId)
  const hasKneeLifts = entries.some((e) => 'exerciseId' in e && e.prescription.kind === 'kneeStage')
  // Approved default: Stage 2 week 1 starts with the first logged knee session.
  if (knee && knee.current === 'K2' && !knee.stage2Start && hasKneeLifts) {
    await db.stages.put({ ...knee, stage2Start: today })
    ctx.stage2Start = today
  }
  const plan = buildPlan(entries, ctx)
  const workout: Workout = {
    id: newId(),
    date: today,
    kind,
    sessionId: kind === 'gym' ? sessionId : null,
    status: 'active',
    startedAt: Date.now(),
    finishedAt: null,
    exercises: plan.map(toState),
    cursor: 0,
    source: 'app',
  }
  await db.workouts.put(workout)
  return workout
}

export async function saveWorkout(db: ReboundDB, w: Workout): Promise<void> {
  await db.workouts.put(w)
}

export async function finishWorkout(db: ReboundDB, w: Workout): Promise<Workout> {
  const done: Workout = { ...w, status: 'done', finishedAt: Date.now() }
  await db.workouts.put(done)
  // A knee-lift session during the flare restart phase ends flare mode.
  const settings = await getSettings(db)
  const loggedKnee = await db.sets.where('workoutId').equals(w.id).filter((s) => s.slotKey.endsWith(':knee')).count()
  if (settings.flare && !settings.flare.endedAt && loggedKnee > 0) {
    await updateSettings(db, { flare: { ...settings.flare, endedAt: w.date } })
  }
  return done
}

export async function abandonWorkout(db: ReboundDB, w: Workout): Promise<void> {
  await db.workouts.put({ ...w, status: 'abandoned', finishedAt: Date.now() })
}
