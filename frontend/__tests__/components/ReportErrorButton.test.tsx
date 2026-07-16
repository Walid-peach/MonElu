import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ReportErrorButton } from '@/components/ReportErrorButton'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { feedback: { report: jest.fn() } },
}))

const reportMock = api.feedback.report as jest.Mock

afterEach(() => {
  jest.clearAllMocks()
})

describe('ReportErrorButton', () => {
  it('opens the form on click and shows the entity label', () => {
    render(
      <ReportErrorButton entityType="deputy" entityId="PA1" entityLabel="Jean Dupont" pageUrl="/deputes/PA1" />
    )
    expect(screen.queryByLabelText(/description de l'erreur/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /signaler une erreur/i }))
    expect(screen.getByLabelText(/description de l'erreur/i)).toBeInTheDocument()
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument()
  })

  it('submits the report with entity context and confirms success', async () => {
    reportMock.mockResolvedValue({ status: 'ok' })
    render(
      <ReportErrorButton entityType="vote" entityId="V1" entityLabel="Un scrutin" pageUrl="/votes/V1" />
    )

    fireEvent.click(screen.getByRole('button', { name: /signaler une erreur/i }))
    fireEvent.change(screen.getByLabelText(/description de l'erreur/i), {
      target: { value: 'Le résultat est faux.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /envoyer le signalement/i }))

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/signalement envoyé/i))
    expect(reportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        entity_type: 'vote',
        entity_id: 'V1',
        entity_label: 'Un scrutin',
        page_url: '/votes/V1',
        message: 'Le résultat est faux.',
        email: null,
      })
    )
  })

  it('does not submit when the message is empty', () => {
    render(
      <ReportErrorButton entityType="page" entityLabel="Une page" pageUrl="/x" />
    )
    fireEvent.click(screen.getByRole('button', { name: /signaler une erreur/i }))
    fireEvent.click(screen.getByRole('button', { name: /envoyer le signalement/i }))
    expect(reportMock).not.toHaveBeenCalled()
  })

  it('shows an error message when the request fails', async () => {
    reportMock.mockRejectedValue(new Error('API error: 500'))
    render(
      <ReportErrorButton entityType="deputy" entityId="PA1" entityLabel="Jean Dupont" pageUrl="/deputes/PA1" />
    )
    fireEvent.click(screen.getByRole('button', { name: /signaler une erreur/i }))
    fireEvent.change(screen.getByLabelText(/description de l'erreur/i), {
      target: { value: 'Erreur.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /envoyer le signalement/i }))

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/échoué/i))
  })
})
