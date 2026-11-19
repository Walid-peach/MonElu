import { render, screen } from '@testing-library/react'

/**
 * Every share snapshot carries a way to report it (#707, App Review
 * Guideline 1.2): a "Signaler ce contenu" link to /contact, never to the
 * address, naming the snapshot it came from.
 */

const ID = '3f0e8a4e-6f0f-4a63-9c40-df3a54d9c001'

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return {
    ...actual,
    api: {
      chatShare: jest.fn(async () => ({ question: 'Qui a voté la loi ?' })),
      verification: jest.fn(async () => ({ claim: 'Une affirmation' })),
      quiz: { getShare: jest.fn(async () => ({ result: { answers: null } })) },
    },
  }
})
jest.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
// The cards have their own tests; here only the page chrome matters.
jest.mock('@/components/ChatAnswerCard', () => ({ ChatAnswerCard: () => null }))
jest.mock('@/components/VerdictCard', () => ({ VerdictCard: () => null }))
jest.mock('@/app/quiz/QuizResultCard', () => ({ QuizResultCard: () => null }))
jest.mock('@/app/quiz/QuizResultSections', () => ({ QuizResultSections: () => null }))

import ChatSharePage from '@/app/chat/s/[id]/page'
import VerificationPage from '@/app/verifier/v/[id]/page'
import QuizSharePage from '@/app/quiz/s/[id]/page'

const PAGES = [
  ['/chat/s/[id]', ChatSharePage, 'chat'],
  ['/verifier/v/[id]', VerificationPage, 'verifier'],
  ['/quiz/s/[id]', QuizSharePage, 'quiz'],
] as const

describe('share snapshots link to a report path (#707)', () => {
  it.each(PAGES)('%s renders "Signaler ce contenu" to /contact', async (_route, Page, kind) => {
    const { container } = render(await Page({ params: Promise.resolve({ id: ID }) }))
    const link = screen.getByRole('link', { name: 'Signaler ce contenu' })
    expect(link).toHaveAttribute('href', `/contact?signaler=${kind}-${ID}#signaler-un-contenu`)
    // The address lives on /contact only (MON-272).
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull()
    expect(screen.queryByText(/@/)).not.toBeInTheDocument()
  })
})
