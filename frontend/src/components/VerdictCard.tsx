import Link from 'next/link'
import { ShareButton } from './ShareButton'
import type { VerifyResult } from '@/lib/api'

const VERDICT_STYLES: Record<VerifyResult['verdict'], { label: string; badge: string }> = {
  vrai: { label: 'Vrai', badge: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
  faux: { label: 'Faux', badge: 'bg-red-100 text-red-800 border-red-300' },
  trompeur: { label: 'Trompeur', badge: 'bg-amber-100 text-amber-800 border-amber-300' },
  inverifiable: {
    label: 'Invérifiable avec nos données',
    badge: 'bg-gray-100 text-gray-700 border-gray-300',
  },
}

const CONFIDENCE_LABELS: Record<VerifyResult['confidence'], string> = {
  'ÉLEVÉ': 'Confiance élevée',
  'MOYEN': 'Confiance moyenne',
  'FAIBLE': 'Confiance faible',
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function VerdictCard({ result }: { result: VerifyResult }) {
  const style = VERDICT_STYLES[result.verdict]
  const verifiedAt = formatDate(result.verified_at)
  const horizon = formatDate(result.data_horizon)

  return (
    <div className="bg-white border border-gray-border rounded-xl p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <span
          className={`inline-block text-sm font-bold uppercase tracking-wide px-3 py-1.5 rounded-md border ${style.badge}`}
        >
          {style.label}
        </span>
        <ShareButton
          url={`/verifier/v/${result.id}`}
          title={`${style.label} — vérification MonÉlu`}
          text={result.claim}
          ariaLabel="Partager ce verdict"
        />
      </div>

      <blockquote className="border-l-4 border-gray-border pl-4 text-navy font-medium italic mb-4">
        « {result.claim} »
      </blockquote>

      {result.deputy && (
        <p className="text-sm text-gray-mid mb-3">
          Député concerné :{' '}
          <Link
            href={`/deputes/${result.deputy.deputy_id}`}
            className="text-navy font-medium underline hover:text-red-civic"
          >
            {result.deputy.name}
          </Link>
          {result.deputy.party ? ` (${result.deputy.party})` : ''}
        </p>
      )}

      <p className="text-[15px] leading-relaxed text-navy mb-5">{result.explanation}</p>

      {result.citations.length > 0 && (
        <div className="mb-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-mid mb-2">
            Scrutins cités
          </h3>
          <ul className="space-y-2">
            {result.citations.map(c => (
              <li key={c.vote_id}>
                <Link
                  href={`/votes/${c.vote_id}`}
                  className="block border border-gray-border rounded-lg p-3 hover:border-navy transition-colors"
                >
                  <span className="block text-sm font-medium text-navy">{c.title}</span>
                  <span className="block text-xs text-gray-mid mt-1">
                    {formatDate(c.voted_at)}
                    {c.result ? ` · ${c.result}` : ''}
                    {c.deputy_position && result.deputy
                      ? ` · position de ${result.deputy.name} : ${c.deputy_position}`
                      : ''}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-mid border-t border-gray-border pt-3">
        {CONFIDENCE_LABELS[result.confidence]}
        {verifiedAt ? ` · Vérifié le ${verifiedAt}` : ''}
        {horizon ? ` · Sur la base des scrutins de l'Assemblée Nationale depuis le ${horizon}` : ''}
        {' · '}Source : données ouvertes de l&apos;Assemblée Nationale.
      </p>
    </div>
  )
}
