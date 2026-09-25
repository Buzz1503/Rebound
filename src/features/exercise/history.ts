import type { SetLog, Workout } from '../../data/records'
import type { PerformanceMark } from '../../data/types'
import type { ReboundDB } from '../../db/db'

export interface ExerciseSession {
  workout: Workout
  sets: SetLog[]
}

/** Last finished sessions of one exercise (any slot), most recent first. */
export async function exerciseHistory(db: ReboundDB, exerciseId: string, limit = 5): Promise<ExerciseSession[]> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).toArray()
  const ids = [...new Set(sets.map((s) => s.workoutId))]
  const workouts = (await db.workouts.bulkGet(ids)).filter((w): w is Workout => !!w && w.status === 'done')
  return workouts
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map((workout) => ({
      workout,
      sets: sets.filter((s) => s.workoutId === workout.id).sort((a, b) => a.setIndex - b.setIndex || (a.side ?? '').localeCompare(b.side ?? '')),
    }))
}

export function marks(sets: SetLog[]): PerformanceMark[] {
  return sets.filter((s) => s.weightKg !== null && s.reps !== null).map((s) => ({ weightKg: s.weightKg as number, reps: s.reps as number }))
}
