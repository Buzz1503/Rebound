import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNav } from '../../app/nav'
import type { StageChange } from '../../data/records'
import { HOME_DAY, KNEE_STAGES, PROGRESSION, RULES, WRIST_STAGES } from '../../data/seed'
import type { KneeStageId, WristStageId } from '../../data/types'
import { db } from '../../db/db'
import { activeWorkout } from '../../db/repo'
import { adjustByPct } from '../../engine/load'
import { stage2Label } from '../../engine/knee'
import { QUESTIONNAIRES } from '../../engine/questionnaires'
import { useToday } from '../../hooks/today'
import { ChartFrame, Lines, useTokens } from '../../ui/charts'
import { Bar, Card, Chips, painOptions, PrimaryButton } from '../../ui/controls'
import { Sheet } from '../../ui/Sheet'
import { useToast } from '../../ui/Toast'
import { loadStatus, type Status } from '../status/status'
import { startWorkout } from '../workout/actions'
import { endFlare, KNEE_ORDER, restoreStage, setKneeStage, setWristStage, startFlare, WRIST_ORDER } from './actions'
import { StagePrompts } from './Prompts'

interface Step {
  id: string
  label: string
  name: string
}

function Steps({ steps, current, completeBefore }: { steps: Step[]; current: string; completeBefore: boolean }) {
  const ci = steps.findIndex((s) => s.id === current)
  return (
    <ol className="flex items-start gap-1" aria-label="Stages">
      {steps.map((s, i) => {
        const state = i < ci && completeBefore ? 'done' : i === ci ? 'current' : i < ci ? 'done' : 'locked'
        return (
          <li key={s.id} className="flex flex-1 flex-col items-center gap-1 text-center" aria-current={state === 'current' ? 'step' : undefined}>
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${i === 0 ? 'opacity-0' : i <= ci ? 'bg-green' : 'bg-line'}`} />
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                  state === 'done' ? 'bg-green text-bg' : state === 'current' ? 'border-2 border-accent text-accent' : 'border border-line text-muted'
                }`}
              >
                {state === 'done' ? '✓' : s.label}
              </span>
              <span className={`h-0.5 flex-1 ${i === steps.length - 1 ? 'opacity-0' : i < ci ? 'bg-green' : 'bg-line'}`} />
            </div>
            <span className={`text-xs leading-tight ${state === 'current' ? 'font-semibold' : 'text-muted'}`}>{s.name}</span>
          </li>
        )
      })}
    </ol>
  )
}

