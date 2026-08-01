'use client'

import { usePathname } from 'next/navigation'
import { useReducedMotion } from 'framer-motion'
import { useEffect, useRef } from 'react'

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduceMotion) {
      el.style.opacity = '1'
      el.style.transform = 'none'
      return
    }
    el.style.opacity = '0'
    el.style.transform = 'translateY(6px)'
    const raf = requestAnimationFrame(() => {
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
    return () => cancelAnimationFrame(raf)
  }, [pathname, reduceMotion])

  return <div ref={ref}>{children}</div>
}
