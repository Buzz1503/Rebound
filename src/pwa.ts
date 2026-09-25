import { registerSW } from 'virtual:pwa-register'

/** Offline support: precache the app. New versions activate on next launch. */
export function setupPwa(): void {
  if (!('serviceWorker' in navigator)) return
  registerSW({ immediate: true })
  // Ask the browser not to evict IndexedDB under storage pressure (no data loss).
  void navigator.storage?.persist?.().catch(() => false)
}
