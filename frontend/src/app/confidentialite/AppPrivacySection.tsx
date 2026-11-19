import { LegalSection } from '@/components/LegalPageLayout'
import { EMBEDDING_PROVIDER, LLM_PROVIDER } from '@/lib/aiModels'

const pStyle = { fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }
const listStyle = {
  fontSize: '15px',
  lineHeight: 1.85,
  color: 'var(--dp-text-secondary)',
  margin: '10px 0 0',
  paddingLeft: '20px',
}
const strong = { color: 'var(--dp-text)' }
const itemGap = { marginTop: '8px' }

/**
 * What the iPhone app does with data (#708), the part of this page App Review
 * compares with the app and its privacy labels (guideline 5.1.1).
 *
 * Every sentence is checked against the code, and must move with it:
 * - on the phone: `UserDefaultsFollowedDeputyStore` (follows and their
 *   `lastSeenVoteAt` reading positions), `UserDefaultsFollowedThemesStore`,
 *   `AppearancePreference` (`@AppStorage`), `UserDefaultsAppConfigCache`, and
 *   the shared `URLCache` (`MonEluAPI.configureURLCache`); `MonEluAccount` is
 *   a stub no target imports, so the app has no account;
 * - `GET /feed` receives the followed ids as query parameters, which
 *   uvicorn's access log on Railway prints with the client IP;
 * - portraits: `photo_url` from `scripts/ingest_deputies.py`;
 * - address and postal code: `AddressLookup` (data.geopf.fr) and
 *   `PostalCodeService` (geo.api.gouv.fr), both on ephemeral sessions; the
 *   point goes to `POST /circonscriptions/locate`, kept out of logs and of
 *   Sentry (`_SENTRY_BODYLESS_PATHS` in `api/main.py`);
 * - Demander: `POST /search/` and `POST /verify/` embed the text with
 *   OpenAI (`rag/chain/retriever.py`) and call Groq; `/verify/` inserts every
 *   verdict it returns; `/search/share`, `/quiz/share` and `/feedback/chat`
 *   store what the user sends; both chains log the text on an error;
 * - no analytics, advertising or crash SDK and no push (ios/CLAUDE.md rule 8).
 *
 * The same facts are declared in `ios/MonElu/Resources/PrivacyInfo.xcprivacy`
 * and in the App Store privacy labels: change all three together.
 */
export function AppPrivacySection() {
  return (
    <LegalSection id="application" title="Application iPhone">
      <p style={pStyle}>
        L&apos;application MonÉlu pour iPhone affiche les mêmes données que le site. Elle ne propose pas de
        compte et ne demande ni e-mail, ni mot de passe, ni nom. Elle ne contient aucun outil de mesure
        d&apos;audience, de publicité ou de suivi, ne vous suit pas d&apos;une application à l&apos;autre et
        n&apos;envoie pas de notifications.
      </p>
      <ul style={listStyle}>
        <li>
          <strong style={strong}>Ce qui reste sur votre téléphone.</strong> Les députés et les thèmes que vous
          suivez, le dernier vote déjà affiché pour chaque député suivi et votre choix d&apos;affichage clair ou
          sombre sont enregistrés dans l&apos;application, avec sa configuration technique et une copie des
          pages publiques déjà consultées. Aucun de ces éléments n&apos;est rattaché à un compte, et supprimer
          l&apos;application les efface.
        </li>
        <li style={itemGap}>
          <strong style={strong}>L&apos;accueil.</strong> Pour composer le fil « Pour vous », l&apos;application
          envoie à l&apos;API de MonÉlu les identifiants des députés et des thèmes suivis. L&apos;API s&apos;en
          sert pour répondre et ne les enregistre pas. Comme pour toute requête, le journal technique de
          l&apos;hébergeur de l&apos;API (Railway) garde l&apos;adresse demandée, qui contient ces identifiants,
          et l&apos;adresse IP de l&apos;appareil.
        </li>
        <li style={itemGap}>
          <strong style={strong}>Les portraits.</strong> Les photos des députés sont chargées directement
          depuis le site de l&apos;Assemblée nationale (www.assemblee-nationale.fr), qui reçoit donc ces
          requêtes.
        </li>
        <li style={itemGap}>
          <strong style={strong}>Trouver son député.</strong> L&apos;adresse que vous tapez part directement du
          téléphone vers la Base Adresse Nationale (data.geopf.fr, service public de l&apos;IGN), et un code
          postal vers le service public de découpage administratif (geo.api.gouv.fr). Ces deux échanges ne
          laissent aucune trace sur le téléphone. MonÉlu ne reçoit ni l&apos;adresse ni le code postal : seulement
          les coordonnées de l&apos;adresse choisie, pour trouver la circonscription, qui ne sont ni conservées
          ni journalisées.
        </li>
        <li style={itemGap}>
          <strong style={strong}>Demander.</strong> Une question ou une affirmation tapée est envoyée à
          l&apos;API de MonÉlu, qui la transmet à {EMBEDDING_PROVIDER} pour chercher les passages pertinents et
          à {LLM_PROVIDER} pour rédiger la réponse. Une question n&apos;est pas conservée. Une affirmation
          vérifiée l&apos;est toujours, avec son verdict, à une adresse web non devinable que vous pouvez
          partager. Si l&apos;API rencontre une erreur, le texte en cause figure dans son journal d&apos;erreurs.
        </li>
        <li style={itemGap}>
          <strong style={strong}>Partages et avis.</strong> Quand vous partagez une réponse ou un résultat de
          quiz, ou notez une réponse, MonÉlu enregistre ce que vous envoyez : la question, la réponse et ses
          sources, ou les scores du quiz (vos réponses seulement si vous cochez l&apos;option qui les inclut).
          Rien de cela n&apos;est relié à une identité.
        </li>
        <li style={itemGap}>
          <strong style={strong}>Les erreurs.</strong> L&apos;application n&apos;envoie aucun rapport
          d&apos;erreur. L&apos;API de MonÉlu signale ses propres erreurs à Sentry, son service de suivi des
          erreurs, sans jamais y inclure les coordonnées d&apos;une adresse.
        </li>
      </ul>
    </LegalSection>
  )
}