function History({ items }: { items: StageChange[] }) {
  if (!items.length) return null
  return (
    <details className="mt-3">
      <summary className="min-h-12 cursor-pointer py-3 text-sm text-muted">Stage history ({items.length})</summary>
      <ul className="space-y-1 text-sm">
        {[...items].reverse().map((h, i) => (
          <li key={i} className="flex gap-2">
            <span className="num text-muted">{h.date}</span>
            <span>
              {h.from} → {h.to}: {h.reason}
              {h.manual ? ' (manual)' : ''}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}

type OverrideTarget = { joint: 'knee'; options: KneeStageId[]; current: KneeStageId } | { joint: 'wrist'; options: WristStageId[]; current: WristStageId }

function OverrideSheet({ target, onClose }: { target: OverrideTarget | null; onClose: () => void }) {
  const today = useToday()
  const toast = useToast()
  const [to, setTo] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const close = () => {
    setTo(null)
    setReason('')
    onClose()
  }
  const save = async () => {
    if (!target || !to || !reason.trim()) return
    const prev =
      target.joint === 'knee'
        ? await setKneeStage(db, to as KneeStageId, today, reason.trim(), true)
        : await setWristStage(db, to as WristStageId, today, reason.trim(), true)
    toast({ message: `${target.joint === 'knee' ? 'Knee' : 'Wrist'} now ${to}`, undo: () => void restoreStage(db, prev) })
    close()
  }
  return (
    <Sheet open={target !== null} onClose={close} label="Change stage">
      {target && (
        <div className="space-y-3">
          <h2 className="text-xl font-semibold">Move {target.joint} stage</h2>
          <div className="grid grid-cols-4 gap-2">
            {target.options.map((o) => (
              <button
                key={o}
                disabled={o === target.current}
                onClick={() => setTo(o)}
                className={`min-h-12 rounded-xl font-semibold disabled:opacity-30 ${to === o ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
              >
                {o}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-sm text-muted">Reason (required)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Physio cleared me on 3 Oct"
              className="mt-1 h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-base"
            />
          </label>
          <PrimaryButton disabled={!to || !reason.trim()} onClick={() => void save()}>
            Save stage change
          </PrimaryButton>
        </div>
      )}
    </Sheet>
  )
}

function DeclineSquatTest() {
  const today = useToday()
  const toast = useToast()
  const [pain, setPain] = useState<number | null>(null)
  const last = useLiveQuery(() => db.declineSquatTests.orderBy('date').last(), [])
  return (
    <div className="mt-3 rounded-2xl border border-line p-3">
      <div className="text-sm font-semibold">Single-leg decline squat test</div>
      <p className="mb-2 text-xs text-muted">
        Pain 0 to 10. Needs 2/10 or less for Stage 3.{last ? ` Last: ${last.pain}/10 on ${last.date}.` : ''}
      </p>
      <Chips label="Decline squat pain" cols={6} options={painOptions(2)} value={pain} onChange={setPain} />
      <button
        disabled={pain === null}
        onClick={() => {
          if (pain === null) return
          const prev = last?.date === today ? last : undefined
          void db.declineSquatTests.put({ date: today, pain }).then(() =>
            toast({ message: `Decline squat ${pain}/10 saved`, undo: () => void (prev ? db.declineSquatTests.put(prev) : db.declineSquatTests.delete(today)) }),
          )
          setPain(null)
        }}
        className="mt-2 min-h-12 w-full rounded-xl bg-surface-2 font-semibold disabled:opacity-40"
      >
        Save test
      </button>
    </div>
  )
}

function Flare({ status }: { status: Status }) {
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const f = status.flare
  const days = PROGRESSION.knee.flare.isometricOnlyDays
  const pre = status.flareState?.preFlareWeights ?? {}
  return (
    <Card className={f ? 'border-red/50' : ''}>
      <h2 className="font-semibold">Flare mode</h2>
      {!f ? (
        <>
          <p className="mt-1 text-sm text-muted">
            One tap: knee work drops to isometrics only for {days} days, then knee lifts restart 20% lighter.
          </p>
          <button onClick={() => setConfirm(true)} className="mt-3 min-h-14 w-full rounded-2xl bg-red-soft font-semibold text-red">
            Start flare mode
          </button>
        </>
      ) : (
        <>
          {f.phase === 'isometric' ? (
            <>
              <div className="num mt-2 text-4xl font-semibold text-red">
                {f.daysLeft} day{f.daysLeft === 1 ? '' : 's'}
              </div>
              <p className="text-sm">left of isometrics only (day {f.day} of {days}).</p>
              <Bar label="Flare progress" value={(f.day - 1) / days} className="mt-2 bg-red" />
            </>
          ) : (
            <p className="mt-2 text-sm">Isometric days done. Your next knee session restarts the lifts.</p>
          )}
          <div className="mt-3 text-sm">
            <div className="font-semibold">Restart plan</div>
            <ul className="mt-1 space-y-0.5 text-muted">
              <li>Knee lifts at 20% under pre-flare weights, 3 sets.</li>
              {Object.entries(pre).map(([id, w]) => (
                <li key={id}>
                  {id === 'leg-press' ? 'Leg press' : 'Leg extension'}: {w} kg → {adjustByPct(w, PROGRESSION.knee.flare.restartLoadPct, id === 'leg-press' ? 5 : 2.5)} kg
                </li>
              ))}
              <li>Then the normal Stage 2 rules take over.</li>
            </ul>
          </div>
          <button
            onClick={() => {
              const prev = status.flareState
              void endFlare(db, status.today).then(() => toast({ message: 'Flare mode ended', undo: () => void db.settings.get('settings').then((s) => s && db.settings.put({ ...s, flare: prev })) }))
            }}
            className="mt-3 min-h-12 w-full rounded-xl bg-surface-2 font-semibold"
          >
            End flare mode
          </button>
        </>
      )}
      <Sheet open={confirm} onClose={() => setConfirm(false)} label="Start flare mode">
        <h2 className="text-xl font-semibold">Start flare mode?</h2>
        <p className="mt-1 text-muted">Knee isometrics only for {days} days. Wrist, glute and upper body work carry on.</p>
        <button
          onClick={() => {
            setConfirm(false)
            void startFlare(db, status.today).then(() =>
              toast({ message: 'Flare mode on', undo: () => void db.settings.get('settings').then((s) => s && db.settings.put({ ...s, flare: null })) }),
            )
          }}
          className="mt-4 min-h-14 w-full rounded-2xl bg-red font-semibold text-bg"
        >
          Start flare mode
        </button>
      </Sheet>
    </Card>
  )
}

function Scores() {
  const nav = useNav()
  const t = useTokens()
  const qs = useLiveQuery(() => db.questionnaires.orderBy('date').toArray(), []) ?? []
  return (
    <>
      {(['VISA-P', 'PRWE'] as const).map((type) => {
        const def = QUESTIONNAIRES[type]
        const rows = qs.filter((q) => q.type === type).map((q) => ({ date: q.date, score: q.score }))
        const last = rows[rows.length - 1]
        return (
          <ChartFrame key={type} title={def.title} note={def.higherIsBetter ? 'higher is better' : 'lower is better'} empty={false}>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="num text-3xl font-semibold">{last ? last.score : '—'}</span>
              <span className="text-sm text-muted">{last ? `/100 on ${last.date}` : 'No score yet'}</span>
            </div>
            {rows.length > 1 && <Lines data={rows} series={[{ key: 'score', label: type, color: t['series-1'] }]} yDomain={[0, 100]} yTicks={[0, 25, 50, 75, 100]} height={160} />}
            <button onClick={() => nav.open({ kind: 'questionnaire', type })} className="mt-2 min-h-12 w-full rounded-xl bg-surface-2 font-semibold">
              {last ? 'Do this week’s score' : 'Do first score'}
            </button>
          </ChartFrame>
        )
      })}
    </>
  )
}

export function RehabScreen() {
  const today = useToday()
  const nav = useNav()
  const status = useLiveQuery(() => loadStatus(db, today), [today])
  const active = useLiveQuery(() => activeWorkout(db), [])
  const [override, setOverride] = useState<OverrideTarget | null>(null)
  if (!status) return null
  const { kneeStage, wristStage, kneeGate, wristGate, week } = status
  const kneeDef = KNEE_STAGES.find((k) => k.id === kneeStage.current)
  const wristDef = WRIST_STAGES.find((w) => w.id === wristStage.current)
  const nextKnee = KNEE_STAGES[KNEE_ORDER.indexOf(kneeStage.current) + 1]
  const nextWrist = WRIST_STAGES[WRIST_ORDER.indexOf(wristStage.current) + 1]

  return (
    <div className="flex flex-col gap-3 p-4">
      <h1 className="pt-2 text-3xl font-semibold">Rehab</h1>
      <StagePrompts status={status} />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Knee: patellar tendon</h2>
          <button onClick={() => setOverride({ joint: 'knee', options: KNEE_ORDER, current: kneeStage.current })} className="min-h-12 px-2 text-sm text-accent">
            Change
          </button>
        </div>
        <Steps steps={KNEE_STAGES.map((k) => ({ id: k.id, label: String(k.number), name: k.name }))} current={kneeStage.current} completeBefore />
        <div className="mt-4 text-[15px]">
          <div className="font-semibold">
            Stage {kneeDef?.number}: {kneeDef?.name}
          </div>
          <div className="text-muted">{week !== null ? stage2Label(week) : kneeDef?.summary}</div>
          {kneeDef?.notes.map((n) => (
            <p key={n} className="mt-1 text-sm text-muted">
              {n}
            </p>
          ))}
        </div>
        {kneeStage.current === 'K2' && nextKnee && (
          <div className="mt-4">
            <div className="text-sm font-semibold">Unlocks Stage 3 when:</div>
            <ul className="mt-2 space-y-3">
              {kneeGate.criteria.map((c) => (
                <li key={c.label}>
                  <div className="mb-1 flex justify-between gap-2 text-sm">
                    <span className={c.met ? 'text-green' : ''}>
                      {c.met ? '✓ ' : ''}
                      {c.label}
                    </span>
                    <span className="num shrink-0 text-muted">{c.detail}</span>
                  </div>
                  <Bar label={c.label} value={c.progress} className={c.met ? 'bg-green' : 'bg-accent'} />
                </li>
              ))}
            </ul>
            <DeclineSquatTest />
            <p className="mt-2 text-xs text-muted">{nextKnee.notes.join(' ')}</p>
          </div>
        )}
        <History items={kneeStage.history} />
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Right wrist: TFCC</h2>
          <button onClick={() => setOverride({ joint: 'wrist', options: WRIST_ORDER, current: wristStage.current })} className="min-h-12 px-2 text-sm text-accent">
            Change
          </button>
        </div>
        <Steps steps={WRIST_STAGES.map((w) => ({ id: w.id, label: w.id, name: w.name }))} current={wristStage.current} completeBefore />
        <div className="mt-4 text-[15px]">
          <div className="font-semibold">
            {wristDef?.id}: {wristDef?.name}
          </div>
          <div className="text-muted">{wristDef?.summary}</div>
        </div>
        {nextWrist && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-sm">
              <span>Unlocks {nextWrist.id} after 14 days in a row at 2/10 or less, no swelling</span>
            </div>
            <div className="num mb-1 text-sm text-muted">
              Day {Math.min(wristGate.streak, wristGate.target)} of {wristGate.target}
            </div>
            <Bar label={`Wrist ${nextWrist.id} unlock`} value={wristGate.streak / wristGate.target} className="bg-green" />
          </div>
        )}
        <p className="mt-3 text-xs text-muted">
          Drops back one stage if wrist pain goes above {RULES.painLimit.wrist}/10 or swelling appears next day. Days without a morning check or session break the streak.
        </p>
        <History items={wristStage.history} />
      </Card>

      <Card>
        <h2 className="font-semibold">Home rehab day</h2>
        <p className="mt-1 text-sm text-muted">10 to 15 min. Tick off each item; holds have built-in timers.</p>
        <ul className="mt-2 space-y-1 text-[15px]">
          {HOME_DAY.map((e, i) =>
            'exerciseId' in e ? (
              <li key={i}>
                • {e.note ?? e.exerciseId}
                {e.prescription.kind === 'timed' && `, ${e.prescription.sets} × ${e.prescription.holdSec.min} sec`}
                {e.prescription.kind === 'fixed' && `, ${e.prescription.sets} × ${e.prescription.reps.min}`}
                {e.prescription.kind === 'duration' && `, ${e.prescription.minutes.min} to ${e.prescription.minutes.max} min`}
              </li>
            ) : (
              <li key={i}>• Wrist block ({wristStage.current})</li>
            ),
          )}
        </ul>
        <PrimaryButton
          className="mt-3"
          onClick={() => {
            if (active) {
              nav.go('workout')
              return
            }
            void startWorkout(db, today, 'home', null).then(() => nav.go('workout'))
          }}
        >
          {active ? 'Resume current session' : 'Start home rehab'}
        </PrimaryButton>
      </Card>

      <Flare status={status} />

      <h2 className="mt-2 text-xl font-semibold">Weekly scores</h2>
      <Scores />

      <p className="py-2 text-center text-xs text-muted">Not medical advice. Check stage changes with your physio.</p>
      <OverrideSheet target={override} onClose={() => setOverride(null)} />
    </div>
  )
}
