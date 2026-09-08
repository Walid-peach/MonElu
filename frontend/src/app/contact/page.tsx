import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'
import { CONTACT_EMAIL, canonicalUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Contact - MonÉlu',
  description:
    "Qui édite MonÉlu et comment le joindre : signaler une erreur de données, demander une clé d'API, contacter le projet pour la presse ou la recherche.",
  alternates: { canonical: canonicalUrl('/contact') },
}

const pStyle = { fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }
const linkStyle = { color: 'var(--dp-text)' }
const listStyle = {
  fontSize: '15px',
  lineHeight: 1.85,
  color: 'var(--dp-text-secondary)',
  margin: '10px 0 0',
  paddingLeft: '20px',
}

function MailLink() {
  return (
    <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>
      {CONTACT_EMAIL}
    </a>
  )
}

export default function ContactPage() {
  return (
    <LegalPageLayout eyebrow="Contact" title="Nous écrire">

      <LegalSection title="Qui édite MonÉlu">
        <p style={pStyle}>
          MonÉlu est édité à titre individuel par Walid Elkhoukh, data engineer, sans but lucratif et sans
          rattachement à un parti, à une institution ou à un média. Le projet ne produit aucune donnée de vote :
          il structure et redistribue l&apos;open data de l&apos;Assemblée nationale. Les informations légales
          complètes (éditeur, directeur de la publication, hébergeurs) sont sur la page{' '}
          <Link href="/mentions-legales" style={linkStyle}>mentions légales</Link>, et les partis pris du projet
          sur <Link href="/a-propos" style={linkStyle}>à propos</Link>.
        </p>
        <p style={{ ...pStyle, margin: '10px 0 0' }}>
          Une seule adresse pour tout le site : <MailLink />. Elle est relevée par une personne, pas par un
          service ; les délais indiqués plus bas en tiennent compte.
        </p>
      </LegalSection>

      <LegalSection title="Signaler une erreur de données">
        <p style={pStyle}>
          C&apos;est le message le plus utile que vous puissiez envoyer. Le chemin le plus court ne passe pas par
          l&apos;e-mail : chaque fiche de député et chaque fiche de scrutin porte un bouton{' '}
          <strong>« Signaler une erreur »</strong> qui transmet le signalement avec l&apos;URL et
          l&apos;identifiant de la page concernée déjà attachés. Utilisez-le en priorité - c&apos;est ce qui
          rend un signalement exploitable sans allers-retours.
        </p>
        <p style={{ ...pStyle, margin: '10px 0 0' }}>
          Par e-mail, précisez :
        </p>
        <ul style={listStyle}>
          <li>l&apos;URL exacte de la page ;</li>
          <li>ce que MonÉlu affiche, et ce que dit la source officielle ;</li>
          <li>si possible, le lien vers le scrutin sur assemblee-nationale.fr.</li>
        </ul>
        <p style={{ ...pStyle, margin: '10px 0 0' }}>
          Avant d&apos;écrire, vérifiez sur la page{' '}
          <Link href="/methodologie" style={linkStyle}>méthodologie</Link> qu&apos;il ne s&apos;agit pas d&apos;une
          définition de calcul plutôt que d&apos;une erreur : le taux de présence compte les{' '}
          <code>nonVotant</code> comme présents, l&apos;alignement de groupe se mesure toujours contre le groupe
          actuel du député, et la base de production ne couvre les scrutins que depuis le 1er juillet 2025. Un
          écart avec le site de l&apos;Assemblée vient souvent de là. À l&apos;inverse, le résultat d&apos;un
          scrutin (adopté / rejeté) est repris tel quel et jamais recalculé : s&apos;il diffère, c&apos;est un
          vrai bug.
        </p>
      </LegalSection>

      <LegalSection title="Demander une clé d'API">
        <p style={pStyle}>
          L&apos;API REST est publique et utilisable sans clé, dans la limite du quota anonyme partagé par
          adresse IP. Une clé donne un quota individuel plus élevé ; elles sont émises manuellement, il n&apos;y
          a pas d&apos;inscription en libre-service. Écrivez à <MailLink /> en précisant votre usage prévu
          (recherche, rédaction, produit) et le volume de requêtes attendu.
        </p>
        <p style={{ ...pStyle, margin: '10px 0 0' }}>
          Les limites de débit, l&apos;en-tête <code>X-API-Key</code> et le suivi de consommation sont documentés
          sur <Link href="/developpeurs" style={linkStyle}>développeurs</Link>. Si vous avez seulement besoin du
          jeu de données, les exports CSV de <Link href="/donnees" style={linkStyle}>données</Link> évitent
          complètement l&apos;API.
        </p>
      </LegalSection>

      <LegalSection title="Presse et recherche">
        <p style={pStyle}>
          Pour une demande de presse, un travail universitaire ou une réutilisation des données dans une
          publication, écrivez à <MailLink /> avec le média ou le laboratoire, l&apos;angle et votre échéance.
          Les chiffres sont reproductibles : la définition de chaque statistique est publiée sur{' '}
          <Link href="/methodologie" style={linkStyle}>méthodologie</Link>, avec le code qui l&apos;implémente.
        </p>
        <p style={{ ...pStyle, margin: '10px 0 0' }}>
          La réutilisation des données ne demande aucune autorisation préalable : elles sont sous Licence
          Ouverte 2.0, avec une simple obligation d&apos;attribution détaillée sur{' '}
          <Link href="/licence-donnees" style={linkStyle}>licence des données</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Vie privée, accessibilité, mentions légales">
        <p style={pStyle}>
          Pour exercer vos droits sur vos données personnelles ou poser une question RGPD, voir{' '}
          <Link href="/confidentialite" style={linkStyle}>confidentialité</Link>. Pour signaler un contenu
          inaccessible ou demander une alternative, voir la{' '}
          <Link href="/accessibilite" style={linkStyle}>déclaration d&apos;accessibilité</Link>. Ces deux pages
          renvoient à la même adresse, mais décrivent ce qui est attendu dans le message.
        </p>
      </LegalSection>

      <LegalSection title="Contribuer au code">
        <p style={pStyle}>
          MonÉlu est open source. Un bug technique reproductible, une proposition de fonctionnalité ou un correctif
          sont mieux traités en issue ou en pull request sur{' '}
          <a href="https://github.com/Walid-peach/MonElu" target="_blank" rel="noopener noreferrer" style={linkStyle}>
            GitHub
          </a>{' '}
          que par e-mail : la discussion y reste publique et vérifiable.
        </p>
      </LegalSection>

      <LegalSection title="Délais de réponse">
        <p style={pStyle}>
          Le projet est tenu par une seule personne, en dehors de tout cadre professionnel. Comptez 48 heures pour
          une question technique ou un signalement d&apos;erreur, un peu plus pour une demande de presse ou de clé
          d&apos;API. Un signalement passé par le bouton « Signaler une erreur » n&apos;attend pas de réponse
          individuelle : il est traité directement dans les données.
        </p>
      </LegalSection>

    </LegalPageLayout>
  )
}
