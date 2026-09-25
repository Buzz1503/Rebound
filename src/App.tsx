import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from './db/db'
import { getSettings } from './db/repo'
import { seedIfEmpty } from './db/seedDb'
import { NavContext, type Overlay, type Tab } from './app/nav'
import { ProgressScreen } from './features/progress/ProgressScreen'
import { RehabScreen } from './features/rehab/RehabScreen'
import { QuestionnaireForm } from './features/rehab/QuestionnaireForm'
import { MorningCheck } from './features/today/MorningCheck'
import { TodayScreen } from './features/today/TodayScreen'
import { WorkoutScreen } from './features/workout/WorkoutScreen'
import { ToastProvider } from './ui/Toast'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: 'M4 12h16M12 4v16' },
  { id: 'workout', label: 'Workout', icon: 'M3 12h3m12 0h3M6 8v8m12-8v8M9 10v4h6v-4' },
  { id: 'rehab', label: 'Rehab', icon: 'M5 19l4-4 3 3 7-9' },
  { id: 'progress', label: 'Progress', icon: 'M4 20V10m6 10V4m6 16v-7m4 7H2' },
  { id: 'more', label: 'More', icon: 'M5 12h.01M12 12h.01M19 12h.01' },
]

function Placeholder({ title }: { title: string }) {
  return (
    <div className="p-4">
      <h1 className="pt-2 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-muted">Coming in a later build step.</p>
    </div>
  )
}

export function App() {
  const [ready, setReady] = useState(false)
  const [tab, setTab] = useState<Tab>('today')
  const [overlay, setOverlay] = useState<Overlay>(null)
  const theme = useLiveQuery(async () => (await getSettings(db)).theme, [], 'dark')

  useEffect(() => {
    void seedIfEmpty(db).then(() => setReady(true))
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  if (!ready) return null

  return (
    <ToastProvider>
      <NavContext.Provider value={{ tab, go: (t) => { setOverlay(null); setTab(t) }, overlay, open: setOverlay }}>
      <div className="mx-auto flex h-dvh max-w-lg flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto">
          {overlay?.kind === 'morning' && <MorningCheck onClose={() => setOverlay(null)} />}
          {overlay?.kind === 'questionnaire' && <QuestionnaireForm type={overlay.type} onClose={() => setOverlay(null)} />}
          {!overlay && tab === 'workout' && <WorkoutScreen />}
          {!overlay && tab === 'today' && <TodayScreen />}
          {!overlay && tab === 'rehab' && <RehabScreen />}
          {!overlay && tab === 'progress' && <ProgressScreen />}
          {!overlay && tab === 'more' && <Placeholder title="More" />}
        </main>
        <nav aria-label="Main" className="safe-bottom grid grid-cols-5 border-t border-line bg-surface">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setOverlay(null)
                setTab(t.id)
              }}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${tab === t.id ? 'text-accent' : 'text-muted'}`}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      </NavContext.Provider>
    </ToastProvider>
  )
}
