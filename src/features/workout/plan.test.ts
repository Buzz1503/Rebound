import { describe, expect, it } from 'vitest'
import type { SetLog, Workout, WorkoutExerciseState } from '../../data/records'
import { EXERCISES, SESSIONS } from '../../data/seed'
import { buildPlan, expandEntries, type PlanContext } from './plan'
import { effectiveWeight, entryStatus, nextOpenIndex, nextSlot, setSlots } from './sets'
import { nextChanges, summarise } from './summary'

const ctx = (over: Partial<PlanContext> = {}): PlanContext => ({
  today: '2026-09-28',
  exercises: new Map(EXERCISES.map((e) => [e.id, e])),
  wristStage: 'W1',
  stage2Start: '2026-09-28',
  kneeMorning: 'same',
  flare: null,
  history: new Map(),
  ...over,
})

const sessionA = SESSIONS[0]!.entries

describe('buildPlan', () => {
  it('expands Session A in section order with the W1 wrist block and optional shoulder care', () => {
    const plan = buildPlan(sessionA, ctx())
    expect(plan.map((p) => p.exerciseId)).toEqual([
      'bike', 'spanish-squat',
      'w1-palm-down-iso', 'w1-palm-up-iso', 'w1-pinky-side-iso', 'w1-grip-putty', 'w1-dart-throw',
      'leg-extension', 'leg-press', 'hip-thrust', 'lying-hamstring-curl', 'leg-press-calf-raise',
      'chest-press', 'cable-tricep-pushdown', 'dead-bug',
      'sc-iso-er', 'sc-cable-er', 'sc-blade-squeeze',
    ])
    expect(plan.filter((p) => p.optional).map((p) => p.section)).toEqual(['shoulderCare', 'shoulderCare', 'shoulderCare'])
  })

  it('swaps in the W2 block at wrist stage W2', () => {
    const ids = expandEntries(sessionA, 'W2').map((x) => x.item.exerciseId)
    expect(ids).toContain('w2-band-turns')
    expect(ids).not.toContain('w1-palm-down-iso')
  })

  it('knee lifts take sets/reps from the Stage 2 week', () => {
    const week3 = buildPlan(sessionA, ctx({ today: '2026-10-12' })).find((p) => p.exerciseId === 'leg-press')!
    expect(week3).toMatchObject({ sets: 3, reps: { min: 12, max: 12 }, tempo: '3-0-3', restSec: 120, weightKg: 60 })
  })

  it('starting weights and day-1 prompts come through', () => {
    const plan = buildPlan(sessionA, ctx())
    expect(plan.find((p) => p.exerciseId === 'hip-thrust')?.weightKg).toBe(50)
    const cp = plan.find((p) => p.exerciseId === 'chest-press')!
    expect(cp.weightKg).toBeNull()
    expect(cp.suggestion?.status).toBe('needsWeight')
  })

  it('flare mode pauses knee lifts', () => {
    const plan = buildPlan(sessionA, ctx({ flare: { startedAt: '2026-09-27', preFlareWeights: {}, endedAt: null } }))
    expect(plan.find((p) => p.exerciseId === 'leg-extension')?.suggestion?.status).toBe('paused')
  })

  it('progresses from history', () => {
    const w: Workout = {
      id: 'w1', date: '2026-09-28', kind: 'gym', sessionId: 'A', status: 'done', startedAt: 1, finishedAt: 2, cursor: 0, source: 'app',
      exercises: buildPlan(sessionA, ctx()).map((plan, i) => state(plan, i)),
    }
    const sets = [0, 1, 2].map((i) => logged(i, { exerciseId: 'leg-press', slotKey: 'leg-press:knee', weightKg: 60, reps: 15, rir: i === 2 ? 2 : 3, pain: { knee: 1 } }))
    const plan = buildPlan(sessionA, ctx({ today: '2026-09-30', history: new Map([['leg-press:knee', [{ workout: w, sets }]]]) }))
    const lp = plan.find((p) => p.exerciseId === 'leg-press')!
    expect(lp.weightKg).toBe(65)
    expect(lp.suggestion?.reason).toContain('Up 5 kg')
  })

  it('unilateral kickbacks are judged on the weaker side', () => {
    const b = SESSIONS[1]!.entries
    const w: Workout = {
      id: 'w1', date: '2026-09-28', kind: 'gym', sessionId: 'B', status: 'done', startedAt: 1, finishedAt: 2, cursor: 0, source: 'app',
      exercises: buildPlan(b, ctx()).map((plan, i) => state(plan, i)),
    }
    const key = 'cable-glute-kickback:12-15'
    const mk = (i: number, side: 'left' | 'right', reps: number) => logged(i, { exerciseId: 'cable-glute-kickback', slotKey: key, weightKg: 5, reps, rir: 2, side })
    const allTop = [0, 1, 2].flatMap((i) => [mk(i, 'left', 15), mk(i, 'right', 15)])
    const upPlan = buildPlan(b, ctx({ history: new Map([[key, [{ workout: w, sets: allTop }]]]) }))
    expect(upPlan.find((p) => p.exerciseId === 'cable-glute-kickback')?.weightKg).toBe(7.5)
    const weakRight = [0, 1, 2].flatMap((i) => [mk(i, 'left', 15), mk(i, 'right', 13)])
    const holdPlan = buildPlan(b, ctx({ history: new Map([[key, [{ workout: w, sets: weakRight }]]]) }))
    expect(holdPlan.find((p) => p.exerciseId === 'cable-glute-kickback')?.weightKg).toBe(5)
  })
})

