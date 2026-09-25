import type { ReactNode } from 'react'
import { db } from '../../db/db'
import { useToast } from '../../ui/Toast'
import type { Status } from '../status/status'
import { KNEE_ORDER, WRIST_ORDER, restoreStage, setKneeStage, setWristStage, snooze, startFlare } from './actions'
import { kneeStageName, wristStageName } from './names'

function Prompt({ tone, title, body, yes, onYes, onNo }: { tone: 'green' | 'red'; title: string; body: ReactNode; yes: string; onYes: () => void; onNo: () => void }) {
  const box = tone === 'green' ? 'border-green/40 bg-green-soft' : 'border-red/50 bg-red-soft'
  const btn = tone === 'green' ? 'bg-green' : 'bg-red'
  return (
    <div className={`rounded-3xl border p-4 ${box}`}>
      <p className="font-semibold">{title}</p>
      <div className="mt-1 text-sm">{body}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onNo} className="min-h-12 rounded-xl bg-surface-2 font-semibold">
          Not yet
        </button>
        <button onClick={onYes} className={`min-h-12 rounded-xl font-semibold text-bg ${btn}`}>
          {yes}
        </button>
      </div>
    </div>
  )
}

/** Automatic unlocks and regressions wait for "Your physio agrees?" before changing anything. */
export function StagePrompts({ status }: { status: Status }) {
  const toast = useToast()
  const { prompts, wristStage, kneeStage, today } = status
  const nextWrist = WRIST_ORDER[WRIST_ORDER.indexOf(wristStage.current) + 1]
  const prevWrist = WRIST_ORDER[WRIST_ORDER.indexOf(wristStage.current) - 1]
  const nextKnee = KNEE_ORDER[KNEE_ORDER.indexOf(kneeStage.current) + 1]
  return (
    <>
      {status.suggestFlare && (
        <Prompt
          tone="red"
          title="Two worse knee mornings in a row"
          body="Flare mode: knee isometrics only for 3 days, then knee lifts restart 20% lighter."
          yes="Start flare mode"
          onNo={() => void snooze(db, 'flare', today)}
          onYes={() => void startFlare(db, today).then(() => toast({ message: 'Flare mode on', undo: () => void db.settings.get('settings').then((s) => s && db.settings.put({ ...s, flare: null })) }))}
        />
      )}
      {prompts.wristDown && prevWrist && (
        <Prompt
          tone="red"
          title={`Drop wrist back to ${wristStageName(prevWrist)}?`}
          body={<>{status.wristGate.regressReason}. The plan drops back one stage when pain goes above 3/10 or swelling appears. Your physio agrees?</>}
          yes="Drop back"
          onNo={() => void snooze(db, 'wristRegress', today)}
          onYes={() =>
            void setWristStage(db, prevWrist, today, status.wristGate.regressReason ?? 'Regress rule', false).then((prev) =>
              toast({ message: `Wrist now ${prevWrist}`, undo: () => void restoreStage(db, prev) }),
            )
          }
        />
      )}
      {prompts.wristUp && nextWrist && (
        <Prompt
          tone="green"
          title={`Wrist ${nextWrist} unlocked`}
          body={<>14 days in a row at 2/10 or less, no swelling. Move to {wristStageName(nextWrist)}? Your physio agrees?</>}
          yes="Physio agrees"
          onNo={() => void snooze(db, 'wrist', today)}
          onYes={() =>
            void setWristStage(db, nextWrist, today, '14 days at 2/10 or less', false).then((prev) =>
              toast({ message: `Wrist now ${nextWrist}`, undo: () => void restoreStage(db, prev) }),
            )
          }
        />
      )}
      {prompts.kneeUp && nextKnee && (
        <Prompt
          tone="green"
          title="Knee Stage 3 unlocked"
          body={<>All three criteria met. Move to {kneeStageName(nextKnee)}? Hack squat returns at 40 kg. Your physio agrees?</>}
          yes="Physio agrees"
          onNo={() => void snooze(db, 'knee', today)}
          onYes={() =>
            void setKneeStage(db, nextKnee, today, 'Stage 3 criteria met', false).then((prev) =>
              toast({ message: 'Knee now Stage 3', undo: () => void restoreStage(db, prev) }),
            )
          }
        />
      )}
    </>
  )
}
