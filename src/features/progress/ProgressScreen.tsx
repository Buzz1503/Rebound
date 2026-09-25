import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import { MILESTONES } from '../../data/seed'
import type { KneeStageState, WristStageState } from '../../data/records'
import { db } from '../../db/db'
import { estimatedOneRepMax, formatKg } from '../../engine/load'
import { bestSet, milestoneProgress } from '../../engine/progress'
import { useToday } from '../../hooks/today'
import { ChartFrame, Legend, Lines, useTokens } from '../../ui/charts'
import { Bar } from '../../ui/controls'
import { marks } from '../exercise/history'
import { GLUTE_HAM, MUSCLE_LABEL, painSeries, rangeStart, stageMarkers, strengthSeries, weeklySetsByMuscle, type Range } from './data'

const RANGES: { id: Range; label: string }[] = [
  { id: '4w', label: '4 weeks' },
  { id: '12w', label: '12 weeks' },
  { id: 'all', label: 'All time' },
]

function useData() {
  return useLiveQuery(async () => {
    const [sets, workouts, checks, exercises, knee, wrist] = await Promise.all([
      db.sets.toArray(),
      db.workouts.toArray(),
      db.morningChecks.orderBy('date').toArray(),
      db.exercises.toArray(),
      db.stages.get('knee') as Promise<KneeStageState | undefined>,
      db.stages.get('wrist') as Promise<WristStageState | undefined>,
    ])
    return { sets, workouts, checks, exercises, knee, wrist }
  }, [])
}

export function ProgressScreen() {
  const today = useToday()
  const t = useTokens()
  const data = useData()
  const [range, setRange] = useState<Range>('12w')
  const [exerciseId, setExerciseId] = useState('leg-press')
  const from = rangeStart(range, today)
  const exMap = useMemo(() => new Map((data?.exercises ?? []).map((e) => [e.id, e])), [data?.exercises])

  if (!data) return null
  const { sets, workouts, checks } = data

  const weighted = data.exercises.filter((e) => e.progression === 'kneeHsr' || e.progression === 'double').filter((e) => sets.some((s) => s.exerciseId === e.id && s.weightKg))
  const choices = weighted.length ? weighted : data.exercises.filter((e) => e.id === 'leg-press')
  const ex = exMap.get(exerciseId)
  const strength = strengthSeries(sets, workouts, exerciseId, from)
  const pre = ex?.preInjuryBest ? estimatedOneRepMax(ex.preInjuryBest.weightKg, ex.preInjuryBest.reps) : null
  const pain = painSeries(checks, sets, workouts, from)
  const markers = stageMarkers(data.knee?.history ?? [], data.wrist?.history ?? [], from)
  const volume = weeklySetsByMuscle(sets, workouts, exMap, from, today)
  const maxVol = Math.max(1, ...volume.map((v) => v.perWeek))
  const doneIds = new Set(workouts.filter((w) => w.status === 'done').map((w) => w.id))
  const doneSets = sets.filter((s) => doneIds.has(s.workoutId))

  const painLines = [
    { key: 'knee', label: 'Knee', color: t['series-1'] },
    { key: 'wrist', label: 'Wrist', color: t['series-2'] },
    { key: 'shoulder', label: 'Shoulder', color: t['series-3'] },
  ]

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="pt-2 text-3xl font-semibold">Progress</h1>

      <div role="radiogroup" aria-label="Date range" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface p-1">
        {RANGES.map((r) => (
          <button
            key={r.id}
            role="radio"
            aria-checked={range === r.id}
            onClick={() => setRange(r.id)}
            className={`min-h-12 rounded-xl text-sm font-semibold ${range === r.id ? 'bg-surface-2 text-text' : 'text-muted'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <ChartFrame title="Estimated strength" note="best set, est. 1-rep max" empty={false}>
        <select
          aria-label="Exercise"
          value={exerciseId}
          onChange={(e) => setExerciseId(e.target.value)}
          className="mb-2 h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base"
        >
          {choices.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        {strength.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No {ex?.name.toLowerCase() ?? ''} sets in this range yet.</p>
        ) : (
          <Lines
            data={strength}
            series={[{ key: 'e1rm', label: 'Est. 1RM', color: t.accent }]}
            yUnit=" kg"
            yDomain={[0, 'auto']}
            refY={pre ? { value: pre, label: `Pre-injury ${ex?.preInjuryBest?.weightKg} kg × ${ex?.preInjuryBest?.reps}` } : null}
          />
        )}
        {pre && <p className="mt-1 text-xs text-muted">Dashed line: pre-injury best ({formatKg(pre)} est. 1RM).</p>}
      </ChartFrame>

      <ChartFrame title="Pain trends" note="daily max, 0 to 10" empty={pain.length === 0}>
        <Lines data={pain} series={painLines} yDomain={[0, 10]} yTicks={[0, 2, 4, 6, 8, 10]} refX={markers} />
        <Legend series={painLines} />
        {markers.length > 0 && <p className="mt-1 text-xs text-muted">Dotted lines mark stage changes.</p>}
      </ChartFrame>

      <section className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="mb-3 font-semibold">Glute and hamstring milestones</h2>
        <ul className="space-y-3">
          {MILESTONES.map((m) => {
            const own = marks(doneSets.filter((s) => s.exerciseId === m.exerciseId))
            const p = milestoneProgress(m, own)
            const best = bestSet(own)
            return (
              <li key={m.id} className={`rounded-2xl p-3 ${p.achieved ? 'bg-green-soft' : 'bg-surface-2'}`}>
                <div className="flex items-center gap-2">
                  <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${p.achieved ? 'bg-green text-bg' : 'border border-line text-muted'}`}>
                    {p.achieved ? '✓' : m.order}
                  </span>
                  <div className="flex-1">
                    <div className="text-[15px] font-medium">{m.label}</div>
                    <div className="text-xs text-muted">
                      {p.achieved ? 'Unlocked' : 'Locked'} · best {best ? `${formatKg(best.weightKg)} × ${best.reps}` : 'none yet'}
                    </div>
                  </div>
                  <span className="num text-sm font-semibold">{Math.round(p.progress * 100)}%</span>
                </div>
                <Bar label={m.label} value={p.progress} className={`mt-2 ${p.achieved ? 'bg-green' : 'bg-accent'}`} />
              </li>
            )
          })}
        </ul>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-semibold">Weekly volume</h2>
          <span className="text-xs text-muted">working sets per week</span>
        </div>
        {volume.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">Nothing logged in this range yet.</p>
        ) : (
          <ul className="space-y-2">
            {volume.map((v) => {
              const hl = GLUTE_HAM.includes(v.muscle)
              return (
                <li key={v.muscle} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-2" title={`${MUSCLE_LABEL[v.muscle]}: ${v.perWeek} sets/week`}>
                  <span className={`text-sm ${hl ? 'font-semibold' : 'text-muted'}`}>{MUSCLE_LABEL[v.muscle]}</span>
                  <span className="h-3 overflow-hidden rounded-r bg-surface-2">
                    <span className={`block h-full rounded-r ${hl ? 'bg-accent' : 'bg-muted/50'}`} style={{ width: `${(v.perWeek / maxVol) * 100}%` }} />
                  </span>
                  <span className="num text-right text-sm">{v.perWeek}</span>
                </li>
              )
            })}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">Glutes and hamstrings highlighted. Plan target: hip thrust 6, hamstring curl 10, kickback 3 per leg, abduction 3, adduction 3 sets a week.</p>
      </section>
    </div>
  )
}
