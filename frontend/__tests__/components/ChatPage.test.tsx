import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import ChatPage from '@/app/chat/page'
import type { SearchResult, VerifyResult } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: {
    search: jest.fn(),
    verify: jest.fn(),
    feedback: { chat: jest.fn() },
    shareAnswer: jest.fn(),
  },
}))
import { api } from '@/lib/api'
const mockSearch = api.search as jest.Mock
const mockVerify = api.verify as jest.Mock

// jest.setup.ts's blanket next/navigation mock returns null for every
// searchParams.get(...), which is exactly the default (question mode, no
// prefill) this suite needs — no override required.

const searchResult: SearchResult = {
  answer: 'Réponse test',
  question: 'Une question',
  chunks_retrieved: 3,
  confidence: 'high',
  data_source: 'votes',
  sources: [],
}

const verifyResult: VerifyResult = {
  id: 'v1',
  claim: 'Une affirmation suffisamment longue',
  verdict: 'vrai',
  explanation: 'Explication',
  deputy: null,
  citations: [],
  confidence: 'ÉLEVÉ',
  data_horizon: null,
  verified_at: '2026-01-01T00:00:00Z',
  share_url: '/verifier/v/v1',
}

// Mimics fetch's real abort behavior: rejects with a DOMException named
// AbortError once the passed signal fires, otherwise resolves/rejects on
// the caller's command via the returned controls.
function deferredWithAbort<T>(signal?: AbortSignal) {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
    signal?.addEventListener('abort', () => {
      const err = new Error('The operation was aborted')
      err.name = 'AbortError'
      rej(err)
    })
  })
  return { promise, resolve, reject }
}

afterEach(() => jest.clearAllMocks())

async function typeAndSend(text: string) {
  const textarea = screen.getByLabelText('Votre question')
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.keyDown(textarea, { key: 'Enter' })
}

describe('ChatPage loading treatment (MON-216)', () => {
  it('shows a contextual AsyncStatus while a question is in flight, with aria-busy', async () => {
    const { promise } = deferredWithAbort<SearchResult>()
    mockSearch.mockReturnValue(promise)
    render(<ChatPage />)

    await act(async () => { await typeAndSend('Quels groupes ont voté pour ?') })

    const status = screen.getByRole('status')
    expect(status).toHaveAttribute('aria-busy', 'true')
    expect(status).toHaveTextContent('Recherche dans les votes et profils des députés…')
  })

  it('cancels the in-flight request and removes the loading state without an error', async () => {
    const controller = { signal: undefined as AbortSignal | undefined }
    mockSearch.mockImplementation((_q: string, signal?: AbortSignal) => {
      controller.signal = signal
      return deferredWithAbort<SearchResult>(signal).promise
    })
    render(<ChatPage />)

    await act(async () => { await typeAndSend('Quels groupes ont voté pour ?') })
    expect(screen.getByRole('status')).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /annuler/i }))
    })

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /réessayer/i })).not.toBeInTheDocument()
    // Cancel reads as "return to editing" — the dangling user bubble is
    // removed and the text comes back into the input, not lost. The only
    // remaining occurrence of the text should be the textarea's own value.
    expect(screen.getAllByText('Quels groupes ont voté pour ?')).toHaveLength(1)
    expect(screen.getByLabelText('Votre question')).toHaveValue('Quels groupes ont voté pour ?')
  })

  it('shows a retry affordance on failure and resubmits the same question', async () => {
    mockSearch.mockRejectedValueOnce(new Error('API error: 500'))
    mockSearch.mockResolvedValueOnce(searchResult)
    render(<ChatPage />)

    await act(async () => { await typeAndSend('Quels groupes ont voté pour ?') })
    await waitFor(() => expect(screen.getByRole('button', { name: /réessayer/i })).toBeInTheDocument())

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /réessayer/i }))
    })

    await waitFor(() => expect(screen.getByText('Réponse test')).toBeInTheDocument())
    expect(mockSearch).toHaveBeenCalledTimes(2)
    expect(mockSearch.mock.calls[1][0]).toBe('Quels groupes ont voté pour ?')
    // Retry must not leave the failed attempt's user bubble behind alongside
    // the resubmitted one — exactly one bubble, plus the sidebar conversation
    // title (also derived from the same text), not two bubbles' worth.
    expect(screen.getAllByText('Quels groupes ont voté pour ?')).toHaveLength(2)
  })

  it('shows the verify-mode contextual status text for claim verification', async () => {
    const { promise } = deferredWithAbort<VerifyResult>()
    mockVerify.mockReturnValue(promise)
    render(<ChatPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    const textarea = screen.getByLabelText('Affirmation à vérifier')
    fireEvent.change(textarea, { target: { value: 'Le député X a voté contre la réforme' } })
    await act(async () => { fireEvent.keyDown(textarea, { key: 'Enter' }) })

    const status = screen.getByRole('status')
    expect(status).toHaveTextContent('Recherche des scrutins correspondants et de la position enregistrée du député…')
  })

  it('resolves a claim verification and clears the loading state', async () => {
    mockVerify.mockResolvedValue(verifyResult)
    render(<ChatPage />)

    fireEvent.click(screen.getByRole('button', { name: 'Vérifier' }))
    const textarea = screen.getByLabelText('Affirmation à vérifier')
    fireEvent.change(textarea, { target: { value: 'Le député X a voté contre la réforme' } })
    await act(async () => { fireEvent.keyDown(textarea, { key: 'Enter' }) })

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
    expect(mockVerify).toHaveBeenCalledWith('Le député X a voté contre la réforme', expect.any(AbortSignal))
  })
})
