import { useState } from 'react'
import type { QuestionnaireType } from '../../data/records'
import { db } from '../../db/db'
import { QUESTIONNAIRES, scoreQuestionnaire, type Question } from '../../engine/questionnaires'
import { useToday } from '../../hooks/today'
import { Chips, GhostButton, PrimaryButton } from '../../ui/controls'
import { useToast } from '../../ui/Toast'
import { saveQuestionnaire } from './actions'

const scale = Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) }))
const minutes = Array.from({ length: 11 }, (_, i) => ({ value: i * 10, label: String(i * 10) }))

function Item({ q, value, onChange }: { q: Question; value: number | undefined; onChange: (v: number) => void }) {
  return (
    <div className="rounded-3xl border border-line bg-surface p-4">
      <p className="mb-3 text-[15px] font-medium">{q.text}</p>
      {q.kind === 'scale' ? (
        <>
          <Chips label={q.text} cols={6} options={q.minutes ? minutes : scale} value={value ?? null} onChange={onChange} />
          <div className="mt-1.5 flex justify-between text-xs text-muted">
            <span>{q.low}</span>
            <span>{q.high}</span>
          </div>
        </>
      ) : (
        <div role="radiogroup" aria-label={q.text} className="grid gap-2">
          {q.options.map((o) => (
            <button
              key={o.label}
              role="radio"
              aria-checked={value === o.points}
              onClick={() => onChange(o.points)}
              className={`min-h-12 rounded-xl px-3 text-left text-[15px] ${value === o.points ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** VISA-P / PRWE. VISA-P Q8: answer exactly one of A, B or C. */
export function QuestionnaireForm({ type, onClose }: { type: QuestionnaireType; onClose: () => void }) {
  const today = useToday()
  const toast = useToast()
  const def = QUESTIONNAIRES[type]
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [q8, setQ8] = useState<'q8a' | 'q8b' | 'q8c'>('q8a')

  const questions = def.questions.filter((q) => !q.id.startsWith('q8') || q.id === q8)
  const complete = questions.every((q) => answers[q.id] !== undefined)
  const clean = (): Record<string, number> => {
    const out: Record<string, number> = {}
    for (const q of questions) if (answers[q.id] !== undefined) out[q.id] = answers[q.id] as number
    return out
  }

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-semibold">{def.title}</h1>
        <GhostButton onClick={onClose}>Cancel</GhostButton>
      </div>
      <p className="text-sm text-muted">{def.intro}</p>
      {questions.map((q) => (
        <div key={q.id}>
          {q.id.startsWith('q8') && (
            <div className="mb-2 grid grid-cols-3 gap-2">
              {(['q8a', 'q8b', 'q8c'] as const).map((k, i) => (
                <button
                  key={k}
                  onClick={() => setQ8(k)}
                  className={`min-h-12 rounded-xl text-sm font-semibold ${q8 === k ? 'bg-accent text-accent-ink' : 'bg-surface-2'}`}
                >
                  {['No pain in sport', 'Some pain', 'Pain stops me'][i]}
                </button>
              ))}
            </div>
          )}
          <Item q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
        </div>
      ))}
      <div className="sticky bottom-0 bg-bg py-2">
        <PrimaryButton
          disabled={!complete}
          onClick={() => {
            const a = clean()
            void saveQuestionnaire(db, type, a, today).then((id) => {
              toast({ message: `${type} saved: ${scoreQuestionnaire(type, a)}/100`, undo: () => void db.questionnaires.delete(id) })
              onClose()
            })
          }}
        >
          {complete ? `Save score: ${scoreQuestionnaire(type, clean())}/100` : `${questions.filter((q) => answers[q.id] !== undefined).length} of ${questions.length} answered`}
        </PrimaryButton>
      </div>
    </div>
  )
}
