import { createContext, useContext } from 'react'
import type { QuestionnaireType } from '../data/records'

export type Tab = 'today' | 'workout' | 'rehab' | 'progress' | 'more'

export type Overlay = { kind: 'morning' } | { kind: 'questionnaire'; type: QuestionnaireType } | null

export interface Nav {
  tab: Tab
  go: (tab: Tab) => void
  overlay: Overlay
  open: (o: Overlay) => void
}

export const NavContext = createContext<Nav>({ tab: 'today', go: () => undefined, overlay: null, open: () => undefined })

export function useNav(): Nav {
  return useContext(NavContext)
}
