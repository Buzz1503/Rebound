import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import type { Workout } from '../../data/records'
import type { SessionId } from '../../data/types'
import { db } from '../../db/db'
import { activeWorkout, getSettings } from '../../db/repo'
import { dayPlan, type DayPlan } from '../../engine/schedule'
import { useToday } from '../../hooks/today'
import { Card, PrimaryButton } from '../../ui/controls'
import { useToast } from '../../ui/Toast'
import { abandonWorkout, entriesFor, finishWorkout, loadPlanContext, startWorkout } from './actions'
import { buildPlan } from './plan'
import { Player } from './Player'
import { Summary } from './Summary'
import { nextChanges, summarise, type NextChange, type SessionSummary } from './summary'

export async function lastGymSession(): Promise<SessionId | null> {
  const done = await db.workouts.where('status').equals('done').filter((w) => w.kind === 'gym' && w.source === 'app').toArray()
  return done.sort((a, b) => b.startedAt - a.startedAt)[0]?.sessionId ?? null
}

export async function todayPlan(today: string): Promise<DayPlan> {
  const s = await getSettings(db)
  return dayPlan(today, s.gymDays, await lastGymSession())
}

export function workoutTitle(w: Pick<Workout, 'kind' | 'sessionId'>): string {
  if (w.kind === 'gym' && w.sessionId) return `Session ${w.sessionId}`
  return w.kind === 'home' ? 'Home rehab' : 'Rest day: wrist block'
}

interface Done {
  title: string
  summary: SessionSummary
  changes: NextChange[]
}

export function WorkoutScreen() {
  const today = useToday()
  const toast = useToast()
  const active = useLiveQuery(() => activeWorkout(db), [])
  const plan = useLiveQuery(() => todayPlan(today), [today])
  const [done, setDone] = useState<Done | null>(null)
  const [choice, setChoice] = useState<SessionId | null>(null)

  if (done) return <Summary {...done} onDone={() => setDone(null)} />

  if (active) {
    return (
      <Player
        workout={active}
        title={workoutTitle(active)}
        onFinish={() => void finish(active)}
        onDiscard={() => {
          void abandonWorkout(db, active)
          toast({ message: 'Session discarded', undo: () => void db.workouts.put(active) })
        }}
      />
    )
  }

  async function finish(w: Workout) {
    const finished = await finishWorkout(db, w)
    const sets = await db.sets.where('workoutId').equals(w.id).toArray()
    const ctx = await loadPlanContext(db, today)
    const after = buildPlan(await entriesFor(db, w.kind, w.sessionId), ctx)
    const trained = new Set(sets.map((s) => s.slotKey))
    const exercises = ctx.exercises
    setDone({
      title: workoutTitle(w),
      summary: summarise(finished.exercises, sets),
      changes: nextChanges(
        w.exercises.map((e) => e.plan),
        after,
        exercises,
        trained,
      ),
    })
    toast({ message: 'Session saved', undo: () => void db.workouts.put({ ...finished, status: 'active', finishedAt: null }).then(() => setDone(null)) })
  }

  if (!plan) return null
  const session = choice ?? plan.session
  const kind = choice ? 'gym' : plan.kind
  const label = kind === 'gym' && session ? `Session ${session}` : kind === 'home' ? 'Home rehab' : 'Rest day: wrist block'

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      <h1 className="pt-2 text-2xl font-semibold">Workout</h1>
      <Card>
        <div className="text-xs tracking-wide text-muted uppercase">Today</div>
        <div className="text-2xl font-semibold">{label}</div>
      </Card>
      <Card>
        <div className="mb-2 text-sm text-muted">Train something else</div>
        <div className="grid grid-cols-3 gap-2">
          {(['A', 'B', 'C'] as const).map((id) => (
            <button
              key={id}
              onClick={() => setChoice(choice === id ? null : id)}
              className={`min-h-12 rounded-xl font-semibold ${session === id && kind === 'gym' ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
            >
              {id}
            </button>
          ))}
        </div>
      </Card>
      <div className="mt-auto">
        <PrimaryButton onClick={() => void startWorkout(db, today, kind, session)}>Start {label}</PrimaryButton>
      </div>
    </div>
  )
}
