'use client'
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * What an open aria-modal sheet owes the page: focus moves into it and stays
 * there (Tab wraps), Escape closes it, the page behind does not scroll, and
 * on close focus goes back to whatever opened it rather than to <body>.
 * Shared by the phone menu sheets (MobileMenu) and drawer (MobileDrawer).
 */
export function useModalSheet(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  // Callers may pass a new onClose every render; the sheet must not re-run
  // (and steal focus back to its first control) each time they do.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return

    // The ☰ (or tab) that opened the sheet, to hand focus back to on close.
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const sheet = ref.current

    // A real aria-modal dialog needs a focus trap: without one, Tab can walk
    // focus out into the page content sitting behind the sheet.
    function focusableElements(): HTMLElement[] {
      return Array.from(sheet?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
    }

    focusableElements()[0]?.focus()

    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const elements = focusableElements()
      if (elements.length === 0) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      // Only if focus is still inside the closing sheet (or lost): a link that
      // navigated, or the search overlay opened from the drawer, keeps its own.
      const active = document.activeElement
      if (opener?.isConnected && (!active || active === document.body || sheet?.contains(active))) {
        opener.focus()
      }
    }
  }, [open, ref])
}
