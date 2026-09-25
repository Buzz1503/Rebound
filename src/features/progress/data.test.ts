import { describe, expect, it } from 'vitest'
import type { SetLog, Workout } from '../../data/records'
import { EXERCISES } from '../../data/seed'
import { painSeries, rangeStart, stageMarkers, strengthSeries, weeklySetsByMuscle } from './data'

const w = (id: string, date: string, status: Workout['status'] = 'done'): Workout => ({
  id, date, kind: 'gym', sessionId: 'A', status, startedAt: 0, finishedAt: 0, exercises: [], cursor: 0, source: 'app',
})
const s = (workoutId: string, exerciseId: string, weightKg: number | null, reps: number, pain: SetLog['pain'] = {}, side: SetLog['side'] = null): SetLog => ({
  id: Math.random().toString(), workoutId, entryKey: 'e', exerciseId, slotKey: 'k', setIndex: 0, side, weightKg, reps, holdSec: null, rir: 2, pain, loggedAt: 0,
})
const exercises = new Map(EXERCISES.map((e) => [e.id, e]))

describe('progress data', () => {
  it('ranges', () => {
    expect(rangeStart('4w', '2026-10-28')).toBe('2026-10-01')
    expect(rangeStart('all', '2026-10-28')).toBeNull()
  })

  it('strength: best e1RM per session, finished workouts only, within range', () => {
    const workouts = [w('a', '2026-10-01'), w('b', '2026-10-03'), w('c', '2026-10-05', 'abandoned')]
    const sets = [s('a', 'leg-press', 60, 15), s('a', 'leg-press', 65, 12), s('b', 'leg-press', 70, 12), s('c', 'leg-press', 200, 10), s('b', 'hip-thrust', 50, 10)]
    expect(strengthSeries(sets, workouts, 'leg-press', null)).toEqual([
      { date: '2026-10-01', e1rm: 91 },
      { date: '2026-10-03', e1rm: 98 },
    ])
    expect(strengthSeries(sets, workouts, 'leg-press', '2026-10-02')).toHaveLength(1)
  })

  it('pain: worse knee from the morning, max with session pain', () => {
    const rows = painSeries(
      [{ date: '2026-10-01', kneeLeft: 2, kneeRight: 4, wristPain: 1, wristSwelling: false, createdAt: 0 }],
      [s('a', 'chest-press', 40, 10, { shoulder: 2, wrist: 3 })],
      [w('a', '2026-10-01')],
      null,
    )
    expect(rows).toEqual([{ date: '2026-10-01', knee: 4, wrist: 3, shoulder: 2 }])
  })

  it('stage markers', () => {
    expect(stageMarkers([{ date: '2026-10-01', from: 'K2', to: 'K3', reason: '', manual: false }], [], null)).toEqual([{ date: '2026-10-01', label: 'K3' }])
  })

  it('weekly sets per muscle count a left/right pair once and skip rehab drills', () => {
    const sets = [
      s('a', 'hip-thrust', 50, 10), s('a', 'hip-thrust', 50, 10),
      s('a', 'cable-glute-kickback', 5, 12, {}, 'left'), s('a', 'cable-glute-kickback', 5, 12, {}, 'right'),
      s('a', 'w1-grip-putty', null, 10),
    ]
    const out = weeklySetsByMuscle(sets, [w('a', '2026-10-22')], exercises, '2026-10-15', '2026-10-28')
    expect(out).toEqual([{ muscle: 'glutes', perWeek: 1.5 }])
  })
})
