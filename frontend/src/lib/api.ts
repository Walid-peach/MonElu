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
  eligible_solennels: number
  solennels_cast: number
  solennel_participation_rate: number
  eligible_voting_days: number
  voting_days_present: number
  voting_days_rate: number
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
  dossier_id?: string | null
  positions?: Array<{
    deputy_id: string
    full_name: string
    party_short: string | null
    position: string
  }>
}

export type DeputyStats = {
  avg_presence_rate: number
  avg_solennel_participation_rate: number | null
  avg_voting_days_rate: number | null
  avg_votes_for_pct: number | null
  avg_abstention_pct: number | null
}

export type Alignment = {
  deputy_id: string
  full_name: string
  party: string | null
  total_votes: number
  aligned_votes: number
  dissident_votes: number
  party_alignment_rate: number
  dissident_rate: number
  updated_at: string | null
}

export type DissidentVoteItem = {
  vote_id: string
  voted_at: string | null
  vote_title: string
  result: string | null
  position: string
  majority_position: string
}

export type DissidentVotesResponse = {
  deputy_id: string
  total: number
  items: DissidentVoteItem[]
}

export type DivergingVoteItem = {
  vote_id: string
  voted_at: string | null
  vote_title: string
  result: string | null
  summary_plain: string | null
  position_a: string
  position_b: string
}

export type DivergingVotesResponse = {
  deputy_a_id: string
  deputy_b_id: string
  total: number
  items: DivergingVoteItem[]
}

export type DeputyVoteItem = {
  vote_id: string
  voted_at: string | null
  vote_title: string
  result: string | null
  position: string
  summary_plain: string | null
}

export type DeputyVotesResponse = {
  deputy_id: string
  total: number
  items: DeputyVoteItem[]
}

export type DepartmentDeputy = {
  deputy_id: string
  full_name: string
  party: string | null
  party_short: string | null
  department: string | null
  circonscription: string | null
  photo_url: string | null
  presence_rate: number | null
  solennel_participation_rate: number | null
  party_alignment_rate: number | null
  dissident_rate: number | null
}

export type DepartmentSplitVote = {
  vote_id: string
  voted_at: string | null
  vote_title: string
  result: string | null
  pour: number
  contre: number
  abstention: number
}

export type DepartmentDetail = {
  code: string
  name: string
  deputy_count: number
  deputies: DepartmentDeputy[]
  avg_presence_rate: number | null
  party_distribution: Array<{ party: string | null; count: number }>
  most_dissident: DepartmentDeputy | null
  split_votes: DepartmentSplitVote[]
}

export type SearchResult = {
  answer: string
  question: string
  chunks_retrieved: number
  confidence: string
  data_source: string
  caveat?: string | null
  sources: Array<{ content: string; metadata: Record<string, string>; similarity: number }>
  // ADR-023 nudge (MON-133): "verify" when the input looked like a claim.
  // Optional so stored conversations from before the field render unchanged.
  suggested_action?: 'verify' | null
}

export type VerifyCitation = {
  vote_id: string
  title: string
  voted_at: string
  result: string | null
  deputy_position: string | null
}

export type VerifyResult = {
  id: string
  claim: string
  verdict: 'vrai' | 'faux' | 'trompeur' | 'inverifiable'
  explanation: string
  deputy: { deputy_id: string; name: string; party: string | null } | null
  citations: VerifyCitation[]
  confidence: 'ÉLEVÉ' | 'MOYEN' | 'FAIBLE'
  data_horizon: string | null
  verified_at: string
  share_url: string
}

// 5xx: transient upstream hiccups, short retries.
// 429: the API rate limiter (30 req/min per IP) — hit hard during `next build`,
// where prerendering ~117 pages from one IP exceeds the budget and fails the
// whole Vercel deploy. Long waits let the per-minute window reset; build time
// is the only cost.
const SERVER_ERROR_DELAYS_MS = [200, 400]
const RATE_LIMIT_DELAYS_MS = [2_000, 15_000, 30_000, 61_000]

