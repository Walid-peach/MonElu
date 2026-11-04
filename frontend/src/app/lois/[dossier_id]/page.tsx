import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { api, nullIfMissing } from '@/lib/api'
import type { LoiDetail } from '@/lib/api'
import {
  collapsedVotesLabel,
  hasHeadlineScrutin,
  loiMetadataText,
  parcoursSections,
  stageTitle,
  statusLabel,
} from '@/lib/lois'
import type { ParcoursRow } from '@/lib/lois'
import { canonicalUrl } from '@/lib/site'
import { formatDate } from '@/lib/utils'
import { LoiAmendements } from './LoiAmendements'
import { LoiScrutinCard } from './LoiScrutinCard'

export const dynamicParams = true
export const revalidate = 86400

export async function generateMetadata(
  { params }: { params: Promise<{ dossier_id: string }> }
): Promise<Metadata> {
  const { dossier_id } = await params
  const alternates = { canonical: canonicalUrl(`/lois/${dossier_id}`) }
  const loi = await api.lois.get(dossier_id).catch(() => null)
  if (!loi) return { alternates }
  const { title, description } = loiMetadataText(loi)
  return {
    title,
    description,
    alternates,
    openGraph: { title, description },
    twitter: { card: 'summary_large_image', title, description },
  }
}

function StatusHeader({ loi }: { loi: LoiDetail }) {
  const status = statusLabel(loi.status)
  return (
    <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
      {status && (
        <span className="rounded-full bg-[color:var(--dp-badge-info-bg)] px-3 py-1 text-[13px] font-semibold text-[color:var(--dp-badge-info-text)]">
          {status}
        </span>
      )}
      {loi.status_label && (
        <span className="min-w-0 max-w-full break-words pt-1 text-[13.5px] text-[color:var(--dp-text-secondary)]">
          Dernière décision : « {loi.status_label} »
        </span>
      )}
    </div>
  )
}

function ActeRow({ row, dossierUid }: { row: ParcoursRow; dossierUid: string }) {
  const { acte } = row
  if (row.kind === 'group') {
    return (
      <li className="pt-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--dp-text-muted)]">
        {acte.libelle}
      </li>
    )
  }
  const collapsed = collapsedVotesLabel(acte.amendement_count, acte.article_count)
  return (
    <li className="flex flex-col gap-2 border-l-2 border-[color:var(--dp-border)] pl-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {acte.date_acte && (
          <span className="font-mono text-[12px] text-[color:var(--dp-text-muted)]">{formatDate(acte.date_acte)}</span>
        )}
        <span className="text-[14.5px] text-[color:var(--dp-text)]">{acte.libelle}</span>
        {row.repeats.length > 0 && (
          <span className="text-[12.5px] text-[color:var(--dp-text-muted)]">
            et {row.repeats.length} autre{row.repeats.length > 1 ? 's' : ''} date{row.repeats.length > 1 ? 's' : ''}
          </span>
        )}
      </div>
      {acte.statut_label && (
        <span className="break-words text-[13.5px] font-semibold text-[color:var(--dp-text)]">
          Résultat : {acte.statut_label}
        </span>
      )}
      {acte.scrutins.map(s => <LoiScrutinCard key={s.vote_id} scrutin={s} />)}
      {collapsed && <LoiAmendements dossierUid={dossierUid} acteUid={acte.acte_uid} label={collapsed} />}
    </li>
  )
}

function Parcours({ loi }: { loi: LoiDetail }) {
  return (
    <ol className="flex flex-col gap-8">
      {parcoursSections(loi.parcours).map((section, i) => (
        <li key={section.stage?.acte_uid ?? `start-${i}`} className="flex flex-col gap-3">
          {section.stage && (
            <h3 className="font-newsreader text-[22px] font-medium leading-tight text-[color:var(--dp-text)]">
              {stageTitle(section.stage.code_acte) ?? section.stage.libelle}
            </h3>
          )}
          <ul className="flex flex-col gap-3">
            {section.rows.map(row => <ActeRow key={row.acte.acte_uid} row={row} dossierUid={loi.dossier_uid} />)}
          </ul>
        </li>
      ))}
    </ol>
  )
}

export default async function LoiPage(
  { params }: { params: Promise<{ dossier_id: string }> }
) {
  const { dossier_id } = await params
  const loi = await api.lois.get(dossier_id).catch(nullIfMissing)
  if (!loi) notFound()

  const unattachedCollapsed = collapsedVotesLabel(loi.unattached_collapsed_count, 0)

  return (
    <main className="mx-auto flex w-full max-w-[860px] flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
      <nav className="text-[13.5px]">
        <Link href="/lois" className="text-[color:var(--dp-red)]">← Tous les textes</Link>
      </nav>

      <header className="flex flex-col gap-4">
        <span className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-[color:var(--dp-red)]">
          {loi.procedure_label ?? 'Texte de loi'}
        </span>
        <h1 className="break-words font-newsreader text-[34px] font-semibold leading-[1.1] text-[color:var(--dp-text)] md:text-[44px]">
          {loi.titre ?? `Dossier ${loi.dossier_uid}`}
        </h1>
        <StatusHeader loi={loi} />
        {loi.an_dossier_url && (
          <a href={loi.an_dossier_url} target="_blank" rel="noopener noreferrer"
            className="self-start text-[14px] font-semibold text-[color:var(--dp-red)]">
            Dossier complet sur assemblee-nationale.fr →
          </a>
        )}
      </header>

      <section className="flex flex-col gap-5" aria-labelledby="parcours">
        <h2 id="parcours" className="font-newsreader text-[28px] font-medium text-[color:var(--dp-text)]">Parcours</h2>
        {loi.parcours_predates_coverage && loi.scrutin_coverage_start && (
          <p className="rounded-lg bg-[color:var(--dp-badge-info-bg)] p-3 text-[14px] leading-relaxed text-[color:var(--dp-text)]">
            L&apos;Assemblée ne relie ses scrutins aux textes que depuis le {formatDate(loi.scrutin_coverage_start)}.
            Les étapes antérieures viennent du dossier officiel : l&apos;absence de vote affiché ne veut pas dire
            qu&apos;aucun vote n&apos;a eu lieu.
          </p>
        )}
        {!hasHeadlineScrutin(loi) && (
          <p className="text-[14px] text-[color:var(--dp-text-secondary)]">
            Aucun vote sur l&apos;ensemble du texte ni sur une motion pour le moment.
          </p>
        )}
        <Parcours loi={loi} />
      </section>

      {(loi.unattached_scrutins.length > 0 || unattachedCollapsed) && (
        <section className="flex flex-col gap-3" aria-labelledby="autres-scrutins">
          <h2 id="autres-scrutins" className="font-newsreader text-[24px] font-medium text-[color:var(--dp-text)]">
            Autres scrutins
          </h2>
          {loi.unattached_scrutins.map(s => <LoiScrutinCard key={s.vote_id} scrutin={s} />)}
          {unattachedCollapsed && (
            <LoiAmendements dossierUid={loi.dossier_uid} acteUid={null} label={unattachedCollapsed} />
          )}
        </section>
      )}
    </main>
  )
}
