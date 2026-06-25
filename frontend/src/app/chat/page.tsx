'use client'
import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import type { SearchResult } from '@/lib/api'

// ── Types ──────────────────────────────────────────────────────────────────

type UserMsg   = { role: 'user'; text: string }
type AsstMsg   = { role: 'assistant'; result: SearchResult }
type TypingMsg = { role: 'typing' }
type ErrMsg    = { role: 'error'; text: string }
type Message   = UserMsg | AsstMsg | TypingMsg | ErrMsg

type StoredMsg = UserMsg | AsstMsg | ErrMsg  // no typing — never persisted

type StoredConv = {
  id: string
  title: string
  createdAt: number
  messages: StoredMsg[]
}

// ── localStorage helpers ───────────────────────────────────────────────────

const LS_KEY = 'monelu-conversations'
const MAX_CONVS = 50

function loadConversations(): StoredConv[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return []
    return (JSON.parse(raw) as StoredConv[]).sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

function saveConversations(convs: StoredConv[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(convs.slice(0, MAX_CONVS)))
  } catch {}
}

function upsertConv(convs: StoredConv[], conv: StoredConv): StoredConv[] {
  const idx = convs.findIndex(c => c.id === conv.id)
  const next = idx >= 0
    ? convs.map((c, i) => (i === idx ? conv : c))
    : [conv, ...convs]
  return next.sort((a, b) => b.createdAt - a.createdAt)
}

// ── Date grouping ──────────────────────────────────────────────────────────

