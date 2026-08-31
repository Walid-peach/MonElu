/**
 * Question/answer pairs marked up as `FAQPage` JSON-LD (MON-268).
 *
 * Schema.org requires both the question and the answer to be visible to the
 * reader on the page carrying the markup, so these arrays are the *source* of
 * the visible text rather than a parallel copy of it:
 *
 * - `/methodologie` renders each `question` as its section heading, and the
 *   `answer` is a verbatim flattening of the prose already in that section.
 * - `/a-propos` renders both fields directly.
 *
 * `__tests__/app/faq-jsonld.test.tsx` renders both pages and fails if any
 * question or answer here stops appearing in the visible text - which is what
 * keeps a later copy edit from silently turning the markup into a lie.
 */
export type FaqItem = {
  /** Section anchor on the page. Load-bearing on `/methodologie`: `#presence`,
   *  `#limites` and `#deputes-suivis` are deep-linked from deputy pages, vote
   *  pages and the hemicycle chart, so these ids must not change. */
  id: string
  question: string
  answer: string
}

/**
 * `/methodologie` - the definitions models get wrong about French parliamentary
 * data. Answers are the section bodies, paragraph texts joined by a space.
 *
 * `intro` and `contact` are deliberately not here: the first is meta ("why this
 * page exists") and the second would publish a personal address into structured
 * data for no discovery benefit.
 */
export const METHODOLOGIE_FAQ: FaqItem[] = [
  {
    id: 'presence',
    question: "Comment le taux de présence est-il calculé ?",
    answer:
      "Le taux de présence d'un député compte toute position enregistrée lors d'un scrutin : pour, contre, abstention, et non-votant. Un député « non-votant » était présent dans l'hémicycle sans exprimer de vote - c'est une particularité documentée des données de l'Assemblée, pas une absence. Le dénominateur n'est pas « tous les scrutins depuis juillet 2024 » mais uniquement les scrutins tenus pendant le mandat du député (entre sa date de début et sa date de fin de mandat, le cas échéant). Un député élu en cours de législature n'est donc pas pénalisé pour des votes antérieurs à son entrée en fonction. Ce calcul unique est la seule définition de la présence utilisée sur MonÉlu - l'API, l'assistant de recherche et les fiches députés s'y conforment tous. C'est pourquoi Yaël Braun-Pivet, Présidente de l'Assemblée nationale, affiche 100 % de présence : elle est recensée sur chaque scrutin par construction des données de l'AN.",
  },
  {
    id: 'deputes-suivis',
    question: "Pourquoi le nombre de députés suivis dépasse-t-il 577 ?",
    answer:
      "L'Assemblée nationale compte 577 sièges. Le compteur « députés suivis » affiché sur MonÉlu dénombre l'ensemble des député·e·s ayant siégé au moins une fois depuis le début de la XVIIᵉ législature (7 juillet 2024) - y compris celles et ceux remplacé·e·s en cours de mandat (décès, nomination au gouvernement, invalidation d'élection). Ce total est donc naturellement supérieur à 577.",
  },
  {
    id: 'alignement',
    question: "Qu'est-ce qu'un vote dissident ?",
    answer:
      "Pour chaque scrutin, MonÉlu calcule la position majoritaire du groupe parlementaire du député (pour, contre ou abstention - les non-votants ne comptent pas dans ce calcul). Un vote du député est dit « dissident » lorsque sa position diffère de celle-ci. Limite connue : l'historique complet du député est comparé à son groupe parlementaire actuel, même s'il en a changé en cours de mandat. Un député ayant changé de groupe verra donc ses votes antérieurs au changement évalués par rapport à son nouveau groupe, pas celui auquel il appartenait au moment du vote.",
  },
  {
    id: 'quiz',
    question: "Comment le quiz « Quel député vote comme vous ? » calcule-t-il votre accord ?",
    answer:
      "Le quiz compare vos réponses aux positions réellement enregistrées de chaque député sur les mêmes scrutins. Votre pourcentage d'accord avec un député est simplement : nombre de scrutins où vous avez voté pareil, divisé par le nombre de scrutins comparables. Seules les positions exprimées comptent (pour, contre, abstention) : un député non-votant ou absent sur un scrutin n'est ni d'accord ni en désaccord avec vous - ce scrutin est simplement retiré du dénominateur pour ce député.",
  },
  {
    id: 'adopte-rejete',
    question: "Qui décide qu'un vote est adopté ou rejeté ?",
    answer:
      "Le résultat d'un scrutin (adopté ou rejeté) n'est jamais recalculé par MonÉlu : il est repris tel quel du champ officiel publié par l'Assemblée nationale pour ce scrutin. La 17ᵉ législature n'ayant pas de majorité stable, les scrutins rejetés sont, à ce jour, plus nombreux que les scrutins adoptés.",
  },
  {
    id: 'horizon',
    question: "Quelle période couvrent les données, et à quelle fréquence sont-elles mises à jour ?",
    answer:
      "La base de production couvre les scrutins depuis le 1er juillet 2025 (limite de l'offre gratuite de la base de données hébergée ; l'historique complet depuis le début de la législature, le 7 juillet 2024, est disponible en environnement de développement). Les données sont actualisées automatiquement chaque jour ouvré à 6h UTC : ingestion des nouveaux scrutins et fiches de députés, reconstruction de l'index de recherche sémantique, puis recalcul des statistiques agrégées (présence, alignement, scorecards).",
  },
  {
    id: 'limites',
    question: "Quelles sont les limites connues des données ?",
    answer:
      "Non-votant ≠ abstention : un non-votant était présent sans exprimer d'opinion ; une abstention est une position exprimée. Les pourcentages pour/contre/abstention affichés se calculent uniquement sur les positions exprimées (non-votant exclu de ce calcul-là, mais inclus dans la présence). Parti actuel, pas parti historique : voir la limite décrite ci-dessus pour l'alignement de parti. 2 députés sur 577 n'ont pas de groupe parlementaire actif identifié dans les données source - cas limite documenté, non un bug d'ingestion.",
  },
  {
    id: 'code',
    question: "Le code source est-il public ?",
    answer:
      "L'intégralité du code de transformation des données (ingestion, agrégation, API) est publique. Le schéma de dépendances entre les modèles de données (lineage) est généré automatiquement à chaque modification",
  },
]

