import type { Metadata } from 'next'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'
import { SITE_URL, canonicalUrl } from '@/lib/site'

const API_BASE = 'https://monelu-production.up.railway.app'

export const metadata: Metadata = {
  title: 'Développeurs - MonÉlu',
  description: "Documentation de l'API MonÉlu : endpoints, limites de débit, clés d'accès et licence des données.",
  alternates: { canonical: canonicalUrl('/developpeurs') },
}

const textStyle = { fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }
const codeBlockStyle = {
  background: 'var(--dp-page-bg)',
  border: '1px solid var(--dp-border-subtle)',
  borderRadius: '8px',
  padding: '14px 18px',
  fontSize: '14px',
  color: 'var(--dp-text)',
  fontFamily: 'monospace',
  overflowX: 'auto' as const,
}

export default function DeveloppeursPage() {
  return (
    <LegalPageLayout eyebrow="API" title="Construire avec MonÉlu">
      <LegalSection title="L'API">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          MonÉlu expose l&apos;intégralité des votes et des fiches de députés via une API REST publique.
          Chaque endpoint est décrit avec ses paramètres, ses schémas de réponse, un exemple de charge
          utile et les mises en garde méthodologiques qui s&apos;y appliquent :
        </p>
        <ul style={{ fontSize: '15px', lineHeight: 1.85, color: 'var(--dp-text-secondary)', margin: '0 0 10px', paddingLeft: '20px' }}>
          <li>
            <a href={`${API_BASE}/openapi.json`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dp-text)', fontWeight: 600 }}>
              {API_BASE}/openapi.json
            </a>
            {' '}- la spécification OpenAPI brute. C&apos;est le format à donner à un agent, à un client
            généré, ou à un pont MCP.
          </li>
          <li>
            <a href={`${API_BASE}/docs`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dp-text)', fontWeight: 600 }}>
              {API_BASE}/docs
            </a>
            {' '}- la même spécification, en documentation interactive (Swagger UI), pour explorer à la main.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Limites de débit">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Toute requête anonyme partage un même quota par adresse IP :
        </p>
        <ul style={{ fontSize: '15px', lineHeight: 1.85, color: 'var(--dp-text-secondary)', margin: '0 0 10px', paddingLeft: '20px' }}>
          <li><strong>30 requêtes / minute</strong> sur la plupart des endpoints (listes, fiches, votes).</li>
          <li><strong>10 requêtes / minute</strong> sur les endpoints coûteux (scorecards, alignement, recherche sémantique).</li>
        </ul>
        <p style={textStyle}>
          Une clé d&apos;API donne un quota individuel plus élevé sur ces mêmes limites (multiple de la limite
          anonyme selon la clé) - utile si vous scrapez le jeu de données complet ou intégrez MonÉlu dans un
          produit. Le comportement anonyme reste inchangé.
        </p>
      </LegalSection>

      <LegalSection title="Obtenir une clé">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Les clés sont émises manuellement pour l&apos;instant - pas d&apos;inscription en libre-service.
          Écrivez à{' '}
          <a href="mailto:walidelkhoukh99@gmail.com" style={{ color: 'var(--dp-text)' }}>walidelkhoukh99@gmail.com</a>{' '}
          en précisant votre usage prévu (recherche, rédaction, produit) et le volume de requêtes attendu.
        </p>
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Une fois la clé reçue, passez-la dans l&apos;en-tête <code>X-API-Key</code> de chaque requête :
        </p>
        <div style={codeBlockStyle}>
          curl -H &quot;X-API-Key: votre_cle&quot; {API_BASE}/deputies/
        </div>
      </LegalSection>

      <LegalSection title="Suivre votre usage">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Chaque clé peut consulter son propre historique de requêtes des 30 derniers jours, par endpoint et
          par jour :
        </p>
        <div style={codeBlockStyle}>
          curl -H &quot;X-API-Key: votre_cle&quot; {API_BASE}/keys/usage
        </div>
      </LegalSection>

      <LegalSection title="Intégrer un vote (oEmbed)">
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Chaque page de scrutin expose un encart embarquable et déclare un point d&apos;accès{' '}
          <a href="https://oembed.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dp-text)' }}>oEmbed</a>.
          Sur Notion, Slack, Substack, Ghost, WordPress ou Discourse, coller l&apos;URL de la page suffit :
          l&apos;encart s&apos;affiche à la place du lien.
        </p>
        <p style={{ ...textStyle, marginBottom: '10px' }}>
          Pour les intégrations sur mesure, le point d&apos;accès répond directement :
        </p>
        <div style={codeBlockStyle}>
          curl &quot;{SITE_URL}/api/oembed?url={SITE_URL}/votes/VTANR5L17V1234&amp;format=json&quot;
        </div>
        <p style={{ ...textStyle, margin: '10px 0 0' }}>
          La réponse est une charge utile oEmbed <code>rich</code> standard (<code>version</code>,{' '}
          <code>type</code>, <code>title</code>, <code>width</code>, <code>height</code>, <code>html</code>).
          Les paramètres <code>maxwidth</code> et <code>maxheight</code> sont pris en compte,{' '}
          <code>format</code> n&apos;accepte que <code>json</code> (le XML renvoie 501). Une URL qui ne
          désigne pas un scrutin de MonÉlu renvoie 404. Le bouton &laquo;&nbsp;Intégrer&nbsp;&raquo; d&apos;une
          page de scrutin donne le même encart sous forme d&apos;<code>&lt;iframe&gt;</code> à copier, pour les
          plateformes qui ne parlent pas oEmbed.
        </p>
      </LegalSection>

      <LegalSection title="Licence des données">
        <p style={textStyle}>
          Les données servies par l&apos;API sont publiées sous la Licence Ouverte / Open Licence 2.0
          (&laquo;&nbsp;Etalab 2.0&nbsp;&raquo;) - réutilisation libre, y compris commerciale, sous réserve
          d&apos;attribution. Détails complets sur la page{' '}
          <a href="/licence-donnees" style={{ color: 'var(--dp-text)' }}>Licence des données</a>.
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