function groupLabel(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)
  const convDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  if (convDay.getTime() === today.getTime()) return "Aujourd'hui"
  if (convDay.getTime() === yesterday.getTime()) return 'Hier'
  if (convDay.getTime() > weekAgo.getTime()) return 'Cette semaine'
  return 'Plus ancien'
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "À l'instant"
  if (mins < 60) return `Il y a ${mins} min`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `Il y a ${hrs} h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Hier'
  return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

// ── Markdown renderer ──────────────────────────────────────────────────────

function mdToHtml(text: string): string {
  let h = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  const blocks = h.split('\n\n')
  return blocks.map(block => {
    const lines = block.split('\n')
    if (lines.length > 1 && lines.every(l => /^- /.test(l))) {
      const items = lines.map(l => `<li style="margin:5px 0">${l.slice(2)}</li>`).join('')
      return `<ul style="margin:6px 0 12px 0;padding-left:22px">${items}</ul>`
    }
    if (lines.length > 1 && lines.every(l => /^\d+\. /.test(l))) {
      const items = lines.map(l => `<li style="margin:5px 0">${l.replace(/^\d+\.\s/, '')}</li>`).join('')
      return `<ol style="margin:6px 0 12px 0;padding-left:22px">${items}</ol>`
    }
    return `<p style="margin:0 0 14px 0">${lines.join('<br>')}</p>`
  }).join('')
}

// ── Source card helpers ────────────────────────────────────────────────────

type SourceCard = { dot: string; label: string; sub: string; badge: string; badgeBg: string; badgeColor: string }

function mapSource(src: SearchResult['sources'][0]): SourceCard {
  const meta = src.metadata || {}
  const type = meta.chunk_type || 'stat'
  if (type === 'deputy') {
    return {
      dot: meta.group_color || '#1B2B50',
      label: meta.deputy_name || meta.name || 'Député',
      sub: [meta.department, meta.circonscription].filter(Boolean).join(' · ') || '',
      badge: meta.group_short || meta.group || '',
      badgeBg: '#F1F5F9', badgeColor: '#475569',
    }
  }
  if (type === 'vote') {
    const adopted = (meta.result || '').toLowerCase().includes('adopt')
    return {
      dot: adopted ? '#15803D' : '#DC2626',
      label: meta.title || src.content.slice(0, 60),
      sub: meta.date || '',
      badge: meta.result || '',
      badgeBg: adopted ? '#DCFCE7' : '#FEE2E2',
      badgeColor: adopted ? '#15803D' : '#DC2626',
    }
  }
  return {
    dot: '#1B2B50',
    label: src.content.slice(0, 55) + (src.content.length > 55 ? '…' : ''),
    sub: `Pertinence ${Math.round(src.similarity * 100)} %`,
    badge: type, badgeBg: '#EFF3FB', badgeColor: '#1B2B50',
  }
}

// ── Main component ─────────────────────────────────────────────────────────

function ChatInner() {
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') || ''

  const [messages, setMessages]   = useState<Message[]>([])
  const [inputVal, setInputVal]   = useState(initialQ)
  const [loading, setLoading]     = useState(false)
  const [darkMode, setDarkMode]   = useState(false)
  const [conversations, setConversations] = useState<StoredConv[]>([])
  const [activeConvId, setActiveConvId]   = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)

  const scrollRef     = useRef<HTMLDivElement>(null)
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const activeConvRef = useRef<string | null>(null)  // sync for use inside callbacks
  const sentRef       = useRef(false)

  // Keep ref in sync with state
  useEffect(() => { activeConvRef.current = activeConvId }, [activeConvId])

  // Load persisted state on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem('monelu-dark')
      if (saved === '1') setDarkMode(true)
    } catch {}
    setConversations(loadConversations())
  }, [])

  const toggleDark = useCallback(() => {
    setDarkMode(d => {
      try { localStorage.setItem('monelu-dark', d ? '0' : '1') } catch {}
      return !d
    })
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  // Auto-send on ?q=
  useEffect(() => {
    if (initialQ && !sentRef.current) {
      sentRef.current = true
      send(initialQ)
    } else if (!initialQ) {
      textareaRef.current?.focus()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const send = useCallback(async (question: string) => {
    if (!question.trim() || loading) return
    const q = question.trim()
    setInputVal('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Determine if this is a new conv or continuation
    let convId = activeConvRef.current
    let isNewConv = false
    if (!convId) {
      convId = Date.now().toString()
      isNewConv = true
      setActiveConvId(convId)
      activeConvRef.current = convId
    }

    setMessages(prev => [...prev, { role: 'user', text: q }, { role: 'typing' }])
    setLoading(true)

    try {
      const result = await api.search(q)
      setMessages(prev => {
        const next = [...prev.filter(m => m.role !== 'typing'), { role: 'assistant' as const, result }]
        // Persist to localStorage
        const storedMsgs = next as StoredMsg[]
        const conv: StoredConv = {
          id: convId!,
          title: isNewConv ? q.slice(0, 60) : (loadConversations().find(c => c.id === convId!)?.title ?? q.slice(0, 60)),
          createdAt: isNewConv ? Date.now() : (loadConversations().find(c => c.id === convId!)?.createdAt ?? Date.now()),
          messages: storedMsgs,
        }
        const updated = upsertConv(loadConversations(), conv)
        saveConversations(updated)
        setConversations(updated)
        return next
      })
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes('429')
      const errMsg: ErrMsg = {
        role: 'error',
        text: is429 ? 'Trop de questions, patientez une minute.' : 'Erreur de connexion. Réessayez.',
      }
      setMessages(prev => {
        const next = [...prev.filter(m => m.role !== 'typing'), errMsg]
        // Still persist what we have (user msg + error)
        const storedMsgs = next as StoredMsg[]
        if (isNewConv) {
          const conv: StoredConv = { id: convId!, title: q.slice(0, 60), createdAt: Date.now(), messages: storedMsgs }
          const updated = upsertConv(loadConversations(), conv)
          saveConversations(updated)
          setConversations(updated)
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [loading])

  const newChat = useCallback(() => {
    setMessages([])
    setInputVal('')
    setActiveConvId(null)
    activeConvRef.current = null
    textareaRef.current?.focus()
  }, [])

  const restoreConv = useCallback((conv: StoredConv) => {
    setActiveConvId(conv.id)
    activeConvRef.current = conv.id
    setMessages(conv.messages as Message[])
  }, [])

  const handleTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputVal(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(inputVal)
    }
  }

  const copyLastAnswer = useCallback(() => {
    const last = [...messages].reverse().find(m => m.role === 'assistant') as AsstMsg | undefined
    if (!last) return
    navigator.clipboard.writeText(last.result.answer).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }, [messages])

  const hasMessages = messages.length > 0
  const canSend = inputVal.trim().length > 0 && !loading
  const dk = darkMode
  const bg0  = dk ? '#0B1525' : '#fff'
  const bg1  = dk ? '#111C35' : '#F7F8FA'
  const bdr  = dk ? 'rgba(255,255,255,0.07)' : '#F0F0F2'
  const txt1 = dk ? 'rgba(255,255,255,0.90)' : '#1B2B50'
  const txt2 = dk ? 'rgba(255,255,255,0.45)' : '#6B7280'
  const txt3 = dk ? 'rgba(255,255,255,0.26)' : '#9CA3AF'

  const SUGGESTIONS = [
    { q: 'Quels groupes ont voté contre la réforme des retraites ?', iconBg: '#EFF3FB',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B2B50" strokeWidth="2.1" strokeLinecap="round"><path d="m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg> },
    { q: "Quel est le taux d'absentéisme au groupe RN ?", iconBg: '#FEF9C3',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#B45309" strokeWidth="2.1" strokeLinecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
    { q: 'Comparer les votes climatiques par groupe politique', iconBg: '#DCFCE7',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.1" strokeLinecap="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg> },
    { q: 'Marine Le Pen : bilan de votes 2024', iconBg: '#FDE8E7',
      icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9302A" strokeWidth="2.1" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
  ]

  // Group conversations for sidebar
  const groupedConvs: Array<{ group: string; convs: StoredConv[] }> = []
  for (const conv of conversations) {
    const label = groupLabel(conv.createdAt)
    const existing = groupedConvs.find(g => g.group === label)
    if (existing) existing.convs.push(conv)
    else groupedConvs.push({ group: label, convs: [conv] })
  }

  return (
    <div style={{ display: 'flex', height: 'calc(100dvh - 4rem)', overflow: 'hidden', fontFamily: 'var(--font-sans)', background: bg0 }}>

      {/* ══════════ SIDEBAR ══════════ */}
      <div style={{ width: 260, flexShrink: 0, background: '#111C35', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} className="hidden md:flex">

        {/* New chat button */}
        <div style={{ padding: '16px 16px 12px', flexShrink: 0 }}>
          <button
            onClick={newChat}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.13)', color: 'rgba(255,255,255,0.9)', padding: '9px 13px', borderRadius: 8, fontSize: 13.5, fontWeight: 500, cursor: 'pointer', transition: 'background 140ms', width: '100%' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.16)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.09)')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            Nouvelle conversation
          </button>
        </div>

        {/* Conversation list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px', scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.14) transparent' }}>
          {conversations.length === 0 ? (
            <div style={{ padding: '20px 10px', fontSize: 12, color: 'rgba(255,255,255,0.24)', lineHeight: 1.5 }}>
              Vos conversations apparaîtront ici.
            </div>
          ) : (
            groupedConvs.map(({ group, convs: gConvs }) => (
              <div key={group}>
                <div style={{ padding: '14px 8px 5px', fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)' }}>
                  {group}
                </div>
                {gConvs.map(conv => {
                  const active = activeConvId === conv.id
                  return (
                    <button
                      key={conv.id}
                      onClick={() => restoreConv(conv)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, cursor: 'pointer', transition: 'background 120ms', background: active ? 'rgba(255,255,255,0.11)' : 'transparent', border: 'none' }}
                      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.07)' }}
                      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ fontSize: 13, color: active ? '#fff' : 'rgba(255,255,255,0.66)', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.35 }}>
                        {conv.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.27)', marginTop: 2 }}>
                        {relativeTime(conv.createdAt)}
                      </div>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* User footer */}
        <div style={{ flexShrink: 0, padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 999, background: '#E0786E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0 }}>U</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.88)' }}>Utilisateur</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.36)' }}>Plan gratuit</div>
            </div>
            <button
              onClick={toggleDark}
              title={dk ? 'Mode clair' : 'Mode sombre'}
              style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', color: 'rgba(255,255,255,0.35)', transition: 'color 140ms' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.70)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
            >
              {dk ? (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ══════════ MAIN ══════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: bg0 }}>

        {/* Top bar */}
        <div style={{ height: 54, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', borderBottom: `1px solid ${bdr}`, background: bg0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: txt1, letterSpacing: '-0.01em' }}>Chat IA</span>
            <span style={{ background: dk ? 'rgba(255,255,255,0.08)' : '#EFF3FB', color: dk ? 'rgba(255,255,255,0.55)' : '#1B2B50', border: `1px solid ${dk ? 'rgba(255,255,255,0.10)' : 'rgba(27,43,80,0.12)'}`, fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, letterSpacing: '0.03em' }}>
              MonÉlu · Beta
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: txt3 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth="2.2" strokeLinecap="round">
              <path d="m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/>
            </svg>
            <span style={{ color: dk ? 'rgba(255,255,255,0.38)' : '#4B5563' }}>Données officielles · Assemblée nationale</span>
          </div>
        </div>

        {/* Scroll area */}
        <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', scrollbarWidth: 'thin', scrollbarColor: dk ? 'rgba(255,255,255,0.09) transparent' : 'rgba(0,0,0,0.10) transparent' }}>

          {/* Empty state */}
          {!hasMessages && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 32px', minHeight: '100%' }}>
              <svg width="56" height="40" viewBox="0 0 30 22" fill="none" style={{ marginBottom: 18 }}>
                <path d="M2 19 A13 13 0 0 1 28 19" stroke={dk ? 'rgba(255,255,255,0.85)' : '#1B2B50'} strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M6 19 A9 9 0 0 1 24 19" stroke="#9CA3AF" strokeWidth="2.2" strokeLinecap="round"/>
                <path d="M10 19 A5 5 0 0 1 20 19" stroke="#D93025" strokeWidth="2.2" strokeLinecap="round"/>
                <circle cx="15" cy="19" r="2.3" fill={dk ? 'rgba(255,255,255,0.85)' : '#1B2B50'}/>
              </svg>
              <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 800, color: txt1, margin: '0 0 10px', textAlign: 'center', letterSpacing: '-0.02em' }}>
                Explorez les données de vos élus
              </h2>
              <p style={{ fontSize: 15, color: txt2, textAlign: 'center', maxWidth: 400, margin: '0 0 36px', lineHeight: 1.65 }}>
                Posez une question sur les votes, l&apos;absentéisme ou le bilan de n&apos;importe quel député de la XVII<sup>e</sup> législature.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', maxWidth: 620 }}>
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => send(s.q)}
                    style={{ background: dk ? '#0F1929' : '#FAFAFA', border: `1.5px solid ${dk ? 'rgba(255,255,255,0.07)' : '#E8EAED'}`, borderRadius: 12, padding: '15px 16px', cursor: 'pointer', transition: 'border-color 150ms, box-shadow 150ms', textAlign: 'left' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = dk ? 'rgba(255,255,255,0.18)' : '#1B2B50'; e.currentTarget.style.boxShadow = dk ? '0 2px 10px rgba(0,0,0,0.30)' : '0 2px 10px rgba(27,43,80,0.09)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = dk ? 'rgba(255,255,255,0.07)' : '#E8EAED'; e.currentTarget.style.boxShadow = 'none' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: s.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{s.icon}</div>
                      <span style={{ fontSize: 13, color: dk ? 'rgba(255,255,255,0.78)' : '#1B2B50', lineHeight: 1.55, fontWeight: 500 }}>{s.q}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {hasMessages && (
            <div style={{ padding: '32px 32px 16px', maxWidth: 760, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
              {messages.map((msg, i) => {
                if (msg.role === 'user') return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
                    <div style={{ maxWidth: '74%', background: dk ? '#1E3360' : '#1B2B50', color: '#fff', padding: '13px 18px', borderRadius: '18px 18px 5px 18px', fontSize: 15, lineHeight: 1.65 }}>
                      {msg.text}
                    </div>
                  </div>
                )

                if (msg.role === 'typing') return (
                  <div key={i} style={{ display: 'flex', gap: 13, marginBottom: 28, alignItems: 'flex-start' }}>
                    <AiAvatar />
                    <div style={{ background: bg1, border: `1px solid ${dk ? 'rgba(255,255,255,0.07)' : '#EDEEF0'}`, borderRadius: '5px 18px 18px 18px', padding: '15px 20px', display: 'flex', gap: 5, alignItems: 'center', marginTop: 2 }}>
                      <Dot delay="0ms" color={dk ? 'rgba(255,255,255,0.28)' : '#C4C8CF'} />
                      <Dot delay="180ms" color={dk ? 'rgba(255,255,255,0.28)' : '#C4C8CF'} />
                      <Dot delay="360ms" color={dk ? 'rgba(255,255,255,0.28)' : '#C4C8CF'} />
                    </div>
                  </div>
                )

                if (msg.role === 'error') return (
                  <div key={i} style={{ display: 'flex', gap: 13, marginBottom: 28, alignItems: 'flex-start' }}>
                    <AiAvatar />
                    <div style={{ flex: 1, marginTop: 4, fontSize: 15, lineHeight: 1.75, color: '#DC2626' }}>{msg.text}</div>
                  </div>
                )

                if (msg.role === 'assistant') {
                  const sources = (msg.result.sources || []).slice(0, 3).map(mapSource)
                  return (
                    <div key={i} style={{ display: 'flex', gap: 13, marginBottom: 28, alignItems: 'flex-start' }}>
                      <AiAvatar />
                      <div style={{ flex: 1, minWidth: 0, marginTop: 4 }}>
                        <div style={{ fontSize: 15, lineHeight: 1.75, color: dk ? 'rgba(255,255,255,0.85)' : '#1F2937' }} dangerouslySetInnerHTML={{ __html: mdToHtml(msg.result.answer) }} />
                        {sources.length > 0 && (
                          <div style={{ marginTop: 18 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: txt3, marginBottom: 9 }}>Sources</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {sources.map((src, si) => (
                                <div key={si} style={{ display: 'flex', alignItems: 'center', gap: 10, background: dk ? '#162035' : '#fff', border: `1px solid ${dk ? 'rgba(255,255,255,0.08)' : '#E8EAED'}`, borderRadius: 9, padding: '9px 13px', maxWidth: 280, boxShadow: dk ? 'none' : '0 1px 3px rgba(0,0,0,0.05)' }}>
                                  <div style={{ width: 9, height: 9, borderRadius: 999, background: src.dot, flexShrink: 0 }} />
                                  <div style={{ minWidth: 0, flex: 1 }}>
                                    <div style={{ fontSize: 12.5, fontWeight: 600, color: txt1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.label}</div>
                                    {src.sub && <div style={{ fontSize: 11, color: txt3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.sub}</div>}
                                  </div>
                                  {src.badge && <div style={{ flexShrink: 0, background: src.badgeBg, color: src.badgeColor, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>{src.badge}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 4, marginTop: 14 }}>
                          <ActionBtn onClick={copyLastAnswer} dark={dk}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            {copied ? 'Copié !' : 'Copier'}
                          </ActionBtn>
                          <ActionBtn dark={dk}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <path d="M7 11 C7 7.13 10.13 4 14 4 C17.87 4 21 7.13 21 11 C21 14.87 17.87 18 14 18 L7 18 L3 22 L3 11 Z"/>
                            </svg>
                            Feedback
                          </ActionBtn>
                        </div>
                      </div>
                    </div>
                  )
                }

                return null
              })}
            </div>
          )}
        </div>

        {/* Input bar */}
        <div style={{ flexShrink: 0, padding: '12px 28px 20px', background: bg0 }}>
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div style={{ background: bg1, border: `1.5px solid ${dk ? 'rgba(255,255,255,0.10)' : '#E2E4E8'}`, borderRadius: 14, padding: '13px 14px 10px' }}>
              <textarea
                ref={textareaRef}
                value={inputVal}
                onChange={handleTextarea}
                onKeyDown={handleKey}
                placeholder="Posez une question sur vos élus…"
                rows={1}
                style={{ resize: 'none', outline: 'none', border: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 15, color: dk ? 'rgba(255,255,255,0.88)' : '#1B2B50', width: '100%', display: 'block', lineHeight: 1.6, maxHeight: 140, overflowY: 'auto' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: txt3 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m9 12 2 2 4-4m6 2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/></svg>
                    Données officielles
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: txt3 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    XVII<sup style={{ fontSize: 9 }}>e</sup> législature
                  </span>
                </div>
                <button
                  onClick={() => send(inputVal)}
                  disabled={!canSend}
                  style={{ width: 34, height: 34, borderRadius: 9, background: canSend ? '#1B2B50' : (dk ? '#1E2D4A' : '#D1D5DB'), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canSend ? 'pointer' : 'default', transition: 'background 150ms', flexShrink: 0, border: 'none' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 2L11 13"/><path d="M22 2 15 22 11 13 2 9l20-7z"/>
                  </svg>
                </button>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 9, fontSize: 11.5, color: dk ? 'rgba(255,255,255,0.18)' : '#9CA3AF' }}>
              MonÉlu peut faire des erreurs. Vérifiez les informations importantes sur{' '}
              <a href="https://assemblee-nationale.fr" target="_blank" rel="noopener noreferrer" style={{ color: dk ? '#F87167' : '#C9302A', textDecoration: 'none' }}>
                assemblee-nationale.fr
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function AiAvatar() {
  return (
    <div style={{ width: 30, height: 30, borderRadius: 999, background: '#1B2B50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
      <svg width="15" height="11" viewBox="0 0 30 22" fill="none">
        <path d="M2 19 A13 13 0 0 1 28 19" stroke="#fff" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M6 19 A9 9 0 0 1 24 19" stroke="rgba(255,255,255,0.44)" strokeWidth="2.4" strokeLinecap="round"/>
        <path d="M10 19 A5 5 0 0 1 20 19" stroke="#D93025" strokeWidth="2.4" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

function Dot({ delay, color }: { delay: string; color: string }) {
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 999, background: color, animation: 'monelu-bounce 1.3s ease infinite', animationDelay: delay }} />
}

function ActionBtn({ children, onClick, dark }: { children: React.ReactNode; onClick?: () => void; dark: boolean }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: hover ? (dark ? 'rgba(255,255,255,0.70)' : '#1B2B50') : (dark ? 'rgba(255,255,255,0.26)' : '#9CA3AF'), cursor: 'pointer', padding: '5px 9px', borderRadius: 6, transition: 'background 120ms, color 120ms', background: hover ? (dark ? 'rgba(255,255,255,0.06)' : '#F9FAFB') : 'transparent', border: 'none' }}
    >
      {children}
    </button>
  )
}

function KeyframeStyle() {
  return <style>{`@keyframes monelu-bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-5px)}}`}</style>
}

export default function ChatPage() {
  return (
    <>
      <KeyframeStyle />
      <Suspense fallback={<div style={{ padding: 32, color: '#9CA3AF', fontSize: 14 }}>Chargement…</div>}>
        <ChatInner />
      </Suspense>
    </>
  )
}
