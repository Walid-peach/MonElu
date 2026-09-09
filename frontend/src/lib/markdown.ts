import type { Alignment, Deputy, DeputyVoteItem, Scorecard, VoteDetail } from '@/lib/api'
import { anDossierUrl } from '@/lib/an'
import { departmentLabel } from '@/lib/departments'
import { groupSlug } from '@/lib/groups'
import { CAVEATS, calculationDefinitions } from '@/lib/llms'
import { canonicalUrl, SITE_URL } from '@/lib/site'
import { formatDate } from '@/lib/utils'

/**
 * The Markdown twins served at `/deputes/{id}.md`, `/votes/{id}.md` and
 * `/methodologie.md` (MON-271, ADR pending) - explicit `.md` URLs rather than
 * `Accept`-header negotiation, so there is no `Vary` risk on a site that is
 * heavily ISR-cached: negotiating on `Accept` without `Vary: Accept` is
 * exactly the defect an external agent-readiness scan flagged.
 *
 * Kept as one formatter module so `rag/` or a future MCP server (MON-259) can
 * reuse the same rendering rather than re-deriving it from the API responses.
 */

function list(lines: string[]): string {
  return lines.map(line => `- ${line}`).join('\n')
}

/** The caveats every Markdown twin repeats inline, so the file is a citable source on its own. */
function inlineCaveats(): string {
  return `## À savoir avant de citer un chiffre

${list(CAVEATS)}`
}

/**
 * The mandate line, built from whichever of the two dates is actually present.
 *
 * Every date here goes through `formatDate`, which is `new Date(s)` - and
 * `new Date('')` is `Invalid Date`, so coercing a null date to `''` would
 * print the literal string "Invalid Date" into a document whose whole purpose
 * is to be quoted verbatim by a model. `mandate_start` and `mandate_end` are
 * both `string | null` (every `schemas.py` field is Optional to match DB
 * NULLs), so the null case is skipped rather than formatted.
 */
function mandateLine(deputy: Deputy): string {
  const start = deputy.mandate_start ? `depuis le ${formatDate(deputy.mandate_start)}` : null
  const end = deputy.mandate_end
    ? `jusqu'au ${formatDate(deputy.mandate_end)} (mandat terminé)`
    : null
  const parts = [start, end].filter(Boolean)
  return `- **Mandat :** ${parts.length > 0 ? parts.join(', ') : 'dates non renseignées'}`
}

export function buildDeputyMarkdown(params: {
  deputy: Deputy
  scorecard: Scorecard | null
  alignment: Alignment | null
  recentVotes: DeputyVoteItem[]
}): string {
  const { deputy, scorecard, alignment, recentVotes } = params
  const htmlUrl = canonicalUrl(`/deputes/${deputy.deputy_id}`)
  const deptLabel = departmentLabel(deputy.department)
  const slug = groupSlug(deputy.party)

  const identityLines = [
    `- **Groupe :** ${deputy.party ? (slug ? `[${deputy.party}](${SITE_URL}/groupes/${slug})` : deputy.party) : 'Non inscrit'}`,
    `- **Département :** ${deptLabel ?? 'Inconnu'}`,
    mandateLine(deputy),
  ]

  const presencePct = scorecard ? Math.round((scorecard.presence_rate ?? 0) * 100) : null
  const solennelPct = scorecard ? Math.round((scorecard.solennel_participation_rate ?? 0) * 100) : null
  const alignmentPct = alignment ? Math.round(alignment.party_alignment_rate * 100) : null

  const figures = scorecard ? [
    `- **Scrutins votés :** ${scorecard.total_votes.toLocaleString('fr-FR')}`,
    `- **Pour / Contre / Abstention :** ${scorecard.votes_for.toLocaleString('fr-FR')} / ${scorecard.votes_against.toLocaleString('fr-FR')} / ${scorecard.abstentions.toLocaleString('fr-FR')}`,
    `- **Taux de présence :** ${presencePct}% - compte le \`nonVotant\` comme présent, dénominateur limité au mandat de ce·tte député·e`,
    `- **Participation aux scrutins solennels :** ${solennelPct}% (${scorecard.solennels_cast}/${scorecard.eligible_solennels})`,
  ] : ['_Scorecard indisponible pour le moment._']

  const alignmentSection = alignment && alignmentPct !== null
    ? `## Alignement avec son groupe

- **Vote avec son groupe :** ${alignmentPct}%
- **Votes dissidents :** ${alignment.dissident_votes} sur ${alignment.total_votes} votes comptabilisés
- Comparaison faite avec le groupe **actuel** du député, même s'il en a changé en cours de mandat.`
    : null

  const votesSection = recentVotes.length > 0
    ? `## Votes récents

${recentVotes.map(v => {
  const date = v.voted_at ? formatDate(v.voted_at) : 'date inconnue'
  const result = v.result ? `, scrutin ${v.result}` : ''
  return `- **${date}${result} :** a voté \`${v.position}\` sur « ${v.vote_title} » - [${SITE_URL}/votes/${v.vote_id}](${SITE_URL}/votes/${v.vote_id})${v.summary_plain ? `\n  ${v.summary_plain}` : ''}`
}).join('\n')}`
    : null

  return [
    `# ${deputy.full_name}`,
    `Député·e, XVIIᵉ législature. Version texte de [${htmlUrl}](${htmlUrl}).`,
    `## Identité\n\n${identityLines.join('\n')}`,
    `## Chiffres du mandat\n\n${figures.join('\n')}`,
    alignmentSection,
    votesSection,
    inlineCaveats(),
    `[Méthodologie complète](${SITE_URL}/methodologie.md)`,
  ].filter(Boolean).join('\n\n') + '\n'
}

export function buildVoteMarkdown(vote: VoteDetail): string {
  const htmlUrl = canonicalUrl(`/votes/${vote.vote_id}`)
  const dossierUrl = anDossierUrl(vote.dossier_id)

  const tallies = [
    `- **Résultat :** ${vote.result}`,
    `- **Date :** ${formatDate(vote.voted_at)}`,
    `- **Pour :** ${vote.votes_for.toLocaleString('fr-FR')}`,
    `- **Contre :** ${vote.votes_against.toLocaleString('fr-FR')}`,
    `- **Abstentions :** ${vote.abstentions.toLocaleString('fr-FR')}`,
    `- **Total des votants enregistrés :** ${vote.total_voters.toLocaleString('fr-FR')}`,
  ]
  if (dossierUrl) tallies.push(`- **Dossier législatif :** [${dossierUrl}](${dossierUrl})`)

  return [
    `# ${vote.vote_title}`,
    `Scrutin de l'Assemblée nationale, XVIIᵉ législature. Version texte de [${htmlUrl}](${htmlUrl}).`,
    vote.summary_plain ? `## Résumé\n\n${vote.summary_plain}` : null,
    `## Résultat et décompte\n\n${tallies.join('\n')}`,
    inlineCaveats(),
    `[Méthodologie complète](${SITE_URL}/methodologie.md)`,
  ].filter(Boolean).join('\n\n') + '\n'
}

export function buildMethodologieMarkdown(): string {
  return [
    '# Méthodologie',
    "Comment MonÉlu calcule chaque chiffre affiché : présence, alignement de groupe, majorité, et limites connues. Version texte de " +
      `[${canonicalUrl('/methodologie')}](${canonicalUrl('/methodologie')}).`,
    inlineCaveats(),
    `## Définitions de calcul\n\n${calculationDefinitions()}`,
  ].join('\n\n') + '\n'
}
