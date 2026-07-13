import Link from 'next/link'
import type { DeputyVoteItem } from '@/lib/api'
import { formatDate } from '@/lib/utils'
import { positionStyle } from '@/lib/vote-position'

const NAVY = '#1B2B50'

type Props = {
  vote: DeputyVoteItem
  dotBorderColor: string
}

export function VoteTimelineItem({ vote: v, dotBorderColor }: Props) {
  const pos = positionStyle(v.position)
  return (
    <div style={{ position: 'relative' }}>
      {/* Dot */}
      <span style={{
        position: 'absolute', left: -32, top: 5,
        width: 13, height: 13, borderRadius: 999,
        background: pos.color,
        border: `3px solid ${dotBorderColor}`,
        boxShadow: `0 0 0 1px ${pos.color}`,
      }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        {v.voted_at && (
          <span className="font-mono" style={{ fontSize: 12.5, color: '#9CA3AF', letterSpacing: '0.02em' }}>
            {formatDate(v.voted_at)}
          </span>
        )}
        <span style={{
          fontSize: 12.5, fontWeight: 700, letterSpacing: '0.04em',
          padding: '4px 12px', borderRadius: 999,
          color: pos.color, background: pos.bg,
        }}>
          {pos.label}
        </span>
        {v.result && (
          <span style={{ fontSize: 12, color: '#9CA3AF' }}>
            Scrutin : {v.result}
          </span>
        )}
      </div>

      <Link href={`/votes/${v.vote_id}`} style={{ textDecoration: 'none' }}>
        <div className="font-newsreader text-[21px]" style={{ color: NAVY, marginTop: 8, lineHeight: 1.3, cursor: 'pointer' }}>
          {v.summary_plain || v.vote_title}
        </div>
      </Link>

      {v.summary_plain && (
        <div style={{ fontSize: 14.5, color: '#4B5563', lineHeight: 1.55, marginTop: 5, maxWidth: 680, fontStyle: 'italic' }}>
          {v.vote_title}
        </div>
      )}
    </div>
  )
}
