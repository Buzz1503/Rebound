import { useState } from 'react'
import type { Baseline, MorningCheck as Check } from '../../data/records'
import { PROGRESSION, RULES } from '../../data/seed'
import { db } from '../../db/db'
import { getSettings, saveMorningCheck } from '../../db/repo'
import { shouldSuggestFlare } from '../../engine/flare'
import { kneeStatus, worstLight, wristStatus, type JointStatus } from '../../engine/morning'
import type { Light } from '../../engine/types'
import { useToday } from '../../hooks/today'
import { Chips, GhostButton, painOptions, PrimaryButton } from '../../ui/controls'
import { lightBg, lightSoft, lightText, lightWord } from '../../ui/light'
import { useToast } from '../../ui/Toast'
import { startFlare } from '../rehab/actions'

interface Result {
  light: Light
  knee: JointStatus
  wrist: JointStatus
  baselineSet: boolean
  flare: boolean
}

function Grid({ label, value, onChange, limit }: { label: string; value: number | null; onChange: (v: number) => void; limit: number }) {
  return (
    <div>
      <div className="mb-1.5 text-sm text-muted">{label}</div>
      <Chips label={label} cols={6} options={painOptions(limit)} value={value} onChange={onChange} />
    </div>
  )
}

/** 30-second morning check. First one ever sets the baseline. */
export function MorningCheck({ onClose }: { onClose: () => void }) {
  const today = useToday()
  const toast = useToast()
  const [left, setLeft] = useState<number | null>(null)
  const [right, setRight] = useState<number | null>(null)
  const [wrist, setWrist] = useState<number | null>(null)
  const [swelling, setSwelling] = useState<boolean | null>(null)
  const [result, setResult] = useState<Result | null>(null)

  const ready = left !== null && right !== null && wrist !== null && swelling !== null

  const save = async () => {
    if (!ready) return
    const prevCheck = await db.morningChecks.get(today)
    const prevSettings = await getSettings(db)
    const check: Check = { date: today, kneeLeft: left, kneeRight: right, wristPain: wrist, wristSwelling: swelling, createdAt: Date.now() }
    const baseline: Baseline = await saveMorningCheck(db, check)
    const knee = kneeStatus({ check, baseline, lastSessionPain: null, flareActive: false })
    const w = wristStatus({ check, baseline, lastSessionPain: null })
    const checks = await db.morningChecks.orderBy('date').toArray()
    const flare = !prevSettings.flare && shouldSuggestFlare(checks.slice(-PROGRESSION.knee.flare.badMorningsInARow), baseline)
    setResult({ light: worstLight(knee.light, w.light), knee, wrist: w, baselineSet: !prevSettings.baseline, flare })
    toast({
      message: 'Morning check saved',
      undo: async () => {
        if (prevCheck) await db.morningChecks.put(prevCheck)
        else await db.morningChecks.delete(today)
        if (!prevSettings.baseline) await db.settings.put(prevSettings)
        onClose()
      },
    })
  }

  if (result) {
    const r = result
    return (
      <div className="flex min-h-full flex-col gap-3 p-4">
        <div className={`mt-4 rounded-3xl p-5 ${lightSoft[r.light]}`}>
          <div className="flex items-center gap-3">
            <span className={`h-5 w-5 rounded-full ${lightBg[r.light]}`} />
            <span className={`text-3xl font-semibold ${lightText[r.light]}`}>{lightWord[r.light]}</span>
          </div>
          <p className="mt-3 text-lg">{r.knee.message}</p>
          <p className="mt-1 text-lg">{r.wrist.message}</p>
          {r.baselineSet && <p className="mt-3 text-sm text-muted">First check: this is now your baseline. You can edit it in More.</p>}
        </div>
        {r.flare && (
          <div className="rounded-3xl border border-red/50 bg-red-soft p-4">
            <p className="font-semibold text-red">Two worse knee mornings in a row.</p>
            <p className="mt-1 text-sm">Flare mode drops knee work to isometrics for 3 days, then restarts knee lifts 20% lighter.</p>
            <button
              onClick={() => {
                void startFlare(db, today).then(() => toast({ message: 'Flare mode on', undo: () => void db.settings.get('settings').then((s) => s && db.settings.put({ ...s, flare: null })) }))
                setResult({ ...r, flare: false })
              }}
              className="mt-3 min-h-12 w-full rounded-xl bg-red font-semibold text-bg"
            >
              Start flare mode
            </button>
          </div>
        )}
        <div className="mt-auto">
          <PrimaryButton onClick={onClose}>Done</PrimaryButton>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-semibold">Morning check</h1>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
      </div>
      <section className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="font-semibold">Knee</h2>
        <p className="mb-3 text-sm text-muted">{PROGRESSION.morningKneeCheck}</p>
        <div className="space-y-3">
          <Grid label="Left knee" value={left} onChange={setLeft} limit={RULES.painLimit.knee} />
          <Grid label="Right knee" value={right} onChange={setRight} limit={RULES.painLimit.knee} />
        </div>
      </section>
      <section className="rounded-3xl border border-line bg-surface p-4">
        <h2 className="mb-3 font-semibold">Wrist</h2>
        <Grid label="Wrist pain" value={wrist} onChange={setWrist} limit={RULES.painLimit.wrist} />
        <div className="mt-3 text-sm text-muted">Swelling today?</div>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              role="radio"
              aria-checked={swelling === v}
              onClick={() => setSwelling(v)}
              className={`min-h-12 rounded-xl font-semibold ${swelling === v ? (v ? 'bg-red text-bg' : 'bg-green text-bg') : 'bg-surface-2'}`}
            >
              {v ? 'Yes' : 'No'}
            </button>
          ))}
        </div>
      </section>
      <div className="mt-auto">
        <PrimaryButton disabled={!ready} onClick={() => void save()}>
          See today's plan
        </PrimaryButton>
      </div>
    </div>
  )
}

