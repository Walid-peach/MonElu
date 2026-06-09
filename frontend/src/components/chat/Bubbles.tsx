import type { SearchResult } from '@/lib/api'

const confidenceColor: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-red-50 text-red-700',
}

const confidenceLabel: Record<string, string> = {
  high: 'Haute confiance',
  medium: 'Confiance moyenne',
  low: 'Basse confiance',
}

export function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end">
      <div className="bg-navy text-white rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-[80%] text-sm">
        {text}
      </div>
    </div>
  )
}

export function AssistantBubble({ result }: { result: SearchResult }) {
  return (
    <div className="flex justify-start">
      <div className="bg-white border border-gray-border rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%] space-y-3">
        <p className="text-sm text-navy leading-relaxed whitespace-pre-wrap">{result.answer}</p>

        {result.confidence && (
          <span className={`inline-block text-xs px-2 py-0.5 rounded font-medium ${confidenceColor[result.confidence] ?? 'bg-gray-light text-gray-mid'}`}>
            {confidenceLabel[result.confidence] ?? result.confidence}
          </span>
        )}

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
}

export function ErrorBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-start">
      <div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl rounded-tl-sm px-4 py-2.5 max-w-[80%] text-sm">
        {text}
      </div>
    </div>
  )
}

export function TypingIndicator() {
  return (
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
  )
}
