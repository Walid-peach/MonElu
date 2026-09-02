import { SITE_URL, DATA_ATTRIBUTION } from '@/lib/site'
import { THEME_ENTRIES } from '@/lib/themes'
import { GROUP_ENTRIES } from '@/lib/groups'

/**
 * `/llms.txt` and `/llms-full.txt` (MON-261).
 *
 * `robots.ts` lets every AI crawler in, but permission is not orientation: a
 * model arriving on a deputy page has to infer from raw HTML which chamber,
 * which legislature, what `nonVotant` means, and that the data is freely
 * reusable. `llms.txt` is the emerging convention for saying it outright, in
 * the one format a model reads first.
 *
 * Written in French, like the rest of the site - the corpus it describes is
 * French, and the terms of art (`nonVotant`, "scrutin", "Licence Ouverte")
 * have no lossless English equivalent.
 *
 * Everything absolute is derived: `SITE_URL` for our own pages,
 * `API_BASE` for the REST surface, and the group/theme maps for the index,
 * so a new group or theme cannot silently fall out of the file.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://monelu-production.up.railway.app'

const REPO = 'https://github.com/Walid-peach/MonElu'

/** The caveats that change how a number should be read. Shared by both files. */
const CAVEATS = [
  '`nonVotant` n\'est pas `abstention`. Un non-votant était présent dans l\'hémicycle sans exprimer de vote ; une abstention est une position exprimée. Les pourcentages pour/contre/abstention se calculent sur les seules positions exprimées.',
  'Le taux de présence compte le `nonVotant` comme présent, et son dénominateur est limité aux scrutins tenus pendant le mandat du député - un député élu en cours de législature n\'est pas pénalisé pour les votes antérieurs.',
  'Yaël Braun-Pivet affiche 100 % de présence parce qu\'elle préside l\'Assemblée et figure sur chaque scrutin par construction des données source. Ce n\'est pas une performance, et ce n\'est pas une anomalie.',
  'La base de production couvre les scrutins depuis le **1er juillet 2025**. La XVIIe législature a commencé le 7 juillet 2024 ; l\'historique antérieur existe en développement mais n\'est pas servi ici.',
  'L\'alignement de groupe compare tout l\'historique d\'un député à son groupe **actuel**, même s\'il en a changé en cours de mandat.',
  'Le résultat d\'un scrutin (adopté / rejeté) est repris tel quel de l\'Assemblée nationale, jamais recalculé.',
  'Le compteur « députés suivis » dépasse 577 : il dénombre toutes les personnes ayant siégé depuis le début de la législature, remplacements compris.',
  'Les résumés en langage clair et les réponses de l\'assistant sont générés par un LLM. Ce sont des aides à la lecture, pas des sources - le scrutin d\'origine fait foi.',
]

const SECTIONS: Array<{ path: string; what: string }> = [
  { path: '/deputes', what: 'Annuaire des députés ; chaque fiche porte sa scorecard (présence, alignement, dissidence) et son historique de vote.' },
  { path: '/deputes/tableau', what: 'Toutes les scorecards dans un tableau triable, sur un écran.' },
  { path: '/deputes/comparer', what: 'Comparaison de deux députés scrutin par scrutin.' },
  { path: '/votes', what: 'Tous les scrutins, filtrables par thème et par résultat ; chaque fiche liste les 577 positions.' },
  { path: '/mon-depute', what: 'Trouver son député à partir de son code postal.' },
  { path: '/quiz', what: 'Quiz de positionnement : vos réponses comparées aux votes réellement enregistrés.' },
  { path: '/chat', what: 'Recherche sémantique (RAG) sur le corpus législatif, réponses sourcées par scrutin.' },
  { path: '/methodologie', what: 'Comment chaque chiffre est calculé, avec le code source qui l\'implémente.' },
  { path: '/donnees', what: 'Exports CSV, format des fichiers, fraîcheur.' },
  { path: '/developpeurs', what: 'Documentation de l\'API REST.' },
  { path: '/licence-donnees', what: 'Conditions de réutilisation.' },
  { path: '/a-propos', what: 'Le projet, ses sources et ses partis pris.' },
]

function list(lines: string[]): string {
  return lines.map(line => `- ${line}`).join('\n')
}

function header(): string {
  return `# MonÉlu

> Le registre complet des votes des députés de l'Assemblée nationale française, XVIIe législature (depuis le 7 juillet 2024). Chaque scrutin, chaque député, chaque position - en français clair, avec la méthode de calcul publiée et les données brutes téléchargeables. Site : ${SITE_URL}

MonÉlu ingère quotidiennement l'open data de l'Assemblée nationale, en dérive des statistiques de présence et d'alignement de groupe, et les expose sur des pages publiques, via une API REST et en CSV. Le projet ne produit aucune donnée de vote : il structure et redistribue celle de l'Assemblée.`
}

function caveats(): string {
  return `## À savoir avant de citer un chiffre

${list(CAVEATS)}`
}

