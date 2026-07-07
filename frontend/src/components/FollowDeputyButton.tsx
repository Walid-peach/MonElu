'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getFollowedDeputyId, setFollowedDeputyId, clearFollowedDeputyId } from '@/lib/mon-depute'

const NAVY = '#1B2B50'
const LINE = '#E4E6EA'

export function FollowDeputyButton({ deputyId }: { deputyId: string }) {
  const router = useRouter()
  // Starts false to match the server render (localStorage is unavailable server-side);
  // the effect corrects it after mount via a microtask so React treats it as an
  // async update rather than a synchronous one, avoiding a hydration mismatch.
  const [following, setFollowing] = useState(false)

  useEffect(() => {
    Promise.resolve().then(() => setFollowing(getFollowedDeputyId() === deputyId))
  }, [deputyId])

  function toggle() {
    if (following) {
      clearFollowedDeputyId()
      setFollowing(false)
    } else {
      setFollowedDeputyId(deputyId)
      setFollowing(true)
      router.push('/mon-depute')
    }
  }

  return (
    <button
      onClick={toggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: following ? NAVY : '#fff',
        border: `1px solid ${following ? NAVY : LINE}`,
        color: following ? '#fff' : NAVY,
        padding: '12px 22px', borderRadius: 9, fontWeight: 600,
        fontSize: 15, cursor: 'pointer',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={following ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z" />
      </svg>
      {following ? 'Député suivi' : 'Suivre ce député'}
    </button>
  )
}