async function apiFetch<T>(path: string, opts?: { revalidate?: number }): Promise<T> {
  let lastStatus = 0
  let serverErrorAttempt = 0
  let rateLimitAttempt = 0
  for (;;) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: opts?.revalidate ?? 300 },
    })
    if (res.ok) return res.json()
    lastStatus = res.status
    if (res.status === 429 && rateLimitAttempt < RATE_LIMIT_DELAYS_MS.length) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAYS_MS[rateLimitAttempt++]))
      continue
    }
    if (res.status >= 500 && serverErrorAttempt < SERVER_ERROR_DELAYS_MS.length) {
      await new Promise(r => setTimeout(r, SERVER_ERROR_DELAYS_MS[serverErrorAttempt++]))
      continue
    }
    break
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
    stats: (party?: string) => {
      const q = new URLSearchParams()
      if (party) q.set('party', party)
      const qs = q.toString()
      return apiFetch<DeputyStats>(`/deputies/stats/${qs ? `?${qs}` : ''}`, { revalidate: 3600 })
    },
    votes: (id: string, limit = 10, since?: string) => {
      const q = new URLSearchParams({ limit: String(limit) })
      if (since) q.set('since', since)
      return apiFetch<DeputyVotesResponse>(`/deputies/${id}/votes/?${q}`, { revalidate: 86400 })
    },
    alignment: (id: string) =>
      apiFetch<Alignment>(`/deputies/${id}/alignment/`, { revalidate: 86400 }),
    dissidentVotes: (id: string, limit = 10) =>
      apiFetch<DissidentVotesResponse>(`/deputies/${id}/dissident-votes/?limit=${limit}`, { revalidate: 86400 }),
    divergingVotes: (id: string, otherId: string, limit = 10) =>
      apiFetch<DivergingVotesResponse>(
        `/deputies/${id}/diverging-votes/?other_deputy_id=${encodeURIComponent(otherId)}&limit=${limit}`,
        { revalidate: 86400 }
      ),
  },
  departments: {
    get: (code: string) =>
      apiFetch<DepartmentDetail>(`/departments/${encodeURIComponent(code)}`, { revalidate: 3600 }),
  },
  votes: {
    list: (params?: { result?: string; theme?: string; search?: string; limit?: number; offset?: number; before?: string }) => {
      const q = new URLSearchParams()
      if (params?.result) q.set('result', params.result)
      if (params?.theme)  q.set('theme',  params.theme)
      if (params?.search) q.set('search', params.search)
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.offset) q.set('offset', String(params.offset))
      if (params?.before) q.set('before', params.before)
      return apiFetch<{ total: number; items: Vote[]; limit: number; offset: number; next_cursor: string | null }>(
        `/votes/?${q}`,
        { revalidate: 900 }
      )
    },
    latest: () => apiFetch<Vote[]>('/votes/latest/', { revalidate: 300 }),
    get: (id: string) => apiFetch<VoteDetail>(`/votes/${id}/`, { revalidate: 86400 }),
  },
  search: (question: string) => apiPost<SearchResult>('/search/', { question }),
  verify: (claim: string) => apiPost<VerifyResult>('/verify/', { claim }),
  // Verdicts are immutable snapshots (ADR-022) — cache aggressively.
  verification: (id: string) => apiFetch<VerifyResult>(`/verify/${id}`, { revalidate: 86400 }),
  feedback: {
    chat: (vote: 'up' | 'down', question: string, answer: string, sources: SearchResult['sources']) =>
      apiPost<{ status: string }>('/feedback/chat', { vote, question, answer, sources }),
    report: (report: {
      entity_type: 'deputy' | 'vote' | 'page'
      entity_id?: string | null
      entity_label?: string | null
      page_url?: string | null
      message: string
      email?: string | null
    }) => apiPost<{ status: string }>('/feedback/report', report),
  },
  health: () => apiFetch<Record<string, unknown>>('/health/', { revalidate: 300 }),
}
