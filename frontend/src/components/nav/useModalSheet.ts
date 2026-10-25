'use client'
import { useEffect, type RefObject } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * What an open aria-modal sheet owes the page: focus moves into it and stays
 * there (Tab wraps), Escape closes it, and the page behind does not scroll.
 * Shared by the phone menu sheets (MobileMenu) and drawer (MobileDrawer).
 */
export function useModalSheet(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return

    // A real aria-modal dialog needs a focus trap: without one, Tab can walk
    // focus out into the page content sitting behind the sheet.
    function focusableElements(): HTMLElement[] {
      return Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])
    }

    focusableElements()[0]?.focus()

    function onKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
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
    }
  }, [open, onClose, ref])
}
