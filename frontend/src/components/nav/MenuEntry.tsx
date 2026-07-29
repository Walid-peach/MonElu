'use client'

import Link from 'next/link'
import { openGlobalSearch } from '../GlobalSearch'
import type { NavEntry } from './navigation'

/**
 * One row of a nav menu — dot (active) · icon · label + description.
 * Renders as a link, an external link, or a button for action entries,
 * and is shared by the desktop dropdowns and the mobile sheet.
 */
export function MenuEntry({
  entry,
  active,
  reachable,
  onNavigate,
}: {
  entry: NavEntry
  active: boolean
  /** False while the menu is closed — keeps hidden rows out of the tab order. */
  reachable: boolean
  onNavigate: () => void
}) {
  const inner = (
    <>
      <span
        className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-civic transition-opacity ${active ? 'opacity-100' : 'opacity-0'}`}
        aria-hidden="true"
      />
      <span className="mt-0.5 shrink-0 text-navy dark:text-[color:var(--dp-text)]">{entry.icon}</span>
      <span className="text-left">
        <span className="block text-[14.5px] font-semibold text-navy group-hover:text-red-civic transition-colors dark:text-[color:var(--dp-text)]">
          {entry.label}
          {entry.kind === 'external' && <span aria-hidden="true"> ↗</span>}
        </span>
        <span className="block text-[12.5px] mt-0.5 text-gray-mid dark:text-[color:var(--dp-text-muted)]">
          {entry.description}
        </span>
      </span>
    </>
  )

  const className = 'group flex items-start gap-3 w-full'
  const tabIndex = reachable ? undefined : -1

  if (entry.kind === 'action') {
    return (
      <button
        type="button"
        tabIndex={tabIndex}
        className={`${className} cursor-pointer`}
        onClick={() => { onNavigate(); openGlobalSearch() }}
      >
        {inner}
      </button>
    )
  }

  if (entry.kind === 'external') {
    return (
      <a
        href={entry.href}
        target="_blank"
        rel="noopener noreferrer"
        tabIndex={tabIndex}
        className={className}
        onClick={onNavigate}
      >
        {inner}
      </a>
    )
  }

  return (
    <Link href={entry.href} tabIndex={tabIndex} className={className} onClick={onNavigate}>
      {inner}
    </Link>
  )
}
