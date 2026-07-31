'use client'
// Typography exception: this page uses inline styles throughout because all colors and
// sizes are computed dynamically from JS dark/light mode state (dk, txt1, txt2, bg0, …).
// Converting to Tailwind classes would require a full theme rewrite.
import { useState, useRef, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import type { SearchResult, VerifyResult } from '@/lib/api'
import { InfoTooltip } from '@/components/InfoTooltip'
import { VerdictCard } from '@/components/VerdictCard'
import { mdToHtml, mapSource, CONFIDENCE_META, CONFIDENCE_EXPLANATION } from '@/lib/chatFormat'

// ── Types ──────────────────────────────────────────────────────────────────

type ChatMode  = 'question' | 'verify'

type UserMsg    = { role: 'user'; text: string }
type AsstMsg    = { role: 'assistant'; result: SearchResult }
type VerdictMsg = { role: 'verdict'; result: VerifyResult }
type TypingMsg  = { role: 'typing'; verifying?: boolean }
type ErrMsg     = { role: 'error'; text: string }
type Message    = UserMsg | AsstMsg | VerdictMsg | TypingMsg | ErrMsg

type StoredMsg = UserMsg | AsstMsg | VerdictMsg | ErrMsg  // no typing — never persisted

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

// ── Verify mode helpers ─────────────────────────────────────────────────────

const VERIFY_MIN_LENGTH = 10
const VERIFY_MAX_LENGTH = 500
const VERIFY_EXAMPLE_CLAIM = '« Le député X a voté contre l’augmentation du SMIC »'
const VERIFY_LOADING_TEXT =
  'Recherche des scrutins correspondants et de la position enregistrée du député…'

const VERIFY_NUDGE_TEXT =
  'Cela ressemble à une affirmation - la vérifier contre les scrutins officiels ?'

// Cross-link condition: the answer cites at least one deputy chunk, so
// "vérifier cette affirmation" has a deputy record to check against.
function hasDeputySource(result: SearchResult): boolean {
  return (result.sources || []).some(src => {
    const type = src.metadata?.chunk_type
    return type === 'deputy' || type === 'notable_deputy'
  })
}

function verifyErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : ''
  if (msg.includes('429')) {
    return 'Trop de vérifications en peu de temps. Patientez une minute et réessayez.'
  }
  if (msg.includes('503')) {
    return "La vérification IA n'est pas disponible pour le moment."
  }
  return 'La vérification a échoué. Réessayez dans quelques secondes.'
}

// ── Main component ─────────────────────────────────────────────────────────

