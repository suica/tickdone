// Installable app and offline support: registers the service worker (public build only, see
// `serviceWorkerPlugin` in vite.config.ts), offers a reload when a new version is waiting, and keeps
// the browser's install prompt for the button in Settings > About.
import { useSyncExternalStore } from 'react'

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface PwaState {
  /** A new version is installed and waiting; reloading switches to it. */
  updateReady: boolean
  /** The browser offered installation (beforeinstallprompt) and it has not happened yet. */
  canInstall: boolean
}

let state: PwaState = { updateReady: false, canInstall: false }
const subs = new Set<() => void>()
const set = (p: Partial<PwaState>) => {
  state = { ...state, ...p }
  subs.forEach((f) => f())
}
const subscribe = (f: () => void) => {
  subs.add(f)
  return () => subs.delete(f)
}
export const getPwa = () => state
export const usePwa = () => useSyncExternalStore(subscribe, getPwa, getPwa)

let installEvent: InstallPromptEvent | undefined
let waiting: ServiceWorker | null = null
let registration: ServiceWorkerRegistration | undefined

/** The service worker registration, once there is one (used to show notifications). */
export const getRegistration = () => registration

/** Whether TickDone runs as an installed app (its own window) rather than in a browser tab. */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

export async function promptInstall(): Promise<boolean> {
  const e = installEvent
  if (!e) return false
  installEvent = undefined
  set({ canInstall: false })
  await e.prompt()
  const { outcome } = await e.userChoice
  return outcome === 'accepted'
}

/** Activates the waiting version; the page reloads once it has taken over. */
export function applyUpdate() {
  if (!waiting) return location.reload()
  waiting.postMessage({ type: 'skip-waiting' })
}

function watch(reg: ServiceWorkerRegistration) {
  const offer = (sw: ServiceWorker | null) => {
    // Only an update when a version already controls the page; the very first install is not one.
    if (!sw || !navigator.serviceWorker.controller) return
    waiting = sw
    set({ updateReady: true })
  }
  offer(reg.waiting)
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing
    sw?.addEventListener('statechange', () => {
      if (sw.state === 'installed') offer(sw)
    })
  })
}

/** Starts the service worker and the install prompt. Call once, as early as possible. */
export function startPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    installEvent = e as InstallPromptEvent
    set({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    installEvent = undefined
    set({ canInstall: false })
  })

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // A new version took over after "Reload"; the first install also takes control, but there is nothing to reload then.
    if (!waiting || reloading) return
    reloading = true
    location.reload()
  })
  // A click on a reminder notification: the service worker asks this window to open the task.
  navigator.serviceWorker.addEventListener('message', (e) => {
    const msg = e.data as { type?: string; taskId?: string } | null
    if (msg?.type === 'open-task' && msg.taskId) location.hash = 'task=' + encodeURIComponent(msg.taskId)
  })
  navigator.serviceWorker
    .register('/sw.js', { scope: '/' })
    .then((reg) => {
      registration = reg
      watch(reg)
      // Look for a new version when the app comes back to the foreground, and every few hours while it stays open
      const check = () => reg.update().catch(() => {})
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check()
      })
      setInterval(check, 3 * 3600_000)
    })
    .catch(() => {
      /* not allowed here (private mode, blocked by the browser, tests): the app works without it */
    })
}
