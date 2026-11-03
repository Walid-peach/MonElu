import Link from 'next/link'
import type { Vote } from '@/lib/api'
import { billPath } from '@/lib/lois'

/** A compact link from a vote row to its bill page, beside the row's own link (#371). */
export function BillLink({ vote, className, style }: { vote: Vote; className?: string; style?: React.CSSProperties }) {
  const href = billPath(vote.dossier)
  if (!href) return null
  return (
    <Link href={href} className={className} style={style}>
      Texte : {vote.dossier?.titre ?? 'voir le parcours'} →
    </Link>
  )
}
