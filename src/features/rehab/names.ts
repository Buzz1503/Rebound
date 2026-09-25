import { KNEE_STAGES, WRIST_STAGES } from '../../data/seed'
import type { KneeStageId, WristStageId } from '../../data/types'

export function kneeStageName(id: KneeStageId): string {
  const s = KNEE_STAGES.find((k) => k.id === id)
  return s ? `Stage ${s.number}: ${s.name}` : id
}

export function wristStageName(id: WristStageId): string {
  const s = WRIST_STAGES.find((w) => w.id === id)
  return s ? `${s.id}: ${s.name}` : id
}
