'use client'

import { useSearchParams } from 'next/navigation'
import { REPORT_PARAM, parseReportTarget } from '@/lib/reportContent'
import { CONTACT_EMAIL } from '@/lib/site'

/**
 * On `/contact`, names the share snapshot a visitor came to report (#707).
 * `/contact` is a static page, so the `signaler` parameter is read in the
 * browser; without it, or with a value that is not a known snapshot, this
 * renders nothing and the section's static text still says what to send.
 */
export function ReportedPageNote() {
  const target = parseReportTarget(useSearchParams().get(REPORT_PARAM))
  if (!target) return null

  const subject = `Signalement d'un contenu partagé : ${target.url}`
  const body = `Page signalée : ${target.url}\n\nRaison du signalement :\n`
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`

  return (
    <div
      data-testid="reported-page"
      style={{
        margin: '14px 0 0',
        padding: '12px 14px',
        border: '1px solid var(--dp-border)',
        borderRadius: '8px',
        fontSize: '15px',
        lineHeight: 1.6,
        color: 'var(--dp-text-secondary)',
      }}
    >
      Vous signalez {target.label} :{' '}
      <span style={{ color: 'var(--dp-text)', wordBreak: 'break-all' }}>{target.url}</span>
      <br />
      <a href={mailto} style={{ color: 'var(--dp-text)' }}>
        Écrire un e-mail avec cette adresse déjà indiquée
      </a>
    </div>
  )
}
