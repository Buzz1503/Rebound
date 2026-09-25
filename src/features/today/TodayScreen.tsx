import { useLiveQuery } from 'dexie-react-hooks'
import { useNav } from '../../app/nav'
import { PROGRESSION } from '../../data/seed'
import { db } from '../../db/db'
import { activeWorkout } from '../../db/repo'
import { fromISODate } from '../../engine/dates'
import { stage2Label } from '../../engine/knee'
import type { JointStatus } from '../../engine/morning'
import { useToday } from '../../hooks/today'
import { Bar, Card, PrimaryButton } from '../../ui/controls'
import { lightBg, lightBorder, lightSoft, lightText, lightWord } from '../../ui/light'
import { kneeStageName, wristStageName } from '../rehab/names'
import { StagePrompts } from '../rehab/Prompts'
import { loadStatus } from '../status/status'
import { todayPlan, workoutTitle } from '../workout/WorkoutScreen'
import { startWorkout } from '../workout/actions'

function JointCard({ name, status }: { name: string; status: JointStatus }) {
  return (
    <div className={`rounded-3xl border p-4 ${lightBorder[status.light]} ${lightSoft[status.light]}`}>
      <div className="flex items-center gap-2">
        <span className={`h-3 w-3 rounded-full ${lightBg[status.light]}`} />
        <span className="font-semibold">{name}</span>
        <span className={`ml-auto text-sm font-semibold ${lightText[status.light]}`}>{lightWord[status.light]}</span>
      </div>
      <p className="mt-2 text-[15px] leading-snug">{status.message}</p>
    </div>
  )
}

export function TodayScreen() {
  const today = useToday()
  const nav = useNav()
  const status = useLiveQuery(() => loadStatus(db, today), [today])
  const plan = useLiveQuery(() => todayPlan(today), [today])
  const active = useLiveQuery(() => activeWorkout(db), [])
  const doneToday = useLiveQuery(() => db.workouts.where('date').equals(today).filter((w) => w.status === 'done').first(), [today])

  if (!status || !plan) return null
  const { kneeStage, wristStage, week, wristGate, kneeGate, flare } = status
  const dateLabel = fromISODate(today).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
  const planLabel = plan.kind === 'gym' ? `Session ${plan.session}` : plan.kind === 'home' ? 'Home rehab day' : 'Rest day'
  const planSub = plan.kind === 'gym' ? '' : plan.kind === 'home' ? 'Knee holds, wrist block, glute bridge, flat walk' : 'Wrist block only'
  const nextWrist = wristStage.current === 'W1' ? 'W2' : wristStage.current === 'W2' ? 'W3' : null
  const weeksCrit = kneeGate.criteria[0]

  const start = async () => {
    if (!active) await startWorkout(db, today, plan.kind, plan.session)
    nav.go('workout')
  }

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      <header className="pt-2">
        <div className="text-sm text-muted">{dateLabel}</div>
        <h1 className="text-3xl font-semibold">{planLabel}</h1>
        {planSub && <div className="text-muted">{planSub}</div>}
      </header>

      {!status.checkDoneToday && (
        <button onClick={() => nav.open({ kind: 'morning' })} className="rounded-3xl border border-accent/50 bg-surface p-4 text-left active:bg-surface-2">
          <div className="font-semibold text-accent">Morning check first</div>
          <div className="mt-1 text-sm text-muted">30 seconds: 5 single-leg squats to a chair and a wrist score. It sets today's weights.</div>
        </button>
      )}

      <StagePrompts status={status} />

      {flare?.phase === 'isometric' && (
        <div className="rounded-3xl border border-red/50 bg-red-soft p-4">
          <div className="font-semibold text-red">
            Flare mode: day {flare.day} of {PROGRESSION.knee.flare.isometricOnlyDays}
          </div>
          <p className="mt-1 text-sm">Knee isometrics only. Knee lifts restart 20% lighter in {flare.daysLeft} day{flare.daysLeft === 1 ? '' : 's'}.</p>
        </div>
      )}
      {flare?.phase === 'restart' && (
        <div className="rounded-3xl border border-amber/50 bg-amber-soft p-4 text-sm">
          <span className="font-semibold text-amber">Flare restart:</span> next knee session starts 20% under your pre-flare weights.
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        <JointCard name="Knee" status={status.knee} />
        <JointCard name="Wrist" status={status.wrist} />
      </div>

      <Card>
        <div className="space-y-4">
          <div>
            <div className="text-xs tracking-wide text-muted uppercase">Knee</div>
            <div className="font-semibold">{kneeStageName(kneeStage.current)}</div>
            {week !== null && <div className="num text-[15px]">{stage2Label(week)}</div>}
            {kneeStage.current === 'K2' && week === null && <div className="text-sm text-muted">Week 1 starts with your first knee session.</div>}
            {kneeStage.current === 'K2' && weeksCrit && (
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-sm text-muted">
                  <span>Stage 3 unlock</span>
                  <span className="num">{kneeGate.criteria.filter((c) => c.met).length} of 3 criteria</span>
                </div>
                <Bar label="Knee Stage 3 unlock" value={kneeGate.criteria.reduce((a, c) => a + c.progress, 0) / 3} className="bg-green" />
                <div className="mt-1 text-xs text-muted">{kneeGate.criteria.map((c) => c.detail).join(' · ')}</div>
              </div>
            )}
          </div>
          <div>
            <div className="text-xs tracking-wide text-muted uppercase">Wrist</div>
            <div className="font-semibold">{wristStageName(wristStage.current)}</div>
            {nextWrist && (
              <div className="mt-2">
                <div className="mb-1 flex justify-between text-sm text-muted">
                  <span>Wrist {nextWrist} unlock</span>
                  <span className="num">
                    day {Math.min(wristGate.streak, wristGate.target)} of {wristGate.target} pain-free
                  </span>
                </div>
                <Bar label={`Wrist ${nextWrist} unlock`} value={wristGate.streak / wristGate.target} className="bg-green" />
              </div>
            )}
          </div>
        </div>
      </Card>

      {status.due.map((t) => (
        <button key={t} onClick={() => nav.open({ kind: 'questionnaire', type: t })} className="rounded-3xl border border-line bg-surface p-4 text-left active:bg-surface-2">
          <div className="font-semibold">{t === 'VISA-P' ? 'VISA-P knee score due' : 'PRWE wrist score due'}</div>
          <div className="text-sm text-muted">Weekly, about 2 minutes.</div>
        </button>
      ))}

      <div className="sticky bottom-0 mt-auto bg-bg pt-2 pb-1">
        {active ? (
          <PrimaryButton onClick={() => nav.go('workout')}>Resume {workoutTitle(active)}</PrimaryButton>
        ) : doneToday ? (
          <PrimaryButton onClick={() => nav.go('workout')} className="bg-surface-2 text-text">
            {workoutTitle(doneToday)} done. Train again?
          </PrimaryButton>
        ) : (
          <PrimaryButton onClick={() => void start()}>Start {plan.kind === 'gym' ? `Session ${plan.session}` : plan.kind === 'home' ? 'home rehab' : 'wrist block'}</PrimaryButton>
        )}
      </div>
    </div>
  )
}
