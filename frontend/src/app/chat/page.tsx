'use client'
import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { api, SearchResult } from '@/lib/api'
import { CHAT_SUGGESTIONS } from '@/lib/chat-suggestions'

type Message =
  | { role: 'user'; text: string }
  | { role: 'assistant'; result: SearchResult; error?: never }
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
    } catch {
      setMessages(prev => [...prev, { role: 'error', text: 'Erreur de connexion. Réessayez.' }])
    } finally {
      setLoading(false)
    }
  }

  const confidenceColor: Record<string, string> = {
    high: 'bg-emerald-100 text-emerald-800',
    medium: 'bg-amber-100 text-amber-800',
    low: 'bg-red-50 text-red-700',
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
                  className="text-xs border border-gray-border rounded-full px-3 py-1.5 bg-white text-navy hover:border-navy/40 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'user') {
            return (
              <div key={i} className="flex justify-end">
                <div className="bg-navy text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">
                  {msg.text}
                </div>
              </div>
            )
          }

          if (msg.role === 'error') {
            return (
              <div key={i} className="flex justify-start">
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%] text-sm">
                  {msg.text}
                </div>
              </div>
            )
          }

          const { result } = msg
          return (
            <div key={i} className="flex justify-start">
              <div className="bg-white border border-gray-border rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%] space-y-3">
                {/* Answer */}
                <p className="text-sm text-navy leading-relaxed whitespace-pre-wrap">{result.answer}</p>

                {/* Confidence */}
                {result.confidence && (
                  <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${confidenceColor[result.confidence] ?? 'bg-gray-light text-gray-mid'}`}>
                    {result.confidence === 'high' ? 'Haute confiance' : result.confidence === 'medium' ? 'Confiance moyenne' : 'Basse confiance'}
                  </span>
                )}

                {/* Sources — always visible */}
                {result.sources?.length > 0 && (
                  <div className="border-t border-gray-light pt-3 space-y-2">
                    <p className="text-xs font-medium text-gray-mid uppercase tracking-wide">
                      Sources ({result.sources.length})
                    </p>
                    {result.sources.slice(0, 3).map((src, j) => (
                      <div key={j} className="bg-gray-off rounded-lg p-3">
                        <p className="text-xs text-navy/70 line-clamp-2">{src.content}</p>
                        <p className="text-xs text-gray-mid mt-1">
                          Similarité {Math.round(src.similarity * 100)}%
                          {src.metadata?.chunk_type && ` · ${src.metadata.chunk_type}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-border rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 bg-gray-mid rounded-full animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

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
