'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { api } from '@/lib/api'
import { getFollowedDeputyId } from '@/lib/mon-depute'

export function FollowedDeputyChip() {
  const [name, setName] = useState<string | null>(null)

  useEffect(() => {
    const id = getFollowedDeputyId()
    if (!id) return
    let cancelled = false
    api.deputies.get(id).then(d => {
      if (!cancelled) setName(d.full_name)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  if (!name) return null

  return (
    <Link
      href="/mon-depute"
      className="flex items-center gap-1.5 text-xs font-medium text-navy dark:text-gray-100 bg-navy-muted dark:bg-white/10 px-3 py-1.5 rounded-full hover:opacity-80 transition-opacity"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z" />
      </svg>
      {name}
    </Link>
  )
}