/**
 * `/a-propos` - what MonÉlu is, where the data comes from, who runs it, what it
 * costs, how often it refreshes.
 *
 * Unlike `/methodologie`, this page had no question-shaped copy to mark up, so
 * these pairs are rendered as a visible "Questions fréquentes" section.
 *
 * The provenance and refresh answers describe what the pipeline *actually*
 * does - the Assemblée nationale open data portal, ingested every weekday at
 * 06:00 UTC - rather than mirroring this page's own "sources" cards, which
 * additionally list data.gouv.fr, Légifrance and the HATVP registry as active
 * feeds. No ingestion script reads any of those three (see `scripts/ingest_*.py`),
 * and structured data is the last place an unverified provenance claim belongs.
 */
export const A_PROPOS_FAQ: FaqItem[] = [
  {
    id: 'faq-quoi',
    question: "Qu'est-ce que MonÉlu ?",
    answer:
      "MonÉlu est une plateforme de transparence civique qui publie le dossier de vote complet de chaque député de l'Assemblée nationale française. Les flux bruts de l'Assemblée sont ingérés, transformés par un pipeline de données de production, puis restitués sous une forme lisible pour les citoyens, les journalistes, les chercheurs et les développeurs.",
  },
  {
    id: 'faq-sources',
    question: "D'où viennent les données ?",
    answer:
      "Toutes les données proviennent du portail open data de l'Assemblée nationale : les exports officiels des scrutins, des positions de vote de chaque député, des fiches d'acteurs et de l'agenda des séances publiques. MonÉlu ne produit aucune donnée : la plateforme les structure, les horodate et les rend traçables jusqu'au scrutin d'origine.",
  },
  {
    id: 'faq-qui',
    question: "Qui est derrière la plateforme ?",
    answer:
      "MonÉlu est développée et maintenue par Walid Elkhoukh, data engineer et responsable de la plateforme. Le code source est public sur GitHub, ce qui rend un audit indépendant possible par n'importe qui.",
  },
  {
    id: 'faq-gratuit',
    question: "MonÉlu est-il gratuit ?",
    answer:
      "Oui. La consultation du site et l'accès à l'API REST documentée sont gratuits, sans abonnement ni création de compte. Les données redistribuées le sont sous licence ouverte Etalab 2.0 : la réutilisation est libre, l'attribution est requise.",
  },
  {
    id: 'faq-frequence',
    question: "À quelle fréquence les données sont-elles mises à jour ?",
    answer:
      "Le pipeline s'exécute automatiquement chaque jour ouvré à 06h00 UTC via GitHub Actions : les nouveaux scrutins, les fiches de députés, l'agenda des séances et le corpus de recherche sémantique sont réingérés, puis les statistiques agrégées (présence, alignement, scorecards) sont recalculées.",
  },
]
