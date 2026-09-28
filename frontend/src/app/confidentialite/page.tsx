import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'
import { CONTACT_EMAIL, canonicalUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Politique de confidentialité - MonÉlu',
  description:
    'Ce que MonÉlu collecte, pourquoi, sur quelle base légale, combien de temps, et vos droits sur ces données (RGPD).',
  alternates: { canonical: canonicalUrl('/confidentialite') },
}

const pStyle = { fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }
const pSpaced = { ...pStyle, margin: '10px 0 0' }
const listStyle = {
  fontSize: '15px',
  lineHeight: 1.85,
  color: 'var(--dp-text-secondary)',
  margin: '10px 0 0',
  paddingLeft: '20px',
}
const linkStyle = { color: 'var(--dp-text)' }
const strong = { color: 'var(--dp-text)' }

function MailLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>
      {CONTACT_EMAIL}
    </a>
  )
}

/**
 * Rewritten with the sign-in flow (#415, ADR-040 §6): the previous version
 * stated that MonÉlu asks for no account, e-mail or password, and argued from
 * that to having no cookie banner. Both stopped being true the day sign-in
 * shipped, so this page now lists every stored field with its reason, the
 * legal basis, the session cookie and the banner position, retention, and the
 * export and deletion rights. Keep it in step with `app_private` (migration
 * 013) - a new column is a new line here.
 */