function state(plan: ReturnType<typeof buildPlan>[number], i: number): WorkoutExerciseState {
  return { key: `${i}`, exerciseId: plan.exerciseId, slotKey: plan.slotKey, plan, skipped: false, swappedTo: null, modification: null, loadPct: 0, note: '' }
}

function logged(setIndex: number, over: Partial<SetLog>): SetLog {
  return { id: `${setIndex}-${over.side ?? ''}`, workoutId: 'w1', entryKey: 'e', exerciseId: 'x', slotKey: 'x', setIndex, side: null, weightKg: null, reps: null, holdSec: null, rir: null, pain: {}, loggedAt: 0, ...over }
}

describe('set flow', () => {
  const plan = buildPlan(SESSIONS[1]!.entries, ctx())
  const kick = state(plan.find((p) => p.exerciseId === 'cable-glute-kickback')!, 0)

  it('unilateral sets go left then right', () => {
    expect(setSlots(2, true)).toEqual([
      { setIndex: 0, side: 'left' }, { setIndex: 0, side: 'right' },
      { setIndex: 1, side: 'left' }, { setIndex: 1, side: 'right' },
    ])
    expect(nextSlot(kick, [logged(0, { side: 'left' })])).toEqual({ setIndex: 0, side: 'right' })
  })

  it('tracks status and the next open exercise', () => {
    const a = state(plan[0]!, 0)
    const b = state(plan[1]!, 1)
    expect(entryStatus(a, [])).toBe('todo')
    expect(entryStatus(a, [logged(0, {})])).toBe('done')
    expect(entryStatus({ ...b, skipped: true }, [])).toBe('skipped')
    expect(nextOpenIndex([a, b], new Map([['0', [logged(0, {})]]]), 0)).toBe(1)
  })

  it('applies a swap load change rounded to the machine', () => {
    const curl = { ...state(plan.find((p) => p.exerciseId === 'cable-hammer-curl')!, 0), loadPct: -30 }
    curl.plan = { ...curl.plan, weightKg: 20 }
    expect(effectiveWeight(curl, EXERCISES.find((e) => e.id === 'cable-hammer-curl'))).toBe(15)
  })
})

describe('summary', () => {
  it('adds volume, counts sets and takes max pain', () => {
    const plan = buildPlan(sessionA, ctx())
    const s = summarise(plan.map((p) => ({ plan: p, skipped: false })), [
      logged(0, { weightKg: 60, reps: 15, pain: { knee: 2 } }),
      logged(1, { weightKg: 60, reps: 15, pain: { knee: 1, wrist: 3 } }),
    ])
    expect(s).toMatchObject({ volumeKg: 1800, setsDone: 2, maxPain: { knee: 2, wrist: 3 } })
  })

  it('describes next-session changes', () => {
    const before = buildPlan(sessionA, ctx())
    const after = before.map((p) =>
      p.exerciseId === 'leg-press' && p.suggestion ? { ...p, suggestion: { ...p.suggestion, weightKg: 65 } } : p,
    )
    const changes = nextChanges(before, after, ctx().exercises, new Set(['leg-press:knee']))
    expect(changes).toEqual([{ exerciseId: 'leg-press', text: 'Leg press +5 kg next time', light: 'green' }])
  })
})
