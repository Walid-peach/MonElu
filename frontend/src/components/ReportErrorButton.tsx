'use client'
import { useState } from 'react'
import { api } from '@/lib/api'

interface ReportErrorButtonProps {
  entityType: 'deputy' | 'vote' | 'page'
  entityId?: string | null
  entityLabel: string
  pageUrl: string
}

type Status = 'idle' | 'open' | 'sending' | 'sent' | 'error'

export function ReportErrorButton({ entityType, entityId, entityLabel, pageUrl }: ReportErrorButtonProps) {
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')

  async function handleSubmit() {
    if (!message.trim()) return
    setStatus('sending')
    try {
      await api.feedback.report({
        entity_type: entityType,
        entity_id: entityId ?? null,
        entity_label: entityLabel,
        page_url: pageUrl,
        message: message.trim(),
        email: email.trim() || null,
      })
      setStatus('sent')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'sent') {
    return (
      <span
        role="status"
        className="inline-flex items-center gap-1.5 text-sm text-emerald-700 font-medium px-2.5 py-1.5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        Merci, signalement envoyé !
      </span>
    )
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setStatus(s => (s === 'idle' ? 'open' : 'idle'))}
        aria-expanded={status !== 'idle'}
        className="inline-flex items-center gap-1.5 text-sm text-gray-mid hover:text-navy transition-colors px-4 py-3 rounded-lg border border-gray-border bg-white font-semibold"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        Signaler une erreur
      </button>

      {status !== 'idle' && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: 0, zIndex: 40,
            width: 320, background: '#fff', border: '1px solid #E4E6EA',
            borderRadius: 12, padding: 18, boxShadow: '0 8px 24px rgba(27,43,80,0.16)',
            textAlign: 'left',
          }}
        >
          <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10, lineHeight: 1.4 }}>
            Concerne : <span style={{ color: '#1B2B50', fontWeight: 600 }}>{entityLabel}</span>
          </div>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Décrivez l'erreur constatée…"
            aria-label="Description de l'erreur"
            style={{
              width: '100%', border: '1px solid #E4E6EA', borderRadius: 8,
              padding: '9px 11px', fontSize: 13.5, color: '#1B2B50',
              resize: 'vertical', outline: 'none', fontFamily: 'inherit',
            }}
          />
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            maxLength={200}
            placeholder="Votre e-mail (facultatif, pour vous répondre)"
            aria-label="Adresse e-mail (facultatif)"
            style={{
              width: '100%', border: '1px solid #E4E6EA', borderRadius: 8,
              padding: '8px 11px', fontSize: 13, color: '#1B2B50',
              marginTop: 8, outline: 'none', fontFamily: 'inherit',
            }}
          />
          {status === 'error' && (
            <div role="alert" style={{ fontSize: 12.5, color: '#C9302A', marginTop: 8 }}>
              L&apos;envoi a échoué. Réessayez dans quelques secondes.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button
              onClick={handleSubmit}
              disabled={status === 'sending' || !message.trim()}
              style={{
                flex: 1, background: '#1B2B50', color: '#fff', border: 'none',
                padding: '9px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13.5,
                cursor: status === 'sending' || !message.trim() ? 'default' : 'pointer',
                opacity: status === 'sending' || !message.trim() ? 0.6 : 1,
              }}
            >
              {status === 'sending' ? 'Envoi…' : 'Envoyer le signalement'}
            </button>
            <button
              onClick={() => setStatus('idle')}
              style={{
                background: '#fff', color: '#6B7280', border: '1px solid #E4E6EA',
                padding: '9px 14px', borderRadius: 8, fontWeight: 600, fontSize: 13.5, cursor: 'pointer',
              }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
