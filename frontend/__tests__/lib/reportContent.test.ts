import { parseReportTarget, reportHref } from '@/lib/reportContent'
import { SITE_URL } from '@/lib/site'

const ID = '3f0e8a4e-6f0f-4a63-9c40-df3a54d9c001'

describe('reportContent (#707)', () => {
  it.each([
    ['chat', `/chat/s/${ID}`, 'une réponse partagée'],
    ['verifier', `/verifier/v/${ID}`, 'un verdict partagé'],
    ['quiz', `/quiz/s/${ID}`, 'un résultat de quiz partagé'],
  ] as const)('round-trips a %s snapshot to its full URL', (kind, path, label) => {
    const value = new URL(reportHref(kind, ID), SITE_URL).searchParams.get('signaler')
    expect(parseReportTarget(value)).toEqual({ kind, label, url: `${SITE_URL}${path}` })
  })

  it.each([
    null,
    '',
    ID,
    `-${ID}`,
    `chat-${ID}x`,
    'chat-not-a-uuid',
    `constructor-${ID}`,
    `deputes-${ID}`,
    `chat-${ID}/../../admin`,
  ])('ignores %p', (value) => {
    expect(parseReportTarget(value)).toBeNull()
  })
})
