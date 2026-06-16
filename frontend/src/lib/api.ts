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
  summary_plain?: string | null
  theme?: string | null
}

export type VoteDetail = Vote & {
  positions?: Array<{
    deputy_id: string
    full_name: string
    party: string
    position: string
  }>
}

export type DeputyStats = {
  avg_presence_rate: number
}

export type DeputyVoteItem = {
  vote_id: string
  voted_at: string | null
  vote_title: string
  result: string | null
  position: string
  summary_plain?: string | null
}

export type DeputyVotesResponse = {
  deputy_id: string
  total: number
  items: DeputyVoteItem[]
}

export type SearchResult = {
  answer: string
  question: string
  chunks_retrieved: number
  confidence: string
  data_source: string
  sources: Array<{ content: string; metadata: Record<string, string>; similarity: number }>
}

async function apiFetch<T>(path: string, opts?: { revalidate?: number }): Promise<T> {
  const delays = [200, 400]
  let lastStatus = 0
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: opts?.revalidate ?? 300 },
    })
    if (res.ok) return res.json()
    lastStatus = res.status
    if (res.status < 500 || attempt === delays.length) break
    await new Promise(r => setTimeout(r, delays[attempt]))
  }
  throw new Error(`API error: ${lastStatus}`)
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

export const api = {
  deputies: {
    list: (params?: { search?: string; party?: string; department?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams()
      if (params?.search) q.set('search', params.search)
      if (params?.party) q.set('party', params.party)
      if (params?.department) q.set('department', params.department)
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.offset) q.set('offset', String(params.offset))
      return apiFetch<{ total: number; items: Deputy[]; limit: number; offset: number }>(
        `/deputies/?${q}`,
        { revalidate: 900 }
      )
    },
    get: (id: string) => apiFetch<Deputy>(`/deputies/${id}/`, { revalidate: 86400 }),
    scorecard: (id: string) => apiFetch<Scorecard>(`/deputies/${id}/scorecard/`, { revalidate: 86400 }),
    stats: () => apiFetch<DeputyStats>('/deputies/stats/', { revalidate: 3600 }),
    votes: (id: string, limit = 10) =>
      apiFetch<DeputyVotesResponse>(`/deputies/${id}/votes/?limit=${limit}`, { revalidate: 86400 }),
  },
  votes: {
    list: (params?: { result?: string; theme?: string; limit?: number; offset?: number }) => {
      const q = new URLSearchParams()
      if (params?.result) q.set('result', params.result)
      if (params?.theme)  q.set('theme',  params.theme)
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.offset) q.set('offset', String(params.offset))
      return apiFetch<{ total: number; items: Vote[]; limit: number; offset: number }>(
        `/votes/?${q}`,
        { revalidate: 900 }
      )
    },
    latest: () => apiFetch<Vote[]>('/votes/latest/', { revalidate: 300 }),
    get: (id: string) => apiFetch<VoteDetail>(`/votes/${id}/`, { revalidate: 86400 }),
  },
  search: (question: string) => apiPost<SearchResult>('/search/', { question }),
  health: () => apiFetch<Record<string, unknown>>('/health/', { revalidate: 300 }),
}
