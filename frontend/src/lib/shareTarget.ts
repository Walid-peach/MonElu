// Web Share Target (MON-115): turn a shared payload (title/text/url from the
// OS share sheet) into a claim string suitable for the chat's verify mode.
//
// Platform quirks this normalizes:
// - Android Chrome often puts the page URL inside `text` instead of `url`.
// - Some apps send the same string as both `title` and `text`.
// - Shared text can exceed the verify input's 500-character limit.

/** Mirrors VERIFY_MAX_LENGTH in the chat page - POST /verify/ rejects longer claims. */
export const SHARED_CLAIM_MAX_LENGTH = 500

const URL_PATTERN = /https?:\/\/\S+/gi

export function buildSharedClaim(
  title: string | null,
  text: string | null,
  url: string | null,
): string {
  void url // links are not verifiable claims - only human-written text is kept
  const parts: string[] = []
  for (const raw of [title, text]) {
    const cleaned = (raw ?? '').replace(URL_PATTERN, ' ').replace(/\s+/g, ' ').trim()
    if (!cleaned) continue
    // Dedupe apps that duplicate the title into the text: keep only the
    // superset when one part contains the other.
    if (parts.some(p => p.includes(cleaned))) continue
    const idx = parts.findIndex(p => cleaned.includes(p))
    if (idx >= 0) parts[idx] = cleaned
    else parts.push(cleaned)
  }
  return parts.join(' - ').slice(0, SHARED_CLAIM_MAX_LENGTH).trim()
}
