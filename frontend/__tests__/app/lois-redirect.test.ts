/**
 * @jest-environment node
 */
import { GET } from '@/app/lois/[dossier_id]/route'

const params = (dossier_id: string) => ({ params: Promise.resolve({ dossier_id }) })
const req = new Request('http://localhost/lois/x')

describe('GET /lois/[dossier_id] (#619)', () => {
  it('sends a bill page URL to its AN dossier page, temporarily', async () => {
    const res = await GET(req, params('DLR5L17N54951'))
    expect(res.status).toBe(307)
    expect(res.headers.get('location')).toBe(
      'https://www.assemblee-nationale.fr/dyn/17/dossiers/DLR5L17N54951'
    )
  })

  it('answers 404 for anything that is not a legislature-17 dossier uid', async () => {
    for (const id of ['foo', 'DLR5L16N1', 'DLR5L17N54951-x', "{'uid': 'DLR5L17N1'}"]) {
      const res = await GET(req, params(id))
      expect(res.status).toBe(404)
      expect(res.headers.get('location')).toBeNull()
    }
  })
})
