// Install state of the web app (#595), shared by /application and the
// homepage section (#596). Everything here is decided in the browser after
// load: the server sends the same HTML to every visitor (the pages are ISR
// cached, so a page varied by user agent could reach the wrong device).

/** What /application offers, in priority order. */
export type InstallSituation =
  | 'installed' // running as the installed web app
  | 'ios' // iPhone or iPad: no web install offered, the native app is coming
  | 'accepted' // the visitor just accepted the browser's install window
  | 'dismissed' // the visitor cancelled the browser's install window
  | 'prompt' // the browser handed us an install prompt
  | 'manual' // no prompt: install from the browser menu

export type InstallSignals = {
  standalone: boolean
  ios: boolean
  promptAvailable: boolean
  outcome: 'accepted' | 'dismissed' | null
}

/** The situation for a set of signals. Pure, so each case is unit-tested. */
export function decideInstallSituation(s: InstallSignals): InstallSituation {
  if (s.standalone) return 'installed'
  if (s.ios) return 'ios'
  if (s.outcome === 'accepted') return 'accepted'
  if (s.outcome === 'dismissed') return 'dismissed'
  if (s.promptAvailable) return 'prompt'
  return 'manual'
}

/**
 * iPhone, iPod or iPad. iPadOS presents itself as a Mac, so a "Macintosh"
 * user agent with more than one touch point is an iPad.
 */
export function isIOSDevice(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return true
  return /Macintosh/i.test(userAgent) && maxTouchPoints > 1
}

/** Opened as the installed web app (Android and desktop, or an iOS home-screen icon). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true
  } catch {}
  return (navigator as Navigator & { standalone?: boolean }).standalone === true
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return isIOSDevice(navigator.userAgent, navigator.maxTouchPoints ?? 0)
}

// ---------------------------------------------------------------------------
// The browser's install prompt.
//
// Chrome fires `beforeinstallprompt` once per page load, as soon as the site
// is installable, which on a repeat visit can be before React hydrates. The
// root layout therefore runs INSTALL_PROMPT_CAPTURE_SCRIPT before hydration:
// it keeps the event on `window` and announces it, and the store below reads
// it from there. The event is not prevented, so the browser's own install
// hints behave exactly as before.

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const GLOBAL_KEY = '__moneluInstallPrompt'
const CHANGE_EVENT = 'monelu:installprompt'

export const INSTALL_PROMPT_CAPTURE_SCRIPT =
  `(function(){` +
  `window.addEventListener('beforeinstallprompt',function(e){window.${GLOBAL_KEY}=e;window.dispatchEvent(new Event('${CHANGE_EVENT}'))});` +
  `window.addEventListener('appinstalled',function(){window.${GLOBAL_KEY}=null;window.dispatchEvent(new Event('${CHANGE_EVENT}'))});` +
  `})();`

type WindowWithPrompt = Window & { [GLOBAL_KEY]?: InstallPromptEvent | null }

function currentPrompt(): InstallPromptEvent | null {
  if (typeof window === 'undefined') return null
  return (window as WindowWithPrompt)[GLOBAL_KEY] ?? null
}

function setPrompt(event: InstallPromptEvent | null) {
  ;(window as WindowWithPrompt)[GLOBAL_KEY] = event
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

/** useSyncExternalStore subscribe: fires when a prompt arrives or is used up. */
export function subscribeInstallPrompt(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CHANGE_EVENT, onChange)
}

export function hasInstallPrompt(): boolean {
  return currentPrompt() !== null
}

/**
 * Opens the browser's install window. A prompt can be used only once, so it
 * is cleared whatever the visitor chooses.
 */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const event = currentPrompt()
  if (!event) return 'unavailable'
  setPrompt(null)
  try {
    await event.prompt()
    const { outcome } = await event.userChoice
    return outcome
  } catch {
    return 'unavailable'
  }
}
