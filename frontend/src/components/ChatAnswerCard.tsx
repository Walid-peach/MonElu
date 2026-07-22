import Link from 'next/link'
import { ShareButton } from './ShareButton'
import { mdToHtml, mapSource, CONFIDENCE_META, type SourceKind } from '@/lib/chatFormat'
import type { ChatShareResult } from '@/lib/api'

// MON-159: this card renders inside the shared --dp-* theme (unlike
// chat/page.tsx, which has its own independent light/dark toggle - see
// MON-168), so its confidence/source badges use dark:-aware Tailwind
// classes and CSS variables rather than CONFIDENCE_META's / mapSource's raw
// hex, which stay light-only fallbacks for chat/page.tsx's own system.
const CONFIDENCE_BADGE_CLASS: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  low: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
}

const SOURCE_KIND_STYLE: Record<SourceKind, { dot?: string; badgeBg: string; badgeColor: string }> = {
  positive: { dot: 'var(--dp-green)', badgeBg: 'var(--dp-badge-pos-bg)', badgeColor: 'var(--dp-green)' },
  negative: { dot: 'var(--dp-red)', badgeBg: 'var(--dp-badge-neg-bg)', badgeColor: 'var(--dp-red)' },
  default: { dot: 'var(--dp-text)', badgeBg: 'var(--dp-track-bg)', badgeColor: 'var(--dp-text-secondary)' },
  // deputy's dot is a real per-party brand color (group_color) - left as
  // src.dot below, deferred like partyHex() elsewhere in the app.
  deputy: { badgeBg: 'var(--dp-track-bg)', badgeColor: 'var(--dp-text-secondary)' },
}

export function ChatAnswerCard({ result }: { result: ChatShareResult }) {
  const conf = result.confidence ? CONFIDENCE_META[result.confidence] : undefined
  const sources = (result.sources || []).slice(0, 3).map(mapSource)

  return (
    <div className="bg-white border border-gray-border dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)] rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        {conf && result.confidence ? (
          <span
            className={`inline-block text-xs font-bold uppercase tracking-wide px-3 py-1.5 rounded-full ${CONFIDENCE_BADGE_CLASS[result.confidence] ?? ''}`}
          >
            {conf.label}
          </span>
        ) : (
          <span />
        )}
        <ShareButton
          url={`/chat/s/${result.id}`}
          title="Réponse MonÉlu"
          text={result.question}
          ariaLabel="Partager cette réponse"
        />
      </div>

      <blockquote className="border-l-4 border-gray-border dark:border-[color:var(--dp-border)] pl-4 text-navy dark:text-[color:var(--dp-text)] font-medium italic mb-4">
        « {result.question} »
      </blockquote>

      <div
        className="text-[15px] leading-relaxed text-navy dark:text-[color:var(--dp-text)] mb-2"
        dangerouslySetInnerHTML={{ __html: mdToHtml(result.answer) }}
      />

      {result.caveat && (
        <div className="mt-3 mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 px-3 py-2">
          <span className="text-xs leading-relaxed text-amber-800 dark:text-amber-300">{result.caveat}</span>
        </div>
      )}

      {sources.length > 0 && (
        <div className="mt-5 mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-mid dark:text-[color:var(--dp-text-muted)] mb-2">Sources</h3>
          <div className="flex flex-wrap gap-2">
            {sources.map((src, si) => {
              const kindStyle = SOURCE_KIND_STYLE[src.kind]
              const inner = (
                <>
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: kindStyle.dot ?? src.dot }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-navy dark:text-[color:var(--dp-text)] truncate">{src.label}</div>
                    {src.sub && <div className="text-[11px] text-gray-mid dark:text-[color:var(--dp-text-muted)] truncate">{src.sub}</div>}
                  </div>
                  {src.badge && (
                    <div
                      className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                      style={{ background: kindStyle.badgeBg, color: kindStyle.badgeColor }}
                    >
                      {src.badge}
                    </div>
                  )}
                </>
              )
              const className = 'flex items-center gap-2.5 bg-white border border-gray-border dark:bg-[color:var(--dp-card-bg)] dark:border-[color:var(--dp-border)] rounded-lg px-3 py-2 max-w-[280px]'
              return src.href ? (
                <Link key={si} href={src.href} className={className}>{inner}</Link>
              ) : (
                <div key={si} className={className}>{inner}</div>
              )
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-mid dark:text-[color:var(--dp-text-muted)] border-t border-gray-border dark:border-[color:var(--dp-border)] pt-3 mt-4">
        Réponse générée le{' '}
        {new Date(result.shared_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
        {' · '}Source : données ouvertes de l&apos;Assemblée Nationale.
      </p>
    </div>
  )
}
