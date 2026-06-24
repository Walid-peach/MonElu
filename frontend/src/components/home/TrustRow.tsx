'use client'

const TRUST_ITEMS = [
  'Données officielles',
  "Mise à jour aujourd'hui",
  'Sources vérifiables',
  'Neutre & indépendant',
]

type TrustRowProps = {
  lastUpdated: string
  variant?: 'dark' | 'light'
}

export function TrustRow({ lastUpdated, variant = 'dark' }: TrustRowProps) {
  const isDark = variant === 'dark'

  return (
    <div
      className={
        isDark
          ? 'grid gap-px overflow-hidden border border-white/12 bg-white/12 text-xs font-semibold uppercase text-white/68 sm:grid-cols-2 lg:grid-cols-4'
          : 'grid gap-px overflow-hidden border border-navy/10 bg-navy/10 text-xs font-semibold uppercase text-navy/56 sm:grid-cols-2 lg:grid-cols-4'
      }
    >
      {TRUST_ITEMS.map((item, index) => (
        <div
          key={item}
          className={isDark ? 'bg-navy/42 px-3 py-2.5 backdrop-blur-md' : 'bg-white/75 px-3 py-2.5'}
        >
          <span>{index === 1 ? lastUpdated : item}</span>
        </div>
      ))}
    </div>
  )
}
