import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — MonÉlu',
  description: 'Ce que MonÉlu collecte, pourquoi, et vos droits sur ces données (RGPD).',
}

export default function ConfidentialitePage() {
  return (
    <div style={{ background: '#F7F4ED', minHeight: '100vh' }}>
      <div style={{ padding: '72px 56px 56px', background: 'linear-gradient(180deg,#ffffff 0%,#F7F4ED 100%)', borderBottom: '1px solid #ECE7DC' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div className="text-red-civic font-semibold text-xs tracking-[0.18em] uppercase mb-4">RGPD</div>
          <h1 className="font-newsreader text-headline" style={{ fontWeight: 600, lineHeight: 1.1, letterSpacing: '-0.02em', color: '#1B2B50', margin: 0 }}>
            Politique de confidentialité
          </h1>
        </div>
      </div>

      <div style={{ padding: '56px', background: '#fff' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '36px' }}>

          <section>
            <h2 style={{ fontWeight: 700, fontSize: '17px', color: '#1B2B50', margin: '0 0 12px' }}>Le principe</h2>
            <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
              MonÉlu ne demande pas de compte, pas d&apos;e-mail, pas de mot de passe. Aucune donnée personnelle n&apos;est
              nécessaire pour consulter les fiches de députés, les votes ou utiliser la recherche. Ce qui suit détaille
              précisément ce qui est techniquement collecté malgré tout.
            </p>
          </section>

          <section>
            <h2 style={{ fontWeight: 700, fontSize: '17px', color: '#1B2B50', margin: '0 0 12px' }}>Mesure d&apos;audience</h2>
            <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
              Le site utilise Vercel Analytics et Vercel Speed Insights pour mesurer la fréquentation et les
              performances de chargement. Ces outils sont sans cookies : ils n&apos;utilisent aucun identifiant
              persistant et ne permettent pas de suivre un visiteur d&apos;une session à l&apos;autre. À ce titre, ils
              relèvent de l&apos;exemption de consentement prévue par la CNIL pour les mesures d&apos;audience non
              intrusives — aucun bandeau de cookies n&apos;est donc affiché. Cette analyse sera revue si un outil de
              tracking plus intrusif est introduit à l&apos;avenir.
            </p>
          </section>

          <section>
            <h2 style={{ fontWeight: 700, fontSize: '17px', color: '#1B2B50', margin: '0 0 12px' }}>Stockage local (navigateur)</h2>
            <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: '0 0 10px' }}>
              Deux éléments sont enregistrés dans le <code>localStorage</code> de votre navigateur, jamais transmis à
              nos serveurs :
            </p>
            <ul style={{ fontSize: '15px', lineHeight: 1.85, color: '#4B5563', margin: 0, paddingLeft: '20px' }}>
              <li>l&apos;historique de vos conversations avec l&apos;assistant IA (page Chat) ;</li>
              <li>votre préférence d&apos;affichage clair / sombre.</li>
            </ul>
            <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: '10px 0 0' }}>
              Ces données restent sur votre appareil. Vous pouvez les effacer à tout moment en vidant les données de
              site de votre navigateur pour monelu.
            </p>
          </section>

          <section>
            <h2 style={{ fontWeight: 700, fontSize: '17px', color: '#1B2B50', margin: '0 0 12px' }}>Assistant de recherche (RAG)</h2>
            <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
              Les questions que vous posez à l&apos;assistant sont envoyées à notre API, qui interroge un modèle de
              langage hébergé par Groq pour générer une réponse. Ces requêtes ne sont pas associées à une identité —
              aucun compte, aucune adresse IP n&apos;est journalisée à des fins de profilage. Elles peuvent être
              conservées de façon agrégée et anonyme à des fins de suivi de qualité du service.
            </p>
          </section>

          <section>
            <h2 style={{ fontWeight: 700, fontSize: '17px', color: '#1B2B50', margin: '0 0 12px' }}>Données sur les députés</h2>
            <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
              Les informations affichées sur les député·e·s (votes, présence, parti, mandat) concernent des personnes
              publiques dans l&apos;exercice de leur mandat électif et proviennent de sources officielles ouvertes
              (voir <Link href="/licence-donnees" style={{ color: '#1B2B50' }}>Licence des données</Link>). Ce
              traitement s&apos;appuie sur l&apos;intérêt légitime d&apos;information du public prévu par le RGPD.
            </p>
          </section>

          <section>
            <h2 style={{ fontWeight: 700, fontSize: '17px', color: '#1B2B50', margin: '0 0 12px' }}>Vos droits</h2>
            <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
              Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification et de suppression sur
              toute donnée vous concernant. Pour l&apos;exercer, écrivez à{' '}
              <a href="mailto:walidelkhoukh99@gmail.com" style={{ color: '#1B2B50' }}>walidelkhoukh99@gmail.com</a>.
            </p>
          </section>

          <section>
            <h2 style={{ fontWeight: 700, fontSize: '17px', color: '#1B2B50', margin: '0 0 12px' }}>Évolutions à venir</h2>
            <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
              Cette politique sera mise à jour si de nouvelles fonctionnalités impliquant des données personnelles
              sont ajoutées, notamment un système d&apos;abonnement par e-mail pour suivre un député ou un thème.
            </p>
          </section>

        </div>
      </div>
    </div>
  )
}
