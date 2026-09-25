import { RULES } from '../../data/seed'
import type { Joint } from '../../data/types'
import { Card, PrimaryButton } from '../../ui/controls'
import { lightBg, painLight } from '../../ui/light'
import type { NextChange, SessionSummary } from './summary'

interface Props {
  title: string
  summary: SessionSummary
  changes: NextChange[]
  onDone: () => void
}

const JOINTS: Joint[] = ['knee', 'wrist', 'shoulder']

export function Summary({ title, summary, changes, onDone }: Props) {
  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      <h1 className="pt-2 text-2xl font-semibold">{title} done</h1>
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <div className="text-xs text-muted uppercase">Volume</div>
          <div className="num text-3xl font-semibold">
            {summary.volumeKg.toLocaleString('en-AU')}
            <span className="ml-1 text-base font-normal text-muted">kg</span>
          </div>
        </Card>
        <Card>
          <div className="text-xs text-muted uppercase">Sets</div>
          <div className="num text-3xl font-semibold">
            {summary.setsDone}
            <span className="ml-1 text-base font-normal text-muted">/ {summary.setsPlanned}</span>
          </div>
        </Card>
      </div>
      <Card>
        <div className="mb-2 text-xs text-muted uppercase">Max pain</div>
        <div className="grid grid-cols-3 gap-2">
          {JOINTS.map((j) => {
            const v = summary.maxPain[j]
            return (
              <div key={j} className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${v === undefined ? 'bg-line' : lightBg[painLight(v, RULES.painLimit[j])]}`} />
                <span className="text-sm capitalize">{j}</span>
                <span className="num ml-auto font-semibold">{v ?? '—'}</span>
              </div>
            )
          })}
        </div>
      </Card>
      <Card>
        <div className="mb-2 text-xs text-muted uppercase">Next session</div>
        {changes.length === 0 && <p className="text-sm text-muted">Same weights next time. Keep adding reps.</p>}
        <ul className="space-y-2">
          {changes.map((c) => (
            <li key={c.exerciseId} className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${lightBg[c.light]}`} />
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      </Card>
      <div className="mt-auto pt-2">
        <PrimaryButton onClick={onDone}>Done</PrimaryButton>
      </div>
    </div>
  )
}
