import { useEffect, useState } from 'react'
import { toISODate } from '../engine/dates'

/** Today's local date, updating after midnight. */
export function useToday(): string {
  const [d, setD] = useState(() => toISODate(new Date()))
  useEffect(() => {
    const id = window.setInterval(() => setD(toISODate(new Date())), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return d
}
