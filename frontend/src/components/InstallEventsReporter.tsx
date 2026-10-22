'use client'
import { useEffect } from 'react'
import { hasInstallPrompt, isStandalone, subscribeInstallPrompt } from '@/lib/installState'
import {
  recordInstallEvent,
  recordPromptAvailableOnce,
  recordStandaloneVisitOnce,
} from '@/lib/installEvents'

/**
 * Site-wide install counters that no single page owns (#598): a session opened
 * as the installed web app, a session in which the browser offered
 * installation (the prompt the root layout's capture script keeps, which may
 * have arrived before this mounted), and the browser's `appinstalled` event,
 * which fires wherever the visitor installs from, the browser menu included.
 * Renders nothing and runs only in the browser, after hydration.
 */
export function InstallEventsReporter() {
  useEffect(() => {
    if (isStandalone()) recordStandaloneVisitOnce()
    const onPromptChange = () => {
      if (hasInstallPrompt()) recordPromptAvailableOnce()
    }
    onPromptChange()
    const unsubscribe = subscribeInstallPrompt(onPromptChange)
    const onInstalled = () => recordInstallEvent('app_installed')
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      unsubscribe()
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])
  return null
}
