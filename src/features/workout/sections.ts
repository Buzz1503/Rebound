import type { SectionId } from '../../data/types'

export const SECTION_ORDER: SectionId[] = ['warmup', 'kneePrimer', 'wristBlock', 'kneeStrength', 'gluteHam', 'upper', 'core', 'shoulderCare']

export const SECTION_LABEL: Record<SectionId, string> = {
  warmup: 'Warm-up',
  kneePrimer: 'Knee primer',
  wristBlock: 'Wrist block',
  kneeStrength: 'Knee strength',
  gluteHam: 'Glutes & hamstrings',
  upper: 'Upper body',
  core: 'Core',
  shoulderCare: 'Shoulder care (optional)',
}
