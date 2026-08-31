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

export type ScorecardRow = Scorecard & {
  party: string | null
  party_short: string | null
  department: string | null
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

export type GroupMember = {
  deputy_id: string
  full_name: string
  party: string | null
  party_short: string | null
  department: string | null
  circonscription: string | null
  photo_url: string | null
  presence_rate: number | null
  dissident_rate: number | null
}

export type GroupVoteBreakdown = {
  vote_id: string
  voted_at: string | null
  vote_title: string
  result: string | null
  pour: number
  contre: number
  abstention: number
  majority_position: string
}

export type GroupDetail = {
  slug: string
  name: string
  member_count: number
  members: GroupMember[]
  avg_presence_rate: number | null
  avg_dissident_rate: number | null
  most_dissident_members: GroupMember[]
  divided_votes: GroupVoteBreakdown[]
  recent_scrutins: GroupVoteBreakdown[]
}

export type ThemeVoteItem = {
  vote_id: string
  voted_at: string | null
  vote_title: string
  result: string | null
  summary_plain: string | null
}

export type ThemePartyPosition = {
  party_short: string | null
  pour: number
  contre: number
  abstention: number
  expressed: number
  pour_rate: number
}

export type ThemeMostDividedVote = {
  vote_id: string
  voted_at: string | null
  vote_title: string
  votes_for: number
  votes_against: number
}

export type ThemeDetail = {
  slug: string
  name: string
  vote_count: number
  adoption_rate: number | null
  most_divided_vote: ThemeMostDividedVote | null
  party_positions: ThemePartyPosition[]
  limit: number
  offset: number
  votes: ThemeVoteItem[]
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

export type ChatShareResult = {
  id: string
  question: string
  answer: string
  sources: SearchResult['sources']
  confidence: string | null
  data_source: string | null
  caveat: string | null
  shared_at: string
  share_url: string
}

export type QuizQuestion = {
  vote_id: string
  theme: string
  question: string
  context: string
  // Live vote tallies (MON-180) — null if the SELECT joined no matching row.
  votes_for: number | null
  votes_against: number | null
  abstentions: number | null
  result: string | null
  vote_date: string | null
}

export type QuizQuestionsResponse = {
  version: string
  count: number
  questions: QuizQuestion[]
}

// "Scrutin de la semaine" (MON-185) — one auto-picked question, deterministic
// per ISO week. null tallies/result/date shouldn't happen in practice (the
// selection rule only picks rows with real tallies), but the API models them
// as optional to match the DB-backed columns.
export type QuizWeeklyQuestion = {
  vote_id: string
  question: string
  vote_title: string
  votes_for: number | null
  votes_against: number | null
  abstentions: number | null
  result: string | null
  vote_date: string | null
}

export type QuizAnswerPosition = 'pour' | 'contre' | 'abstention'

export type QuizVoteDetail = {
  vote_id: string
  // null when the deputy has no expressed position on this vote (nonVotant
  // or absent) — render as "non comparable", not disagreement.
  deputy_position: QuizAnswerPosition | null
}

export type QuizDeputyMatch = {
  deputy_id: string
  full_name: string | null
  party: string | null
  party_short: string | null
  department: string | null
  photo_url: string | null
  // null when the deputy has no comparable expressed position at all.
  agreement_pct: number | null
  matches: number
  compared: number
  // Per-question breakdown (MON-181) — present only on the best match and
  // the opposite; absent on stored shares (ADR-025).
  detail: QuizVoteDetail[] | null
}

export type QuizGroupAlignment = {
  party: string
  party_short: string | null
  agreement_pct: number
  matches: number
  compared: number
  deputy_count: number
}

export type QuizDepartmentResult = {
  code: string
  name: string
  deputies: QuizDeputyMatch[]
}

// The themes answered pour / contre (MON-203) — the share card's centre block.
// The curated set has one question per theme, so this re-encodes the answers:
// /quiz/match always returns it, but a stored share only carries it when the
// sharer opted into publishing their answers (ADR-028).
export type QuizThemeSummary = {
  supported: string[]
  opposed: string[]
}

export type QuizMatchResponse = {
  version: string
  answered: number
  eligible_deputies: number
  top_matches: QuizDeputyMatch[]
  opposite: QuizDeputyMatch | null
  groups: QuizGroupAlignment[]
  my_department: QuizDepartmentResult | null
  // Set only when the request carried focus_deputy_id (MON-183) — the
  // personalized "Votez-vous comme X ?" deputy-page quiz entry.
  focus: QuizDeputyMatch | null
  // Absent on shares stored before MON-203 and on shares without the
  // answers opt-in — the card drops its centre block rather than filling it.
  themes?: QuizThemeSummary | null
}

// Quiz shares are immutable snapshots of server-recomputed results
// (MON-139, ADR-025) — same semantics as chat shares / verifications.
// `answers` is present only when the sharer opted in (ADR-028, MON-184).
export type QuizShareResult = {
  id: string
  result: QuizMatchResponse & {
    answers: Array<{ vote_id: string; position: QuizAnswerPosition }> | null
  }
  shared_at: string
  share_url: string
}

/**
 * Carries the HTTP status through, so a caller can tell "this resource does
 * not exist" apart from "the API is unwell" (MON-275). Before this, every
 * detail page did `.catch(() => null)` and then `notFound()`, which turned a
 * rate-limited or 5xx-ing API into a site-wide 404 - and, with ISR, a 404
 * cached for up to `revalidate` seconds.
 */
export class ApiError extends Error {
  constructor(readonly status: number, path: string) {
    super(`API error: ${status} (${path})`)
    this.name = 'ApiError'
  }
}

/**
 * `.catch(nullIfMissing)` on a detail page's primary fetch: the resource is
 * genuinely absent, so the page should call `notFound()`. Anything else -
 * 429 after the retries below, 5xx, a network failure - is rethrown and
 * surfaces as a server error rather than masquerading as a missing page.
 *
 * 422 counts as missing: FastAPI rejects a path param that cannot name a real
 * row (a non-UUID share id) before the handler runs, so `/quiz/s/garbage` is a
 * missing page, not a bad request the visitor can act on.
 */
export function nullIfMissing(error: unknown): null {
  if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null
  throw error
}

// 429: the API rate limiter (30 req/min per IP) — hit hard during `next build`,
// where prerendering ~117 pages from one IP exceeds the budget and fails the
// whole Vercel deploy. Long waits let the per-minute window reset; build time
// is the only cost.
//
// 5xx: two causes, so the ladder covers both (MON-275). A one-off upstream
// hiccup clears in milliseconds, which is what the first two delays are for.
// But the same prerender burst that trips the 429 limiter also exhausts the
// API's DB connections, and that surfaces as a 500 - observed on a CI build
// as `API error: 500 (/votes/VTANR5L17V8374/)` on a vote that serves 200 on
// every manual request. That case needs the patient tail, for the same reason
// 429 does. Before MON-275 the pages swallowed it into a soft-404, so a
// transient 500 shipped a prerendered "not found" page for a real vote; now
// it propagates, and without the patient tail it would fail the build instead.
const SERVER_ERROR_DELAYS_MS = [200, 400, 2_000, 15_000, 30_000]
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
  throw new ApiError(lastStatus, path)
}

// Same retry policy as apiFetch, but a 404 means "nothing to show" rather
// than an error — used by endpoints with a genuine empty state, like
// /quiz/weekly on a recess week with no qualifying scrutin (MON-185).
async function apiFetchOptional<T>(path: string, opts?: { revalidate?: number }): Promise<T | null> {
  let lastStatus = 0
  let serverErrorAttempt = 0
  let rateLimitAttempt = 0
  for (;;) {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      next: { revalidate: opts?.revalidate ?? 300 },
    })
    if (res.ok) return res.json()
    if (res.status === 404) return null
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
  throw new ApiError(lastStatus, path)
}

