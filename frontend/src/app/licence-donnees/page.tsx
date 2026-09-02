import type { Metadata } from 'next'
import { JsonLd } from '@/components/JsonLd'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'
import { buildDataLicenseJsonLd } from '@/lib/seo'
import { canonicalUrl } from '@/lib/site'

export const metadata: Metadata = {
  title: 'Licence des données - MonÉlu',
  description: "Sous quelle licence sont publiées les données de MonÉlu, et à quelles conditions vous pouvez les réutiliser.",
  alternates: { canonical: canonicalUrl('/licence-donnees') },
}

export default function LicenceDonneesPage() {
  return (
    <LegalPageLayout eyebrow="Réutilisation" title="Licence des données">
      <JsonLd data={buildDataLicenseJsonLd()} />

      <LegalSection title="Origine des données">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }}>
          Les données servies par MonÉlu (scrutins, positions de vote, fiches de députés) proviennent des flux
          open data officiels de l&apos;Assemblée nationale française et de data.gouv.fr. Ces sources publient
          leurs données sous la Licence Ouverte / Open Licence 2.0, dite &laquo;&nbsp;Etalab 2.0&nbsp;&raquo;.
        </p>
      </LegalSection>

      <LegalSection title="Ce que dit la Licence Ouverte 2.0">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: '0 0 10px' }}>
          La Licence Ouverte autorise la réutilisation libre des données, y compris à des fins commerciales, sous
          réserve de :
        </p>
        <ul style={{ fontSize: '15px', lineHeight: 1.85, color: 'var(--dp-text-secondary)', margin: 0, paddingLeft: '20px' }}>
          <li>mentionner la paternité de l&apos;information (source et date de mise à jour) ;</li>
          <li>ne pas induire en erreur des tiers quant au contenu, à la source ou à la date de mise à jour ;</li>
          <li>ne pas suggérer que le producteur original cautionne votre réutilisation.</li>
        </ul>
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: '10px 0 0' }}>
          Texte complet :{' '}
          <a href="https://www.etalab.gouv.fr/licence-ouverte-open-licence" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dp-text)' }}>
            etalab.gouv.fr/licence-ouverte-open-licence
          </a>
        </p>
      </LegalSection>

      <LegalSection title="Réutiliser les données MonÉlu">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: '0 0 10px' }}>
          Que vous consommiez l&apos;API REST, exportiez un tableau en CSV, ou intégriez une fiche de vote sur
          votre propre site, les mêmes conditions Etalab 2.0 s&apos;appliquent puisque MonÉlu ne fait que
          structurer et redistribuer les données sources - il n&apos;en devient pas propriétaire. Attribution
          suggérée :
        </p>
        <div style={{ background: 'var(--dp-page-bg)', border: '1px solid var(--dp-border-subtle)', borderRadius: '8px', padding: '14px 18px', fontSize: '14px', color: 'var(--dp-text)', fontFamily: 'monospace' }}>
          Données : Assemblée nationale, via monelu.fr - Licence Ouverte 2.0
        </div>
      </LegalSection>

      <LegalSection title="Ce qui n'est pas couvert">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }}>
          Le code source de la plateforme (ingestion, API, interface) est distribué séparément sur GitHub sous sa
          propre licence de dépôt, indépendante de la licence des données elles-mêmes. Les résumés en langage
          clair générés par l&apos;assistant IA sont une aide à la lecture et n&apos;ont pas valeur de source
          officielle - la donnée brute et son lien vers le document original priment toujours.
        </p>
      </LegalSection>

      <LegalSection title={'Une question sur un usage précis ?'}>
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }}>
          Écrivez à{' '}
          <a href="mailto:walidelkhoukh99@gmail.com" style={{ color: 'var(--dp-text)' }}>walidelkhoukh99@gmail.com</a> - en
          particulier pour tout usage à grande échelle de l&apos;API (au-delà du rate-limiting public).
        </p>
      </LegalSection>

    </LegalPageLayout>
  )
}