function ChatInner() {
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') || ''
  const initialClaim = searchParams.get('claim') || ''
  const initialMode: ChatMode = searchParams.get('mode') === 'verify' ? 'verify' : 'question'

  const [mode, setMode]           = useState<ChatMode>(initialMode)
  const [messages, setMessages]   = useState<Message[]>([])
  const [inputVal, setInputVal]   = useState(mode === 'verify' ? initialClaim : initialQ)
  // Tracks the URL's mode so we can detect *changes* to it during render — Nav/
  // BottomNav link into /chat?mode=verify, a same-pathname query-only navigation
  // that Next.js does not remount the page for, so `mode` would otherwise stay
  // frozen at whatever it was on first mount.
  const [syncedUrlMode, setSyncedUrlMode] = useState<ChatMode>(initialMode)
  const [loading, setLoading]     = useState(false)
  const [darkMode, setDarkMode]   = useState<boolean>(() => {
    try { return localStorage.getItem('monelu-dark') === '1' } catch { return false }
  })
  const [conversations, setConversations] = useState<StoredConv[]>(() => {
    try { return loadConversations() } catch { return [] }
  })
  const [activeConvId, setActiveConvId]   = useState<string | null>(null)
  const [copied, setCopied]       = useState(false)
  const [feedbackByMsg, setFeedbackByMsg] = useState<Record<number, 'pending' | 'up' | 'down' | 'error'>>({})
  const [shareByMsg, setShareByMsg] = useState<Record<number, 'pending' | 'shared' | 'copied' | 'error'>>({})
  // Announced to screen readers via the aria-live region below. Set only when
  // send/submitClaim actually receive a new result or error - never derived
  // from `messages` itself, so restoring a past conversation or starting a
  // new chat doesn't re-announce old content (RGAA 9.3 / WCAG 4.1.3).
  const [announcement, setAnnouncement] = useState('')

  const scrollRef     = useRef<HTMLDivElement>(null)
  const textareaRef   = useRef<HTMLTextAreaElement>(null)
  const activeConvRef = useRef<string | null>(null)  // sync for use inside callbacks
  const isNewConvRef  = useRef(false)               // sync counterpart so setMessages updater never closes over stale value
  const sentRef       = useRef(false)

  // Keep ref in sync with state
  useEffect(() => { activeConvRef.current = activeConvId }, [activeConvId])

  // Adjust mode during render when the URL's mode changes (see syncedUrlMode above).
  // This is React's documented "adjusting state when a prop changes" pattern, not a
  // side effect — it must stay outside useEffect to avoid an extra render pass.
  const urlMode: ChatMode = searchParams.get('mode') === 'verify' ? 'verify' : 'question'
  if (urlMode !== syncedUrlMode) {
    setSyncedUrlMode(urlMode)
    setMode(urlMode)
    if (urlMode === 'verify') {
      const claim = searchParams.get('claim')
      if (claim) setInputVal(claim.slice(0, VERIFY_MAX_LENGTH))
    }
  }

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

  // Auto-send on ?q= (question mode only) — verify mode pre-fills ?claim= but
  // never auto-submits: a verification writes an immutable row (ADR-022/023).
  useEffect(() => {
    if (mode === 'verify') {
      textareaRef.current?.focus()
    } else if (initialQ && !sentRef.current) {
      sentRef.current = true
      // eslint-disable-next-line react-hooks/immutability
      send(initialQ)
    } else if (!initialQ) {
      textareaRef.current?.focus()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Focus the textarea whenever mode changes post-mount (covers both the manual
  // toggle buttons and the render-time URL sync above; the mount-time case is
  // handled by the auto-send effect).
  const isFirstModeRender = useRef(true)
  useEffect(() => {
    if (isFirstModeRender.current) {
      isFirstModeRender.current = false
      return
    }
    textareaRef.current?.focus()
  }, [mode])

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const send = useCallback(async (question: string) => {
    if (!question.trim() || loading) return
    const q = question.trim()
    setInputVal('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // Determine if this is a new conv or continuation — use refs so the
    // setMessages updater below never closes over stale closure values.
    let convId = activeConvRef.current
    if (!convId) {
      convId = Date.now().toString()
      isNewConvRef.current = true
      setActiveConvId(convId)
      activeConvRef.current = convId
    } else {
      isNewConvRef.current = false
    }

    setMessages(prev => [...prev, { role: 'user', text: q }, { role: 'typing' }])
    setLoading(true)

    try {
      const result = await api.search(q)
      // Read localStorage once, outside the updater, to avoid repeated I/O
      // and to ensure the snapshot is consistent for title/createdAt lookups.
      const id = activeConvRef.current!
      const isNew = isNewConvRef.current
      const existingConvs = loadConversations()
      const existing = existingConvs.find(c => c.id === id)
      setAnnouncement(`Nouvelle réponse : ${result.answer.slice(0, 200)}`)
      setMessages(prev => {
        const next = [...prev.filter(m => m.role !== 'typing'), { role: 'assistant' as const, result }]
        const conv: StoredConv = {
          id,
          title: isNew ? q.slice(0, 60) : (existing?.title ?? q.slice(0, 60)),
          createdAt: isNew ? Date.now() : (existing?.createdAt ?? Date.now()),
          messages: next as StoredMsg[],
        }
        const updated = upsertConv(existingConvs, conv)
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
      const id = activeConvRef.current!
      const isNew = isNewConvRef.current
      const existingConvs = isNew ? loadConversations() : null
      setAnnouncement(errMsg.text)
      setMessages(prev => {
        const next = [...prev.filter(m => m.role !== 'typing'), errMsg]
        if (isNew && existingConvs) {
          const conv: StoredConv = { id, title: q.slice(0, 60), createdAt: Date.now(), messages: next as StoredMsg[] }
          const updated = upsertConv(existingConvs, conv)
          saveConversations(updated)
          setConversations(updated)
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [loading])

  const submitClaim = useCallback(async (claimRaw: string) => {
    const claim = claimRaw.trim()
    if (claim.length < VERIFY_MIN_LENGTH || loading) return
    setInputVal('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    let convId = activeConvRef.current
    if (!convId) {
      convId = Date.now().toString()
      isNewConvRef.current = true
      setActiveConvId(convId)
      activeConvRef.current = convId
    } else {
      isNewConvRef.current = false
    }

    setMessages(prev => [...prev, { role: 'user', text: claim }, { role: 'typing', verifying: true }])
    setLoading(true)

    try {
      const result = await api.verify(claim)
      const id = activeConvRef.current!
      const isNew = isNewConvRef.current
      const existingConvs = loadConversations()
      const existing = existingConvs.find(c => c.id === id)
      setAnnouncement(`Vérification terminée : ${result.verdict}`)
      setMessages(prev => {
        const next = [...prev.filter(m => m.role !== 'typing'), { role: 'verdict' as const, result }]
        const conv: StoredConv = {
          id,
          title: isNew ? claim.slice(0, 60) : (existing?.title ?? claim.slice(0, 60)),
          createdAt: isNew ? Date.now() : (existing?.createdAt ?? Date.now()),
          messages: next as StoredMsg[],
        }
        const updated = upsertConv(existingConvs, conv)
        saveConversations(updated)
        setConversations(updated)
        return next
      })
    } catch (err) {
      const errMsg: ErrMsg = { role: 'error', text: verifyErrorMessage(err) }
      const id = activeConvRef.current!
      const isNew = isNewConvRef.current
      const existingConvs = isNew ? loadConversations() : null
      setAnnouncement(errMsg.text)
      setMessages(prev => {
        const next = [...prev.filter(m => m.role !== 'typing'), errMsg]
        if (isNew && existingConvs) {
          const conv: StoredConv = { id, title: claim.slice(0, 60), createdAt: Date.now(), messages: next as StoredMsg[] }
          const updated = upsertConv(existingConvs, conv)
          saveConversations(updated)
          setConversations(updated)
        }
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [loading])

  const submit = useCallback(() => {
    if (mode === 'verify') submitClaim(inputVal)
    else send(inputVal)
  }, [mode, inputVal, submitClaim, send])

  // Nudge chip (ADR-023): explicit click switches to verify mode and submits
  // the user's original text through POST /verify/. This is the only path
  // from a nudge to a verification - never automatic.
  const verifyNow = useCallback((claim: string) => {
    setMode('verify')
    submitClaim(claim)
  }, [submitClaim])

  // Cross-link action: pre-fill only, no auto-submit (ADR-022/023 - a
  // verification writes an immutable row, so submission stays a user action).
  const prefillVerify = useCallback((claim: string) => {
    setMode('verify')
    setInputVal(claim.slice(0, VERIFY_MAX_LENGTH))
  }, [])

  const newChat = useCallback(() => {
    setMessages([])
    setFeedbackByMsg({})
    setInputVal('')
    setActiveConvId(null)
    activeConvRef.current = null
    setAnnouncement('')
    textareaRef.current?.focus()
  }, [])

  const restoreConv = useCallback((conv: StoredConv) => {
    setActiveConvId(conv.id)
    setMessages(conv.messages as Message[])
    setFeedbackByMsg({})
    setAnnouncement('')
  }, [])

  const handleTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = mode === 'verify' ? e.target.value.slice(0, VERIFY_MAX_LENGTH) : e.target.value
    setInputVal(value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 140) + 'px'
  }

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
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

  const submitFeedback = useCallback((i: number, vote: 'up' | 'down', result: SearchResult) => {
    setFeedbackByMsg(prev => ({ ...prev, [i]: 'pending' }))
    api.feedback.chat(vote, result.question, result.answer, result.sources)
      .then(() => setFeedbackByMsg(prev => ({ ...prev, [i]: vote })))
      .catch(() => setFeedbackByMsg(prev => ({ ...prev, [i]: 'error' })))
  }, [])

  const shareAnswer = useCallback(async (i: number, result: SearchResult) => {
    setShareByMsg(prev => ({ ...prev, [i]: 'pending' }))
    try {
      const share = await api.shareAnswer(result)
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({ url: share.share_url, title: 'Réponse MonÉlu', text: result.question })
          setShareByMsg(prev => ({ ...prev, [i]: 'shared' }))
          setTimeout(() => setShareByMsg(prev => { const next = { ...prev }; delete next[i]; return next }), 2000)
          return
        } catch (err) {
          if (err instanceof Error && err.name === 'AbortError') {
            setShareByMsg(prev => { const next = { ...prev }; delete next[i]; return next })
            return
          }
        }
      }
      await navigator.clipboard.writeText(share.share_url)
      setShareByMsg(prev => ({ ...prev, [i]: 'copied' }))
      setTimeout(() => setShareByMsg(prev => { const next = { ...prev }; delete next[i]; return next }), 2000)
    } catch {
      setShareByMsg(prev => ({ ...prev, [i]: 'error' }))
    }
  }, [])

  const hasMessages = messages.length > 0
  const tooShortForVerify = mode === 'verify' && inputVal.trim().length < VERIFY_MIN_LENGTH
  const canSend = inputVal.trim().length > 0 && !loading && !tooShortForVerify
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

      {/* Screen-reader announcement of new assistant/verdict/error messages only —
          never the full conversation (RGAA 9.3 / WCAG 4.1.3). */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* ══════════ SIDEBAR ══════════ */}
      <div style={{ width: 260, flexShrink: 0, background: '#111C35', flexDirection: 'column', overflow: 'hidden' }} className="hidden md:flex">

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
              {mode === 'verify' ? (
                <>
                  <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: 24, fontWeight: 800, color: txt1, margin: '0 0 10px', textAlign: 'center', letterSpacing: '-0.02em' }}>
                    Vérifiez une affirmation
                  </h2>
                  <p style={{ fontSize: 15, color: txt2, textAlign: 'center', maxWidth: 440, margin: '0 0 8px', lineHeight: 1.65 }}>
                    Collez une affirmation lue sur les réseaux sociaux — par exemple {VERIFY_EXAMPLE_CLAIM} —
                    et confrontez-la aux votes réellement enregistrés à l&apos;Assemblée Nationale.
                  </p>
                  <button
                    onClick={() => setMode('question')}
                    style={{ marginTop: 20, fontSize: 13, color: txt2, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    ← Revenir au mode question
                  </button>
                </>
              ) : (
                <>
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
                  <button
                    onClick={() => setMode('verify')}
                    style={{ marginTop: 28, fontSize: 13, color: txt2, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Vous voulez vérifier une affirmation précise ? Essayez « Vérifier une affirmation » →
                  </button>
                </>
              )}
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
                    {msg.verifying ? (
                      <div style={{ background: bg1, border: `1px solid ${dk ? 'rgba(255,255,255,0.07)' : '#EDEEF0'}`, borderRadius: '5px 18px 18px 18px', padding: '15px 20px', marginTop: 2, fontSize: 13.5, color: txt2 }} role="status">
                        {VERIFY_LOADING_TEXT}
                      </div>
                    ) : (
                      <div style={{ background: bg1, border: `1px solid ${dk ? 'rgba(255,255,255,0.07)' : '#EDEEF0'}`, borderRadius: '5px 18px 18px 18px', padding: '15px 20px', display: 'flex', gap: 5, alignItems: 'center', marginTop: 2 }}>
                        <Dot delay="0ms" color={dk ? 'rgba(255,255,255,0.28)' : '#C4C8CF'} />
                        <Dot delay="180ms" color={dk ? 'rgba(255,255,255,0.28)' : '#C4C8CF'} />
                        <Dot delay="360ms" color={dk ? 'rgba(255,255,255,0.28)' : '#C4C8CF'} />
                      </div>
                    )}
                  </div>
                )

                if (msg.role === 'verdict') return (
                  <div key={i} style={{ display: 'flex', gap: 13, marginBottom: 28, alignItems: 'flex-start' }}>
                    <AiAvatar />
                    <div style={{ flex: 1, minWidth: 0, marginTop: 4 }}>
                      <VerdictCard result={msg.result} />
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
                  const conf = CONFIDENCE_META[msg.result.confidence]
                  // Length-gated so the chip never offers a submission /verify/
                  // would reject (min 10, max 500) - the claim is sent verbatim,
                  // never truncated.
                  const nudgeClaimLen = (msg.result.question || '').trim().length
                  const showNudge =
                    msg.result.suggested_action === 'verify' &&
                    nudgeClaimLen >= VERIFY_MIN_LENGTH &&
                    nudgeClaimLen <= VERIFY_MAX_LENGTH
                  const showVerifyAction = hasDeputySource(msg.result)
                  return (
                    <div key={i} style={{ display: 'flex', gap: 13, marginBottom: 28, alignItems: 'flex-start' }}>
                      <AiAvatar />
                      <div style={{ flex: 1, minWidth: 0, marginTop: 4 }}>
                        {conf && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, letterSpacing: '0.02em', background: dk ? conf.bgDark : conf.bg, color: dk ? conf.colorDark : conf.color }}>
                              {conf.label}
                            </span>
                            <InfoTooltip text={CONFIDENCE_EXPLANATION} ariaLabel="Qu'est-ce que la confiance ?" />
                          </div>
                        )}
                        <div style={{ fontSize: 15, lineHeight: 1.75, color: dk ? 'rgba(255,255,255,0.85)' : '#1F2937' }} dangerouslySetInnerHTML={{ __html: mdToHtml(msg.result.answer) }} />
                        {msg.result.caveat && (
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 12, padding: '9px 12px', borderRadius: 8, background: dk ? 'rgba(251,191,36,0.10)' : '#FFFBEB', border: `1px solid ${dk ? 'rgba(251,191,36,0.22)' : '#FDE68A'}` }}>
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={dk ? '#FBBF24' : '#B45309'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                              <line x1="12" y1="9" x2="12" y2="13" />
                              <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            <span style={{ fontSize: 12.5, lineHeight: 1.55, color: dk ? 'rgba(255,255,255,0.75)' : '#92400E' }}>{msg.result.caveat}</span>
                          </div>
                        )}
                        {sources.length > 0 && (
                          <div style={{ marginTop: 18 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: txt3, marginBottom: 9 }}>Sources</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                              {sources.map((src, si) => {
                                const cardStyle = { display: 'flex', alignItems: 'center', gap: 10, background: dk ? '#162035' : '#fff', border: `1px solid ${dk ? 'rgba(255,255,255,0.08)' : '#E8EAED'}`, borderRadius: 9, padding: '9px 13px', maxWidth: 280, boxShadow: dk ? 'none' : '0 1px 3px rgba(0,0,0,0.05)' } as const
                                const inner = (
                                  <>
                                    <div style={{ width: 9, height: 9, borderRadius: 999, background: src.dot, flexShrink: 0 }} />
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                      <div style={{ fontSize: 12.5, fontWeight: 600, color: txt1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.label}</div>
                                      {src.sub && <div style={{ fontSize: 11, color: txt3, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{src.sub}</div>}
                                    </div>
                                    {src.badge && <div style={{ flexShrink: 0, background: src.badgeBg, color: src.badgeColor, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 999, whiteSpace: 'nowrap', letterSpacing: '0.02em' }}>{src.badge}</div>}
                                  </>
                                )
                                return src.href ? (
                                  <Link key={si} href={src.href} style={{ ...cardStyle, textDecoration: 'none', cursor: 'pointer' }}>{inner}</Link>
                                ) : (
                                  <div key={si} style={cardStyle}>{inner}</div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                        {showNudge && (
                          <button
                            onClick={() => verifyNow(msg.result.question)}
                            disabled={loading}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14,
                              padding: '8px 14px', borderRadius: 999, cursor: loading ? 'default' : 'pointer',
                              fontSize: 12.5, fontWeight: 600, textAlign: 'left', lineHeight: 1.45,
                              background: dk ? 'rgba(21,128,61,0.14)' : '#F0FDF4',
                              border: `1.5px solid ${dk ? 'rgba(74,222,128,0.30)' : '#BBF7D0'}`,
                              color: dk ? '#4ADE80' : '#15803D',
                              transition: 'background 140ms',
                            }}
                            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = dk ? 'rgba(21,128,61,0.24)' : '#DCFCE7' }}
                            onMouseLeave={e => (e.currentTarget.style.background = dk ? 'rgba(21,128,61,0.14)' : '#F0FDF4')}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0 }}>
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                              <path d="m9 12 2 2 4-4"/>
                            </svg>
                            {VERIFY_NUDGE_TEXT}
                          </button>
                        )}
                        <div style={{ display: 'flex', gap: 4, marginTop: 14, flexWrap: 'wrap' }}>
                          <ActionBtn onClick={copyLastAnswer} dark={dk}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                            </svg>
                            {copied ? 'Copié !' : 'Copier'}
                          </ActionBtn>
                          <ActionBtn
                            onClick={() => shareAnswer(i, msg.result)}
                            dark={dk}
                          >
                            {shareByMsg[i] === 'pending' ? (
                              'Partage…'
                            ) : shareByMsg[i] === 'shared' ? (
                              'Partagé !'
                            ) : shareByMsg[i] === 'copied' ? (
                              'Copié !'
                            ) : shareByMsg[i] === 'error' ? (
                              'Erreur, réessayez'
                            ) : (
                              <>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                                  <polyline points="16 6 12 2 8 6" />
                                  <line x1="12" y1="2" x2="12" y2="15" />
                                </svg>
                                Partager
                              </>
                            )}
                          </ActionBtn>
                          {showVerifyAction && (
                            <ActionBtn onClick={() => prefillVerify(msg.result.question)} dark={dk}>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                                <path d="m9 12 2 2 4-4"/>
                              </svg>
                              Vérifier cette affirmation
                            </ActionBtn>
                          )}
                          {feedbackByMsg[i] === 'pending' && (
                            <span style={{ fontSize: 12, color: txt3, padding: '5px 9px' }}>Envoi…</span>
                          )}
                          {(feedbackByMsg[i] === 'up' || feedbackByMsg[i] === 'down') && (
                            <span style={{ fontSize: 12, color: txt3, padding: '5px 9px' }}>Merci pour votre retour !</span>
                          )}
                          {feedbackByMsg[i] === 'error' && (
                            <ActionBtn onClick={() => setFeedbackByMsg(prev => { const next = { ...prev }; delete next[i]; return next })} dark={dk}>
                              Erreur, réessayez
                            </ActionBtn>
                          )}
                          {feedbackByMsg[i] === undefined && (
                            <>
                              <ActionBtn onClick={() => submitFeedback(i, 'up', msg.result)} dark={dk}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                                </svg>
                              </ActionBtn>
                              <ActionBtn onClick={() => submitFeedback(i, 'down', msg.result)} dark={dk}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
                                </svg>
                              </ActionBtn>
                            </>
                          )}
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
            <div style={{ display: 'inline-flex', padding: 3, borderRadius: 999, background: dk ? 'rgba(255,255,255,0.06)' : '#F0F1F4', marginBottom: 9 }}>
              {(['question', 'verify'] as const).map(m => {
                const active = mode === m
                return (
                  <button
                    key={m}
                    onClick={() => {
                      setMode(m)
                      if (m === 'verify') setInputVal(v => v.slice(0, VERIFY_MAX_LENGTH))
                    }}
                    style={{
                      fontSize: 12.5, fontWeight: 600, padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer',
                      background: active ? (dk ? '#1E3360' : '#1B2B50') : 'transparent',
                      color: active ? '#fff' : txt2,
                      transition: 'background 140ms, color 140ms',
                    }}
                  >
                    {m === 'question' ? 'Question' : 'Vérifier'}
                  </button>
                )
              })}
            </div>
            <div style={{ background: bg1, border: `1.5px solid ${dk ? 'rgba(255,255,255,0.10)' : '#E2E4E8'}`, borderRadius: 14, padding: '13px 14px 10px' }}>
              <textarea
                ref={textareaRef}
                value={inputVal}
                onChange={handleTextarea}
                onKeyDown={handleKey}
                placeholder={mode === 'verify' ? "Le député X a voté contre l'augmentation du SMIC…" : 'Posez une question sur vos élus…'}
                aria-label={mode === 'verify' ? 'Affirmation à vérifier' : 'Votre question'}
                rows={1}
                style={{ resize: 'none', border: 'none', background: 'transparent', fontFamily: 'var(--font-sans)', fontSize: 15, color: dk ? 'rgba(255,255,255,0.88)' : '#1B2B50', width: '100%', display: 'block', lineHeight: 1.6, maxHeight: 140, overflowY: 'auto' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                {mode === 'verify' ? (
                  <span style={{ fontSize: 11.5, color: tooShortForVerify && inputVal.length > 0 ? '#DC2626' : txt3 }}>
                    {inputVal.length}/{VERIFY_MAX_LENGTH}
                  </span>
                ) : (
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
                )}
                <button
                  onClick={submit}
                  disabled={!canSend}
                  aria-label={mode === 'verify' ? "Envoyer l'affirmation à vérifier" : 'Envoyer la question'}
                  style={{ width: 34, height: 34, borderRadius: 9, background: canSend ? '#1B2B50' : (dk ? '#1E2D4A' : '#D1D5DB'), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canSend ? 'pointer' : 'default', transition: 'background 150ms', flexShrink: 0, border: 'none' }}
                >
                  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
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
    <div style={{ width: 36, height: 36, borderRadius: 999, background: '#1B2B50', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
      <svg width="22" height="16" viewBox="0 0 30 22" fill="none">
        <path d="M2 19 A13 13 0 0 1 28 19" stroke="#fff" strokeWidth="2.6" strokeLinecap="round"/>
        <path d="M6 19 A9 9 0 0 1 24 19" stroke="rgba(255,255,255,0.45)" strokeWidth="2.6" strokeLinecap="round"/>
        <path d="M10 19 A5 5 0 0 1 20 19" stroke="#D93025" strokeWidth="2.6" strokeLinecap="round"/>
        <circle cx="15" cy="19" r="2" fill="#fff"/>
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