async function apiPost<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
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
    scorecards: () =>
      apiFetch<{ total: number; items: ScorecardRow[] }>('/deputies/scorecards', { revalidate: 3600 }),
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
  groups: {
    get: (slug: string) =>
      apiFetch<GroupDetail>(`/groups/${encodeURIComponent(slug)}`, { revalidate: 3600 }),
  },
  themes: {
    get: (slug: string, params?: { limit?: number; offset?: number }) => {
      const q = new URLSearchParams()
      if (params?.limit) q.set('limit', String(params.limit))
      if (params?.offset) q.set('offset', String(params.offset))
      const qs = q.toString()
      return apiFetch<ThemeDetail>(
        `/themes/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`,
        { revalidate: 3600 }
      )
    },
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
  quiz: {
    // The question set is a versioned repo file server-side (ADR-025) — it only
    // changes by deploy, so cache it as aggressively as immutable snapshots.
    questions: () => apiFetch<QuizQuestionsResponse>('/quiz/questions', { revalidate: 86400 }),
    // Same qualifying scrutin all week (MON-185); null on a recess week with
    // no qualifying scrutin — the homepage widget renders nothing then.
    weekly: () => apiFetchOptional<QuizWeeklyQuestion>('/quiz/weekly', { revalidate: 3600 }),
    match: (
      answers: Array<{ vote_id: string; position: QuizAnswerPosition }>,
      department?: string,
      focusDeputyId?: string
    ) =>
      apiPost<QuizMatchResponse>('/quiz/match', {
        answers,
        ...(department ? { department } : {}),
        ...(focusDeputyId ? { focus_deputy_id: focusDeputyId } : {}),
      }),
    // Sends the answers, not the result: the server recomputes before storing
    // (ADR-025) so a share can never carry client-forged percentages.
    // `includeAnswers` is opt-in, default off (ADR-028, MON-184) — it stores
    // the answers themselves so a later visitor can run a friend comparison.
    share: (
      answers: Array<{ vote_id: string; position: QuizAnswerPosition }>,
      department?: string,
      includeAnswers?: boolean
    ) =>
      apiPost<QuizShareResult>('/quiz/share', {
        answers,
        ...(department ? { department } : {}),
        ...(includeAnswers ? { include_answers: true } : {}),
      }),
    // Immutable snapshots — cache like chat shares / verifications.
    getShare: (id: string) => apiFetch<QuizShareResult>(`/quiz/share/${id}`, { revalidate: 86400 }),
  },
  search: (question: string, signal?: AbortSignal) =>
    apiPost<SearchResult>('/search/', { question }, signal),
  verify: (claim: string, signal?: AbortSignal) =>
    apiPost<VerifyResult>('/verify/', { claim }, signal),
  // Verdicts are immutable snapshots (ADR-022) — cache aggressively.
  verification: (id: string) => apiFetch<VerifyResult>(`/verify/${id}`, { revalidate: 86400 }),
  // Chat shares are immutable snapshots too (ADR-024) — same caching approach.
  shareAnswer: (result: SearchResult) =>
    apiPost<ChatShareResult>('/search/share', {
      question: result.question,
      answer: result.answer,
      sources: result.sources,
      confidence: result.confidence,
      data_source: result.data_source,
      caveat: result.caveat,
    }),
  chatShare: (id: string) => apiFetch<ChatShareResult>(`/search/share/${id}`, { revalidate: 86400 }),
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

// CSV export download URLs (MON-97) — plain hrefs, the browser downloads
// straight from the API (Content-Disposition: attachment).
export const csvUrl = {
  scorecard: () => `${API_BASE}/deputies/scorecard.csv`,
  deputyVotes: (id: string) => `${API_BASE}/deputies/${encodeURIComponent(id)}/votes.csv`,
  votePositions: (id: string) => `${API_BASE}/votes/${encodeURIComponent(id)}/positions.csv`,
}
