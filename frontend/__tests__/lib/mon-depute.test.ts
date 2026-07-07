import {
  getFollowedDeputyId,
  setFollowedDeputyId,
  clearFollowedDeputyId,
  getLastSeenAt,
  setLastSeenAt,
} from '@/lib/mon-depute'

beforeEach(() => {
  localStorage.clear()
})

describe('followed deputy persistence', () => {
  it('returns null when no deputy is followed', () => {
    expect(getFollowedDeputyId()).toBeNull()
  })

  it('persists and retrieves the followed deputy id', () => {
    setFollowedDeputyId('PA1')
    expect(getFollowedDeputyId()).toBe('PA1')
  })

  it('clears the followed deputy id', () => {
    setFollowedDeputyId('PA1')
    clearFollowedDeputyId()
    expect(getFollowedDeputyId()).toBeNull()
  })

  it('does not throw when localStorage is unavailable', () => {
    const original = window.localStorage
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: () => { throw new Error('blocked') },
        setItem: () => { throw new Error('blocked') },
        removeItem: () => { throw new Error('blocked') },
      },
      configurable: true,
    })
    expect(() => setFollowedDeputyId('PA1')).not.toThrow()
    expect(getFollowedDeputyId()).toBeNull()
    Object.defineProperty(window, 'localStorage', { value: original, configurable: true })
  })
})

describe('per-deputy last-seen timestamp', () => {
  it('returns null when never set', () => {
    expect(getLastSeenAt('PA1')).toBeNull()
  })

  it('persists and retrieves per deputy independently', () => {
    setLastSeenAt('PA1', '2026-07-01T00:00:00.000Z')
    setLastSeenAt('PA2', '2026-07-02T00:00:00.000Z')
    expect(getLastSeenAt('PA1')).toBe('2026-07-01T00:00:00.000Z')
    expect(getLastSeenAt('PA2')).toBe('2026-07-02T00:00:00.000Z')
  })
})
