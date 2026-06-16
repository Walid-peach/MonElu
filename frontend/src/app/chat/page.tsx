'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { CHAT_SUGGESTIONS } from '@/lib/chat-suggestions'
import { UserBubble, AssistantBubble, ErrorBubble, TypingIndicator } from '@/components/chat/Bubbles'
import type { SearchResult } from '@/lib/api'

type Message =
  | { role: 'user'; text: string }
  | { role: 'assistant'; result: SearchResult }
  | { role: 'error'; text: string }

function ChatInner() {
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') || ''

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState(initialQ)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const sentInitialRef = useRef(false)

  // Auto-send when arriving with ?q=
  useEffect(() => {
    if (initialQ && !sentInitialRef.current) {
      sentInitialRef.current = true
      send(initialQ)
    } else if (!initialQ) {
      inputRef.current?.focus()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(question: string) {
    if (!question.trim() || loading) return
    const q = question.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: q }])
    setLoading(true)
    try {
      const result = await api.search(q)
      setMessages(prev => [...prev, { role: 'assistant', result }])
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes('429')
      setMessages(prev => [
        ...prev,
        {
          role: 'error',
          text: is429
            ? 'Trop de questions, patientez une minute.'
            : 'Erreur de connexion. Réessayez.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-2xl mx-auto">
      {/* Header */}
      <div className="px-4 md:px-8 pt-6 pb-3 border-b border-gray-border bg-white flex-shrink-0">
        <h1 className="font-serif text-2xl text-navy">Chat IA</h1>
        <p className="text-xs text-gray-mid mt-0.5">Posez vos questions sur les votes et les députés</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="pt-4">
            <p className="text-sm text-gray-mid mb-4 text-center">Suggestions :</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {CHAT_SUGGESTIONS.map(s => (
                <button key={s}
                  onClick={() => send(s)}
                  disabled={loading}
                  className="text-xs border border-gray-border rounded-full px-3 py-1.5 bg-white text-navy hover:border-navy/40 transition-colors disabled:opacity-40">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'user') return <UserBubble key={i} text={msg.text} />
          if (msg.role === 'error') return <ErrorBubble key={i} text={msg.text} />
          return <AssistantBubble key={i} result={msg.result} />
        })}

        {loading && <TypingIndicator />}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-gray-border bg-white px-4 md:px-8 py-3">
        <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2">
          <label htmlFor="chat-input" className="sr-only">Posez votre question</label>
          <input
            id="chat-input"
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Posez votre question..."
            disabled={loading}
            className="flex-1 border border-gray-border rounded-xl px-4 py-2.5 text-sm bg-white focus:outline-none focus:border-navy disabled:opacity-50"
          />
          <button type="submit" disabled={loading || !input.trim()}
            className="bg-navy text-white px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-navy-light transition-colors">
            →
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="p-8 text-gray-mid text-sm">Chargement...</div>}>
      <ChatInner />
    </Suspense>
  )
}