// When `/mon-compte` (#416) ships the export, edit and delete controls, the
// "Vos droits" and "Durée de conservation" sections must say they are
// self-serve there - until then they are honoured by email, and the page says
// only that.
export default function ConfidentialitePage() {
  return (
    <LegalPageLayout eyebrow="RGPD" title="Politique de confidentialité">

      <LegalSection title="Le principe">
        <p style={pStyle}>
          Consulter MonÉlu ne demande rien : fiches des députés, votes, ordre du jour, quiz et recherche sont
          accessibles sans compte, sans e-mail et sans cookie. Le compte est facultatif. Il sert à retrouver vos
          députés et vos thèmes suivis d&apos;un appareil à l&apos;autre, et rien de ce que le site publie
          n&apos;est réservé aux personnes connectées. Il n&apos;y a pas de mot de passe : la connexion se fait par
          un code à usage unique envoyé par e-mail.
        </p>
      </LegalSection>

      <LegalSection id="compte" title="Ce qui est enregistré si vous créez un compte">
        <p style={pStyle}>Chaque donnée est listée avec la raison pour laquelle elle est demandée.</p>
        <ul style={listStyle}>
          <li>
            <strong style={strong}>Adresse e-mail</strong> - pour vous envoyer le code de connexion. C&apos;est
            votre identifiant : elle n&apos;est utilisée pour rien d&apos;autre, ni lettre d&apos;information, ni
            alerte, ni transmission à un tiers.
          </li>
          <li>
            <strong style={strong}>Identifiant technique du compte</strong> - un numéro aléatoire qui relie vos
            données à votre connexion, sans rien révéler de vous.
          </li>
          <li>
            <strong style={strong}>Nom d&apos;affichage</strong> (facultatif) - pour personnaliser
            l&apos;accueil de votre espace. Un prénom ou un pseudonyme suffit.
          </li>
          <li>
            <strong style={strong}>Langue préférée</strong> - pour afficher le site dans votre langue
            (français par défaut).
          </li>
          <li>
            <strong style={strong}>Département et circonscription</strong> (facultatifs) - pour retrouver
            votre député et ceux de votre département. Aucune adresse ni commune n&apos;est demandée.
          </li>
          <li>
            <strong style={strong}>Députés suivis, thèmes suivis et votes enregistrés</strong> - pour composer
            votre tableau de bord. Ils ne sont enregistrés que parce que vous les choisissez.
          </li>
          <li>
            <strong style={strong}>Préférences de notification</strong> - un emplacement prévu pour
            d&apos;éventuelles alertes, vide par défaut. MonÉlu n&apos;envoie aucune alerte : le seul e-mail
            jamais envoyé est le code de connexion.
          </li>
          <li>
            <strong style={strong}>Dates de création et de modification</strong> de ces éléments - pour
            l&apos;export de vos données et le bon fonctionnement du service.
          </li>
          <li>
            <strong style={strong}>Journaux de sécurité de la connexion</strong> - date de dernière connexion et,
            côté prestataire d&apos;authentification, adresse IP des demandes de code, pour limiter les abus
            (envois répétés, tentatives de deviner un code).
          </li>
        </ul>
        <p style={pSpaced}>
          Ne sont jamais demandés : mot de passe, date de naissance, genre, adresse postale, numéro de téléphone.
          Aucun profil politique n&apos;est déduit de ce que vous suivez : vos choix sont conservés tels quels,
          servent uniquement à afficher votre espace, et ne sont ni analysés, ni agrégés en étiquette, ni
          partagés.
        </p>
      </LegalSection>

      <LegalSection title="Base légale">
        <p style={pStyle}>
          Le compte, l&apos;adresse e-mail, la langue et le territoire sont traités pour fournir le service que
          vous demandez en créant un compte (article 6.1.b du RGPD). Les députés et thèmes que vous suivez
          peuvent laisser deviner des centres d&apos;intérêt politiques : ils ne sont enregistrés que sur votre
          action explicite, qui vaut consentement (articles 6.1.a et 9.2.a), et vous pouvez le retirer à tout
          moment en cessant de les suivre ou en supprimant votre compte. Les journaux de sécurité reposent sur
          l&apos;intérêt légitime à protéger le service contre les abus (article 6.1.f).
        </p>
      </LegalSection>

      <LegalSection title="Qui traite ces données">
        <p style={pStyle}>
          Les données du compte sont stockées dans la base de données de MonÉlu, hébergée par Supabase, qui assure
          aussi l&apos;authentification : c&apos;est Supabase qui détient votre adresse e-mail et vérifie le code.
          Le code est acheminé par Resend, prestataire d&apos;envoi d&apos;e-mails. La session est lue par le
          serveur du site (Vercel), qui interroge l&apos;API de MonÉlu (Railway) en votre nom. Ces prestataires
          agissent comme sous-traitants et ne peuvent pas utiliser vos données pour leur propre compte ; leurs
          coordonnées figurent dans les{' '}
          <Link href="/mentions-legales" style={linkStyle}>mentions légales</Link>.
        </p>
      </LegalSection>

      <LegalSection id="cookies" title="Cookie de session et absence de bandeau">
        <p style={pStyle}>
          Lorsque vous demandez un code ou vous connectez, le site dépose un ou plusieurs cookies techniques,
          dont le nom commence par <code>sb-</code>. Ils contiennent votre session de connexion. Ils sont
          marqués <code>HttpOnly</code> : aucun script de la page, y compris celui du site, ne peut les lire.
          Ils ne sont envoyés qu&apos;à MonÉlu, ne servent à aucun suivi ni à aucune publicité, et expirent à la
          déconnexion ou au plus tard après 13 mois.
        </p>
        <p style={pSpaced}>
          Aucun bandeau de consentement n&apos;est affiché, et ce choix est délibéré : un cookie strictement
          nécessaire à un service que vous avez expressément demandé - ici, rester connecté après avoir saisi
          votre code - est exempté de consentement (article 82 de la loi Informatique et Libertés, lignes
          directrices de la CNIL). Tant que vous ne demandez pas de code, aucun cookie n&apos;est déposé. La mesure
          d&apos;audience décrite plus bas n&apos;utilise pas de cookie. Si un traceur non essentiel était un
          jour ajouté, un bandeau le serait avec lui.
        </p>
      </LegalSection>

      <LegalSection id="conservation" title="Durée de conservation">
        <ul style={{ ...listStyle, margin: 0 }}>
          <li>
            Les données du compte sont conservées tant que le compte existe. Sa suppression est immédiate et
            totale : profil, territoire, suivis, votes enregistrés et préférences sont effacés en une fois,
            sans délai de grâce ni copie conservée.
          </li>
          <li>
            Votre adresse e-mail est détenue par le service d&apos;authentification, distinct de ces tables :
            elle n&apos;est pas effacée par la suppression du compte, mais l&apos;est sur simple demande à{' '}
            <MailLink />.
          </li>
          <li>
            Les comptes inactifs ne sont pas supprimés automatiquement aujourd&apos;hui. Un compte inutilisé reste
            en place jusqu&apos;à ce que vous le supprimiez ou demandiez son effacement.
          </li>
          <li>La déconnexion efface immédiatement le cookie de session de votre navigateur.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Mesure d'audience">
        <p style={pStyle}>
          Le site utilise Vercel Analytics et Vercel Speed Insights pour mesurer la fréquentation et les
          performances de chargement. Ces outils sont sans cookies : ils n&apos;utilisent aucun identifiant
          persistant, ne permettent pas de suivre un visiteur d&apos;une session à l&apos;autre et ne sont pas
          reliés à votre compte. À ce titre, ils relèvent de l&apos;exemption de consentement prévue par la CNIL
          pour les mesures d&apos;audience non intrusives.
        </p>
      </LegalSection>

      <LegalSection title="Stockage local (navigateur)">
        <p style={pStyle}>
          Quelques éléments sont enregistrés dans le <code>localStorage</code> de votre navigateur, avec ou sans
          compte, et ne sont jamais transmis à nos serveurs :
        </p>
        <ul style={listStyle}>
          <li>l&apos;historique de vos conversations avec l&apos;assistant IA (page Chat) ;</li>
          <li>votre préférence d&apos;affichage clair / sombre ;</li>
          <li>le député suivi depuis la page Mon député, et la date de votre dernière visite de sa fiche.</li>
        </ul>
        <p style={pSpaced}>
          Ces données restent sur votre appareil. Vous pouvez les effacer à tout moment en vidant les données de
          site de votre navigateur pour MonÉlu.
        </p>
      </LegalSection>

      <LegalSection title="Assistant de recherche (RAG)">
        <p style={pStyle}>
          Les questions que vous posez à l&apos;assistant sont envoyées à notre API, qui interroge un modèle de
          langage hébergé par Groq pour générer une réponse. Ces requêtes ne sont pas associées à une identité,
          même lorsque vous êtes connecté·e, et aucune adresse IP n&apos;est journalisée à des fins de
          profilage. Elles peuvent être conservées de façon agrégée et anonyme à des fins de suivi de qualité du
          service.
        </p>
      </LegalSection>

      <LegalSection title="Données sur les députés">
        <p style={pStyle}>
          Les informations affichées sur les député·e·s (votes, présence, parti, mandat) concernent des personnes
          publiques dans l&apos;exercice de leur mandat électif et proviennent de sources officielles ouvertes
          (voir <Link href="/licence-donnees" style={linkStyle}>Licence des données</Link>). Ce
          traitement s&apos;appuie sur l&apos;intérêt légitime d&apos;information du public prévu par le RGPD.
        </p>
      </LegalSection>

      <LegalSection id="droits" title="Vos droits">
        <p style={pStyle}>
          Vous disposez d&apos;un droit d&apos;accès, de rectification, d&apos;effacement, de portabilité et
          d&apos;opposition sur les données vous concernant, et du droit de retirer votre consentement à tout
          moment. Pour les exercer - obtenir une copie de tout ce qui est stocké, corriger une information,
          supprimer votre compte ou effacer votre adresse e-mail - écrivez à <MailLink /> depuis
          l&apos;adresse de votre compte.
        </p>
        <p style={pSpaced}>
          Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL
          (
          <a href="https://www.cnil.fr/fr/plaintes" style={linkStyle} rel="noopener noreferrer" target="_blank">
            cnil.fr/fr/plaintes
          </a>
          ).
        </p>
      </LegalSection>

    </LegalPageLayout>
  )
}
