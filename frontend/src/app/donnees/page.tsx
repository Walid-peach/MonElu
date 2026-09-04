import type { Metadata } from 'next'
import Link from 'next/link'
import { JsonLd } from '@/components/JsonLd'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'
import { API_BASE } from '@/lib/api'
import { CSV_EXPORTS } from '@/lib/exports'
import { buildDataCatalogJsonLd } from '@/lib/seo'
import { canonicalUrl, DATA_ATTRIBUTION } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Données ouvertes - MonÉlu',
  description:
    'Téléchargez les données de vote des députés en CSV : positions par scrutin, historique par député, scorecards complètes. Format, fraîcheur et conditions de réutilisation.',
  alternates: { canonical: canonicalUrl('/donnees') },
}

export default function DonneesPage() {
  return (
    <LegalPageLayout eyebrow="Open data" title="Données à emporter">
      <JsonLd data={buildDataCatalogJsonLd()} />

      <LegalSection title="Exports CSV disponibles">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: '0 0 18px' }}>
          Trois exports couvrent l&apos;essentiel du besoin des journalistes et chercheurs. Ils sont
          servis par la même API que le site — mêmes chiffres, aucun décalage. Pour explorer avant
          de télécharger, la <Link href="/deputes/tableau" style={{ color: 'var(--dp-text)' }}>vue tableau des députés</Link>{' '}
          affiche toutes les scorecards triables sur un écran.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {CSV_EXPORTS.map(e => (
            <div key={e.pattern} style={{ background: 'var(--dp-page-bg)', border: '1px solid var(--dp-border-subtle)', borderRadius: '10px', padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '15px', color: 'var(--dp-text)' }}>{e.name}</span>
                {e.href && (
                  <a
                    href={e.href}
                    download
                    style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--dp-red)', textDecoration: 'none', whiteSpace: 'nowrap' }}
                  >
                    Télécharger ↓
                  </a>
                )}
              </div>
              <p style={{ fontSize: '14px', lineHeight: 1.65, color: 'var(--dp-text-secondary)', margin: '8px 0 10px' }}>{e.what}</p>
              <div style={{ fontFamily: 'monospace', fontSize: '12.5px', color: 'var(--dp-text)', marginBottom: 8 }}>
                GET {API_BASE}{e.pattern}
              </div>
              <div style={{ fontSize: '12px', lineHeight: 1.6, color: 'var(--dp-text-muted)' }}>
                Colonnes : {e.columns.join(', ')}
              </div>
            </div>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="Format des fichiers">
        <ul style={{ fontSize: '15px', lineHeight: 1.85, color: 'var(--dp-text-secondary)', margin: 0, paddingLeft: '20px' }}>
          <li>Encodage UTF-8 avec BOM — les accents s&apos;affichent correctement dans Excel et LibreOffice.</li>
          <li>Séparateur virgule, fins de ligne CRLF (RFC 4180). Si votre Excel (réglé en français) place tout dans une colonne, passez par « Données → À partir d&apos;un fichier texte/CSV ».</li>
          <li>Les taux (<code style={{ fontSize: '13px' }}>*_rate</code>, <code style={{ fontSize: '13px' }}>*_pct</code>) sont des ratios entre 0 et 1 ; les dates sont au format ISO 8601.</li>
          <li><code style={{ fontSize: '13px' }}>position</code> vaut <code style={{ fontSize: '13px' }}>pour</code>, <code style={{ fontSize: '13px' }}>contre</code>, <code style={{ fontSize: '13px' }}>abstention</code> ou <code style={{ fontSize: '13px' }}>nonVotant</code> — l&apos;abstention est un acte exprimé, le non-votant était présent sans voter. Détails dans la <Link href="/methodologie" style={{ color: 'var(--dp-text)' }}>méthodologie</Link>.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Fraîcheur des données">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }}>
          La base est mise à jour automatiquement chaque jour ouvré (ingestion à 06h00 UTC depuis
          l&apos;open data de l&apos;Assemblée nationale). Les exports reflètent l&apos;état de la base au moment du
          téléchargement. La base de production couvre les scrutins depuis le 1er juillet 2025 ;
          l&apos;historique complet de la XVIIe législature (depuis juillet 2024) est en cours d&apos;extension.
        </p>
      </LegalSection>

      <LegalSection title="Licence et attribution">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: '0 0 10px' }}>
          Les données sont réutilisables librement, y compris commercialement, sous Licence Ouverte
          2.0 (Etalab) — la même licence que les sources officielles. La seule obligation est de
          mentionner la source et la date. Attribution suggérée :
        </p>
        <div style={{ background: 'var(--dp-page-bg)', border: '1px solid var(--dp-border-subtle)', borderRadius: '8px', padding: '14px 18px', fontSize: '14px', color: 'var(--dp-text)', fontFamily: 'monospace' }}>
          {DATA_ATTRIBUTION}
        </div>
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: '10px 0 0' }}>
          Conditions détaillées sur la page <Link href="/licence-donnees" style={{ color: 'var(--dp-text)' }}>Licence des données</Link>.
        </p>
      </LegalSection>

      <LegalSection title="Besoin de plus que du CSV ?">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }}>
          L&apos;API REST expose les mêmes données en JSON, avec filtres et pagination — documentation
          sur la page <Link href="/developpeurs" style={{ color: 'var(--dp-text)' }}>développeurs</Link>. Les exports CSV sont soumis
          au même rate-limiting que le reste de l&apos;API ; pour un usage intensif, écrivez à{' '}
          <a href="mailto:walidelkhoukh99@gmail.com" style={{ color: 'var(--dp-text)' }}>walidelkhoukh99@gmail.com</a>.
        </p>
      </LegalSection>

    </LegalPageLayout>
  )
}
