import type { Metadata } from 'next'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'

const REPO_BASE = 'https://github.com/Walid-peach/MonElu/blob/master'
const LINEAGE_DOCS = 'https://walid-peach.github.io/MonElu/dbt-docs/'

export const metadata: Metadata = {
  title: 'Méthodologie - MonÉlu',
  description:
    "Comment MonÉlu calcule chaque chiffre affiché : présence, alignement de parti, majorité, et limites connues.",
}

const textStyle = { fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }
const linkStyle = { color: 'var(--dp-text)', fontWeight: 600 }
const sourceLineStyle = { fontSize: '13.5px', color: 'var(--dp-text-secondary)', margin: '10px 0 0' }

export default function MethodologiePage() {
  return (
    <LegalPageLayout eyebrow="Vérifiabilité" title="Méthodologie">
      <LegalSection id="intro" title="Pourquoi cette page">
        <p style={textStyle}>
          Un chiffre affiché sans méthode n&apos;est qu&apos;une affirmation. Cette page décrit, en français
          courant, comment chaque statistique de MonÉlu est calculée : la formule exacte, le code source qui
          l&apos;implémente, et ses limites connues. Aucun calcul n&apos;est fait &laquo;&nbsp;à la main&nbsp;&raquo;
          ni ajusté au cas par cas - tout part des données publiques de l&apos;Assemblée nationale et suit une
          règle unique, appliquée de la même façon à chaque député et chaque groupe.
        </p>
      </LegalSection>

      <LegalSection id="presence" title="Taux de présence">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Le taux de présence d&apos;un député compte <strong>toute position enregistrée</strong> lors d&apos;un
          scrutin : pour, contre, abstention, <strong>et non-votant</strong>. Un député &laquo;&nbsp;non-votant&nbsp;&raquo;
          était présent dans l&apos;hémicycle sans exprimer de vote - c&apos;est une particularité documentée des
          données de l&apos;Assemblée, pas une absence.
        </p>
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Le dénominateur n&apos;est pas &laquo;&nbsp;tous les scrutins depuis juillet 2024&nbsp;&raquo; mais
          uniquement les scrutins tenus <strong>pendant le mandat</strong> du député (entre sa date de début et sa
          date de fin de mandat, le cas échéant). Un député élu en cours de législature n&apos;est donc pas
          pénalisé pour des votes antérieurs à son entrée en fonction.
        </p>
        <p style={textStyle}>
          Ce calcul unique est la <strong>seule</strong> définition de la présence utilisée sur MonÉlu - l&apos;API,
          l&apos;assistant de recherche et les fiches députés s&apos;y conforment tous. C&apos;est pourquoi Yaël
          Braun-Pivet, Présidente de l&apos;Assemblée nationale, affiche 100&nbsp;% de présence : elle est recensée
          sur chaque scrutin par construction des données de l&apos;AN.
        </p>
        <p style={sourceLineStyle}>
          Source :{' '}
          <a href={`${REPO_BASE}/transform/models/marts/mart_deputy_scorecard.sql`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            mart_deputy_scorecard.sql
          </a>{' '}
          ·{' '}
          <a href={`${REPO_BASE}/docs/decisions.md`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            ADR-019, décision architecturale
          </a>
        </p>
      </LegalSection>

      <LegalSection id="deputes-suivis" title="Pourquoi le nombre de députés varie">
        <p style={textStyle}>
          L&apos;Assemblée nationale compte 577 sièges. Le compteur &laquo;&nbsp;députés suivis&nbsp;&raquo;
          affiché sur MonÉlu dénombre l&apos;ensemble des député·e·s ayant siégé au moins une fois depuis le
          début de la XVIIᵉ législature (7 juillet 2024) - y compris celles et ceux remplacé·e·s en cours de
          mandat (décès, nomination au gouvernement, invalidation d&apos;élection). Ce total est donc
          naturellement supérieur à 577.
        </p>
      </LegalSection>

      <LegalSection id="alignement" title="Alignement de parti et votes dissidents">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Pour chaque scrutin, MonÉlu calcule la <strong>position majoritaire</strong> du groupe parlementaire du
          député (pour, contre ou abstention - les non-votants ne comptent pas dans ce calcul). Un vote du député
          est dit &laquo;&nbsp;dissident&nbsp;&raquo; lorsque sa position diffère de celle-ci.
        </p>
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          <strong>Limite connue :</strong> l&apos;historique complet du député est comparé à son groupe
          parlementaire <strong>actuel</strong>, même s&apos;il en a changé en cours de mandat. Un député ayant
          changé de groupe verra donc ses votes antérieurs au changement évalués par rapport à son nouveau groupe,
          pas celui auquel il appartenait au moment du vote.
        </p>
        <p style={textStyle}>
          En cas d&apos;égalité stricte entre deux positions au sein d&apos;un groupe (par exemple 40 pour /
          40 contre), le départage suit une règle déterministe et documentée dans le code plutôt qu&apos;un
          résultat arbitraire dépendant de l&apos;ordre de retour de la base de données.
        </p>
        <p style={sourceLineStyle}>
          Source :{' '}
          <a href={`${REPO_BASE}/transform/models/marts/mart_party_alignment.sql`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            mart_party_alignment.sql
          </a>{' '}
          ·{' '}
          <a href={`${REPO_BASE}/transform/models/intermediate/int_party_vote_majority.sql`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            int_party_vote_majority.sql
          </a>
        </p>
      </LegalSection>

      <LegalSection id="quiz" title="Le quiz « Quel député vote comme vous ? »">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Le quiz compare vos réponses aux positions <strong>réellement enregistrées</strong> de chaque
          député sur les mêmes scrutins. Votre pourcentage d&apos;accord avec un député est simplement&nbsp;:
          nombre de scrutins où vous avez voté pareil, divisé par le nombre de scrutins comparables.
          Seules les positions <strong>exprimées</strong> comptent (pour, contre, abstention)&nbsp;: un député
          non-votant ou absent sur un scrutin n&apos;est ni d&apos;accord ni en désaccord avec vous - ce
          scrutin est simplement retiré du dénominateur pour ce député.
        </p>
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          <strong>Seuil de comparabilité&nbsp;:</strong> un député (ou un groupe) n&apos;apparaît dans le
          classement que s&apos;il a une position exprimée sur au moins la moitié de vos réponses, avec un
          minimum de deux scrutins - un seul scrutin partagé ne fait pas un profil politique. Même règle
          pour le &laquo;&nbsp;député le plus éloigné&nbsp;&raquo;&nbsp;: un 0&nbsp;% calculé sur deux votes
          ne peut pas faire la une du résultat.
        </p>
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          L&apos;accord avec un <strong>groupe parlementaire</strong> se calcule contre sa ligne majoritaire,
          scrutin par scrutin&nbsp;: la position exprimée la plus fréquente parmi ses membres. Si deux
          positions sont à égalité stricte au sein du groupe, le groupe n&apos;a pas de ligne sur ce scrutin
          et il est ignoré pour ce calcul.
        </p>
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          <strong>Le questionnaire</strong> est un ensemble d&apos;une dizaine de scrutins réels, choisi selon
          trois critères&nbsp;: des votes sur l&apos;ensemble d&apos;un texte (pas des amendements), une forte
          participation (au moins 400 votants sur 577), et un vrai clivage (le camp minoritaire pèse au moins
          35&nbsp;% des pour+contre exprimés). La sélection est versionnée (par exemple
          &laquo;&nbsp;2026-Q3&nbsp;&raquo;), revue trimestriellement, et chaque résultat partagé garde la
          version du questionnaire qui l&apos;a produit. La formulation des questions reste descriptive du
          texte voté, jamais orientée.
        </p>
        <p style={textStyle}>
          <strong>Vie privée&nbsp;:</strong> le calcul se fait côté serveur mais rien n&apos;est
          enregistré - ni vos réponses, ni votre code postal. Seul un résultat que vous choisissez
          explicitement de partager est stocké, et il est alors <strong>recalculé par le serveur</strong> à
          partir de vos réponses&nbsp;: une carte de résultat MonÉlu ne peut pas contenir de pourcentages
          fabriqués.
        </p>
        <p style={sourceLineStyle}>
          Source :{' '}
          <a href={`${REPO_BASE}/api/routers/quiz.py`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            quiz.py
          </a>{' '}
          ·{' '}
          <a href={`${REPO_BASE}/api/quiz_data.py`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            quiz_data.py (questionnaire versionné)
          </a>{' '}
          ·{' '}
          <a href={`${REPO_BASE}/docs/decisions.md`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            ADR-025, décision architecturale
          </a>
        </p>
      </LegalSection>

      <LegalSection id="adopte-rejete" title="Vote adopté ou rejeté">
        <p style={textStyle}>
          Le résultat d&apos;un scrutin (adopté ou rejeté) n&apos;est jamais recalculé par MonÉlu : il est repris
          tel quel du champ officiel publié par l&apos;Assemblée nationale pour ce scrutin. La 17ᵉ législature
          n&apos;ayant pas de majorité stable, les scrutins rejetés sont, à ce jour, plus nombreux que les scrutins
          adoptés.
        </p>
        <p style={sourceLineStyle}>
          Source :{' '}
          <a href={`${REPO_BASE}/transform/models/staging/stg_votes.sql`} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            stg_votes.sql
          </a>
        </p>
      </LegalSection>

      <LegalSection id="horizon" title="Horizon des données et fréquence de mise à jour">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          La base de production couvre les scrutins depuis le <strong>1er juillet 2025</strong> (limite de
          l&apos;offre gratuite de la base de données hébergée ; l&apos;historique complet depuis le début de la
          législature, le 7 juillet 2024, est disponible en environnement de développement).
        </p>
        <p style={textStyle}>
          Les données sont actualisées <strong>automatiquement chaque jour ouvré à 6h UTC</strong> : ingestion des
          nouveaux scrutins et fiches de députés, reconstruction de l&apos;index de recherche sémantique, puis
          recalcul des statistiques agrégées (présence, alignement, scorecards).
        </p>
      </LegalSection>

      <LegalSection id="limites" title="Limites connues">
        <ul style={{ fontSize: '15px', lineHeight: 1.85, color: 'var(--dp-text-secondary)', margin: 0, paddingLeft: '20px' }}>
          <li>
            <strong>Non-votant ≠ abstention</strong> : un non-votant était présent sans exprimer d&apos;opinion ;
            une abstention est une position exprimée. Les pourcentages pour/contre/abstention affichés se
            calculent uniquement sur les positions exprimées (non-votant exclu de ce calcul-là, mais inclus dans
            la présence).
          </li>
          <li>
            <strong>Parti actuel, pas parti historique</strong> : voir la limite décrite ci-dessus pour
            l&apos;alignement de parti.
          </li>
          <li>
            <strong>2 députés sur 577</strong> n&apos;ont pas de groupe parlementaire actif identifié dans les
            données source - cas limite documenté, non un bug d&apos;ingestion.
          </li>
          <li>
            <strong>Les réponses de l&apos;assistant de recherche</strong> (IA) sont une aide à la lecture, pas
            une source officielle - la donnée brute et son scrutin d&apos;origine font toujours foi. Voir la{' '}
            <a href="/licence-donnees" style={linkStyle}>licence des données</a>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="code" title="Code source et traçabilité">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          L&apos;intégralité du code de transformation des données (ingestion, agrégation, API) est publique. Le
          schéma de dépendances entre les modèles de données (lineage) est généré automatiquement à chaque
          modification :
        </p>
        <p style={textStyle}>
          <a href={LINEAGE_DOCS} target="_blank" rel="noopener noreferrer" style={linkStyle}>
            Documentation et lineage dbt
          </a>{' '}
          ·{' '}
          <a href="https://github.com/Walid-peach/MonElu" target="_blank" rel="noopener noreferrer" style={linkStyle}>
            Code source sur GitHub
          </a>
        </p>
      </LegalSection>

      <LegalSection id="contact" title="Une erreur ou une incohérence à signaler ?">
        <p style={textStyle}>
          Écrivez à{' '}
          <a href="mailto:walidelkhoukh99@gmail.com" style={{ color: 'var(--dp-text)' }}>walidelkhoukh99@gmail.com</a> en
          précisant le député, le scrutin ou la page concernée. Toute correction de méthode fait l&apos;objet
          d&apos;une mise à jour de cette page.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
