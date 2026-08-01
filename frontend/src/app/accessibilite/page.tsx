import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'

export const metadata: Metadata = {
  title: "Déclaration d'accessibilité - MonÉlu",
  description:
    "État de conformité RGAA de MonÉlu, méthode d'évaluation, non-conformités connues et contact pour signaler un problème d'accessibilité.",
}

const pStyle = { fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }

export default function AccessibilitePage() {
  return (
    <LegalPageLayout eyebrow="Accessibilité" title="Déclaration d'accessibilité">

      <LegalSection title="État de conformité">
        <p style={pStyle}>
          MonÉlu s&apos;engage à rendre son site accessible conformément à l&apos;article 47 de la loi n° 2005-102 du 11
          février 2005 et au Référentiel général d&apos;amélioration de l&apos;accessibilité (RGAA) 4.1.
        </p>
        <p style={{ ...pStyle, margin: '10px 0 0' }}>
          À ce stade, MonÉlu est <strong>non conforme</strong> avec le RGAA 4.1. Le site n&apos;a pas encore fait
          l&apos;objet d&apos;un audit RGAA complet mené par un prestataire accrédité ; les résultats ci-dessous
          viennent d&apos;une auto-évaluation interne portant sur un échantillon de pages représentatif (voir
          méthode ci-dessous), pas d&apos;un audit exhaustif des 106 critères RGAA sur l&apos;ensemble du site.
        </p>
      </LegalSection>

      <LegalSection title="Méthode d'évaluation">
        <p style={pStyle}>
          Auto-évaluation interne réalisée le 27 juillet 2026 par relecture du code source et des interfaces,
          sans outil d&apos;audit automatisé ni test utilisateur avec des personnes en situation de handicap.
          Pages couvertes : accueil, liste et fiche député, liste des votes et fiche de scrutin (hémicycle),
          assistant conversationnel (chat), quiz de correspondance de vote.
        </p>
      </LegalSection>

      <LegalSection title="Résultats des tests">
        <p style={pStyle}>
          Aucune non-conformité n&apos;est actuellement identifiée sur l&apos;échantillon de pages couvert par
          cette auto-évaluation. Ces tests ont notamment confirmé qu&apos;une partie du travail
          d&apos;accessibilité était déjà en place : l&apos;hémicycle interactif (<code>/votes/[id]</code>) est
          navigable au clavier avec des libellés <code>aria-label</code> dynamiques, la recherche globale expose
          des rôles <code>dialog</code>/<code>listbox</code> corrects, et le défilement animé de la page
          d&apos;accueil comme les transitions de l&apos;interface respectent la préférence système{' '}
          <code>prefers-reduced-motion</code>.
        </p>
      </LegalSection>

      <LegalSection title="Contenus non accessibles">
        <p style={pStyle}>
          Aucun contenu non accessible n&apos;est actuellement identifié à partir de cette auto-évaluation ;
          celle-ci ne couvre toutefois qu&apos;un échantillon de pages (voir méthode ci-dessus), pas un audit
          exhaustif. Le code source de MonÉlu étant public (voir{' '}
          <Link href="/mentions-legales" style={{ color: 'var(--dp-text)' }}>mentions légales</Link>), tout
          correctif reste vérifiable dans l&apos;historique du dépôt.
        </p>
      </LegalSection>

      <LegalSection title="Établissement de cette déclaration">
        <p style={pStyle}>
          Cette déclaration a été établie le 27 juillet 2026. Elle sera mise à jour au fur et à mesure de tout
          nouvel audit ou de toute non-conformité identifiée.
        </p>
      </LegalSection>

      <LegalSection title="Retour d'information et contact">
        <p style={pStyle}>
          Si vous n&apos;arrivez pas à accéder à un contenu ou à un service de MonÉlu, vous pouvez contacter
          l&apos;éditeur pour être orienté vers une solution alternative ou pour signaler un problème :{' '}
          <a href="mailto:walidelkhoukh99@gmail.com" style={{ color: 'var(--dp-text)' }}>walidelkhoukh99@gmail.com</a>.
        </p>
        <p style={{ ...pStyle, margin: '10px 0 0' }}>
          Voir aussi les <Link href="/mentions-legales" style={{ color: 'var(--dp-text)' }}>mentions légales</Link>.
        </p>
      </LegalSection>

    </LegalPageLayout>
  )
}
