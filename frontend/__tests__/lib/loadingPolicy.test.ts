import { act, renderHook } from '@testing-library/react'

import {
  LOADING_INLINE_MS,
  LOADING_NO_INDICATOR_MS,
  useLoadingPhase,
} from '@/lib/loadingPolicy'

describe('useLoadingPhase', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('stays "none" when not loading', () => {
    const { result } = renderHook(() => useLoadingPhase(false))
    expect(result.current).toBe('none')
  })

  it('stays "none" for a fast completion under the no-indicator threshold', () => {
    const { result, rerender } = renderHook(({ isLoading }) => useLoadingPhase(isLoading), {
      initialProps: { isLoading: true },
    })

    act(() => {
      jest.advanceTimersByTime(LOADING_NO_INDICATOR_MS - 50)
    })
    expect(result.current).toBe('none')

    rerender({ isLoading: false })
    expect(result.current).toBe('none')
  })

  it('moves to "inline" once the no-indicator threshold elapses', () => {
    const { result } = renderHook(() => useLoadingPhase(true))

    act(() => {
      jest.advanceTimersByTime(LOADING_NO_INDICATOR_MS + 50)
    })
    expect(result.current).toBe('inline')
  })

  it('moves to "content" once the inline threshold elapses (delayed completion)', () => {
    const { result } = renderHook(() => useLoadingPhase(true))

    act(() => {
      jest.advanceTimersByTime(LOADING_INLINE_MS + 50)
    })
    expect(result.current).toBe('content')
  })

  it('resets to "none" as soon as loading stops, even mid-content phase', () => {
    const { result, rerender } = renderHook(({ isLoading }) => useLoadingPhase(isLoading), {
      initialProps: { isLoading: true },
    })

    act(() => {
      jest.advanceTimersByTime(LOADING_INLINE_MS + 50)
    })
    expect(result.current).toBe('content')

    rerender({ isLoading: false })
    expect(result.current).toBe('none')
  })
})