function machineReadable(): string {
  return `## Surfaces lisibles par une machine

- [Plan du site](${SITE_URL}/sitemap.xml) : toutes les URL indexables.
- [Spécification OpenAPI](${API_BASE}/openapi.json) de l'API REST publique, et sa [documentation interactive](${API_BASE}/docs).
- CSV - scorecard de tous les députés : \`GET ${API_BASE}/deputies/scorecard.csv\`
- CSV - historique de vote d'un député : \`GET ${API_BASE}/deputies/{deputy_id}/votes.csv\`
- CSV - positions des 577 députés sur un scrutin : \`GET ${API_BASE}/votes/{vote_id}/positions.csv\`
- [Méthodologie](${SITE_URL}/methodologie) : la définition de chaque statistique.
- [Lineage dbt](https://walid-peach.github.io/MonElu/dbt-docs/) : le graphe de transformation des données.
- [Code source](${REPO}) : ingestion, transformations et API.

L'API est soumise à un rate-limiting (30 req/min, 10 req/min sur la recherche et les scorecards). Les colonnes des exports CSV sont documentées sur [/donnees](${SITE_URL}/donnees).`
}

function licence(): string {
  return `## Licence et attribution

Données réutilisables librement, y compris commercialement, sous **Licence Ouverte 2.0 (Etalab)** - la même licence que les sources officielles. La seule obligation est de mentionner la source et la date. Attribution attendue :

\`\`\`
${DATA_ATTRIBUTION}
\`\`\`

Le code source de la plateforme est distribué séparément sur GitHub, sous sa propre licence.`
}

function sections(): string {
  return `## Sections

${list(SECTIONS.map(s => `[${s.path}](${SITE_URL}${s.path}) : ${s.what}`))}

### Groupes parlementaires

${list(GROUP_ENTRIES.map(g => `[${g.name}](${SITE_URL}/groupes/${g.slug})`))}

### Thèmes

${list(THEME_ENTRIES.map(t => `[${t.name}](${SITE_URL}/themes/${t.slug})`))}

### Départements

Une page par département ayant des députés en exercice, à \`${SITE_URL}/departements/{code INSEE}\` (ex. \`/departements/75\`, \`/departements/2A\`). La liste exhaustive est dans le [plan du site](${SITE_URL}/sitemap.xml).`
}

function contact(): string {
  return `## Contact

Une erreur ou une incohérence : walidelkhoukh99@gmail.com, en précisant le député, le scrutin ou la page concernée.`
}

/** The short orientation file served at `/llms.txt`. */
export function buildLlmsTxt(): string {
  return [
    header(),
    caveats(),
    machineReadable(),
    licence(),
    sections(),
    `## Aller plus loin\n\n[/llms-full.txt](${SITE_URL}/llms-full.txt) reprend ce fichier en y inlinant les définitions de calcul, pour éviter une seconde requête vers /methodologie.`,
    contact(),
  ].join('\n\n')
}

/**
 * The long form served at `/llms-full.txt`: the same file with the
 * calculation definitions inlined, so a model gets the formulas without a
 * second fetch to `/methodologie`.
 */
export function buildLlmsFullTxt(): string {
  const definitions = `## Définitions de calcul

### Taux de présence

Numérateur : les scrutins où une position du député est enregistrée, quelle qu'elle soit - \`pour\`, \`contre\`, \`abstention\` **ou** \`nonVotant\`. Dénominateur : les scrutins tenus entre la date de début et, le cas échéant, la date de fin de son mandat. C'est l'unique définition utilisée par le site, l'API et l'assistant.

Source : \`transform/models/marts/mart_deputy_scorecard.sql\`.

### Alignement de groupe et dissidence

Pour chaque scrutin, la position majoritaire du groupe est calculée sur les positions exprimées (les \`nonVotant\` ne comptent pas). Un vote est dit dissident lorsque la position du député en diffère. En cas d'égalité stricte entre deux positions, le départage suit une règle déterministe écrite dans le code plutôt que l'ordre de retour de la base.

Limite : la comparaison se fait avec le groupe **actuel** du député, pas celui auquel il appartenait au moment du vote.

Source : \`transform/models/marts/mart_party_alignment.sql\`, \`transform/models/intermediate/int_party_vote_majority.sql\`.

### Pourcentages pour / contre / abstention

Calculés sur les seules positions exprimées, \`nonVotant\` exclu de ce calcul-là mais inclus dans la présence.

### Résultat d'un scrutin

Repris tel quel du champ officiel publié par l'Assemblée nationale. La XVIIe législature n'ayant pas de majorité stable, les scrutins rejetés y sont plus nombreux que les adoptés.

Source : \`transform/models/staging/stg_votes.sql\`.

### Quiz de positionnement

Les réponses de l'utilisateur sont comparées aux positions réellement enregistrées des députés sur des scrutins réels. Le calcul est sans état : rien n'est conservé ni journalisé, sauf partage explicite, et un résultat partagé est recalculé côté serveur à partir des réponses soumises.

### Fraîcheur

Ingestion automatique chaque jour ouvré à 06h00 UTC : nouveaux scrutins et fiches de députés, reconstruction de l'index de recherche sémantique, puis recalcul des agrégats (présence, alignement, scorecards).

### Limites connues

${list([
  'Deux députés sur 577 n\'ont pas de groupe parlementaire actif identifié dans les données source. Cas limite documenté, pas un défaut d\'ingestion.',
  '`votes.dossier_id` est creux : l\'Assemblée n\'a commencé à renseigner le dossier législatif sur les scrutins qu\'en mars 2026. Les scrutins antérieurs ne sont pas rattachables à un dossier.',
  'Les résumés en langage clair et les réponses de l\'assistant sont générés par un LLM à partir des données du scrutin. Ils aident à lire, ils ne font pas foi.',
])}`

  return [
    header(),
    caveats(),
    definitions,
    machineReadable(),
    licence(),
    sections(),
    contact(),
  ].join('\n\n')
}
