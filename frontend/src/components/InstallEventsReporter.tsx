'use client'
import { useEffect } from 'react'
import { isStandalone } from '@/lib/installState'
import { recordInstallEvent, recordStandaloneVisitOnce } from '@/lib/installEvents'

/**
 * Site-wide install counters that no single page owns (#598): a session opened
 * as the installed web app, and the browser's `appinstalled` event, which
 * fires wherever the visitor installs from, the browser menu included.
 * Renders nothing and runs only in the browser, after hydration.
 */
export function InstallEventsReporter() {
  useEffect(() => {
    if (isStandalone()) recordStandaloneVisitOnce()
    const onInstalled = () => recordInstallEvent('app_installed')
    window.addEventListener('appinstalled', onInstalled)
    return () => window.removeEventListener('appinstalled', onInstalled)
  }, [])
  return null
}
