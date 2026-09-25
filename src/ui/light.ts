import type { Light } from '../engine/types'

/** Green = progress, amber = hold, red = back off. One mapping, used everywhere. */
export const lightText: Record<Light, string> = { green: 'text-green', amber: 'text-amber', red: 'text-red' }
export const lightBg: Record<Light, string> = { green: 'bg-green', amber: 'bg-amber', red: 'bg-red' }
export const lightSoft: Record<Light, string> = { green: 'bg-green-soft', amber: 'bg-amber-soft', red: 'bg-red-soft' }
export const lightBorder: Record<Light, string> = { green: 'border-green/40', amber: 'border-amber/50', red: 'border-red/50' }
export const lightWord: Record<Light, string> = { green: 'Go', amber: 'Hold', red: 'Back off' }

/** Pain score colour against a joint limit. */
export function painLight(pain: number, limit: number): Light {
  if (pain > limit) return 'red'
  if (pain >= limit) return 'amber'
  return 'green'
}
