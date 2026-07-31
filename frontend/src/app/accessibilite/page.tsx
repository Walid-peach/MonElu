import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'

export const metadata: Metadata = {
  title: "Déclaration d'accessibilité - MonÉlu",
  description:
    "État de conformité RGAA de MonÉlu, méthode d'évaluation, non-conformités connues et contact pour signaler un problème d'accessibilité.",
}

const pStyle = { fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }
const liStyle = { fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)' }

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
        <p style={pStyle}>Non-conformités identifiées à ce jour :</p>
        <ul style={{ margin: '10px 0 0', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <li style={liStyle}>
            <strong>Absence d&apos;indicateur de focus visible global</strong> - aucune règle <code>:focus-visible</code>{' '}
            n&apos;est définie au niveau global ; certains composants interactifs (dont l&apos;hémicycle) suppriment
            le contour de focus par défaut du navigateur (critère RGAA 10.7 / WCAG 2.4.7).
          </li>
          <li style={liStyle}>
            <strong>Animations non désactivables</strong> - le défilement animé de la page d&apos;accueil et les
            transitions de l&apos;interface ne tiennent pas compte de la préférence système{' '}
            <code>prefers-reduced-motion</code> (critères RGAA 13.8/13.9 / WCAG 2.3.3).
          </li>
          <li style={liStyle}>
            <strong>Réponses du chat non annoncées</strong> - l&apos;assistant conversationnel (<code>/chat</code>)
            ne place pas les réponses entrantes dans une zone <code>aria-live</code>, si bien que les nouveaux
            messages ne sont pas annoncés aux utilisateurs de lecteur d&apos;écran (critère RGAA 9.3 / WCAG 4.1.3).
          </li>
          <li style={liStyle}>
            <strong>Texte alternatif minimal sur les photos de député</strong> - l&apos;attribut <code>alt</code>{' '}
            des portraits contient uniquement le nom du député, sans contexte descriptif (critère RGAA 1.1 / WCAG 1.1.1).
          </li>
        </ul>
        <p style={{ ...pStyle, margin: '14px 0 0' }}>
          En complément, ces mêmes tests ont confirmé qu&apos;une partie du travail d&apos;accessibilité était déjà en
          place : l&apos;hémicycle interactif (<code>/votes/[id]</code>) est navigable au clavier avec des libellés{' '}
          <code>aria-label</code> dynamiques, et la recherche globale expose des rôles <code>dialog</code>/
          <code>listbox</code> corrects.
        </p>
      </LegalSection>

      <LegalSection title="Contenus non accessibles">
        <p style={pStyle}>
          Les non-conformités listées ci-dessus affectent principalement la page d&apos;accueil, l&apos;assistant
          conversationnel et les photos de député. Leur correction est suivie individuellement ; le code source
          de MonÉlu étant public (voir{' '}
          <Link href="/mentions-legales" style={{ color: 'var(--dp-text)' }}>mentions légales</Link>), l&apos;avancement
          de ces corrections est vérifiable dans l&apos;historique du dépôt.
        </p>
      </LegalSection>

      <LegalSection title="Établissement de cette déclaration">
        <p style={pStyle}>
          Cette déclaration a été établie le 27 juillet 2026. Elle sera mise à jour au fur et à mesure de la
          correction des non-conformités listées ci-dessus et de tout nouvel audit.
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
