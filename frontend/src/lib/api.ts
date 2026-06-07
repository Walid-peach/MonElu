const API_BASE = process.env.NEXT_PUBLIC_API_URL
  || 'https://monelu-production.up.railway.app'

export type Deputy = {
  deputy_id: string
  full_name: string
  first_name: string
  last_name: string
  party: string | null
  department: string | null
  photo_url: string | null
  mandate_start: string | null
  mandate_end: string | null
}

export type Scorecard = {
  deputy_id: string
  full_name: string
  total_votes: number
  present_votes: number
  presence_rate: number
  votes_for: number
  votes_against: number
  abstentions: number
  votes_for_pct: number
  abstention_pct: number
}

export type Vote = {
  vote_id: string
  vote_title: string
  result: string
  voted_at: string
  votes_for: number
  votes_against: number
  abstentions: number
  total_voters: number
}

export type VoteDetail = Vote & {
  positions?: Array<{
    deputy_id: string
    full_name: string
    party: string
    position: string
  }>
}

export type SearchResult = {
  answer: string
  question: string
  chunks_retrieved: number
  confidence: string
  data_source: string
  sources: Array<{ content: string; metadata: Record<string, string>; similarity: number }>
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    next: { revalidate: 300 },
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  deputies: {
    list: (params?: { party?: string; department?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams()
      if (params?.party) q.set('party', params.party)
      if (params?.department) q.set('department', params.department)
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.offset) q.set('offset', String(params.offset))
      return apiFetch<{ total: number; items: Deputy[]; limit: number; offset: number }>(
        `/deputies/?${q}`
      )
    },
    get: (id: string) => apiFetch<Deputy>(`/deputies/${id}/`),
    scorecard: (id: string) => apiFetch<Scorecard>(`/deputies/${id}/scorecard/`),
  },
  votes: {
    list: (params?: { result?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams()
      if (params?.result) q.set('result', params.result)
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.offset) q.set('offset', String(params.offset))
      return apiFetch<{ total: number; items: Vote[]; limit: number; offset: number }>(
        `/votes/?${q}`
      )
    },
    latest: () => apiFetch<Vote[]>('/votes/latest/'),
    get: (id: string) => apiFetch<VoteDetail>(`/votes/${id}/`),
  },
  search: (question: string) =>
    fetch(`${API_BASE}/search/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    }).then(r => r.json() as Promise<SearchResult>),
  health: () => apiFetch<Record<string, unknown>>('/health'),
}
