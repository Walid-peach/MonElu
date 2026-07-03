import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'

export const metadata: Metadata = {
  title: 'Mentions légales - MonÉlu',
  description: "Éditeur, hébergement et contact du site MonÉlu.",
}

export default function MentionsLegalesPage() {
  return (
    <LegalPageLayout eyebrow="Informations légales" title="Mentions légales">

      <LegalSection title="Éditeur du site">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
          MonÉlu est édité à titre individuel par Walid Elkhoukh.
          <br />
          Contact : <a href="mailto:walidelkhoukh99@gmail.com" style={{ color: '#1B2B50' }}>walidelkhoukh99@gmail.com</a>
          <br />
          Directeur de la publication : Walid Elkhoukh.
        </p>
      </LegalSection>

      <LegalSection title="Hébergement">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: '0 0 10px' }}>
          L&apos;interface (frontend) est hébergée par Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: '0 0 10px' }}>
          L&apos;API et le pipeline de données sont hébergés par Railway Corporation, San Francisco, États-Unis.
        </p>
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
          La base de données est hébergée par Supabase Inc. (infrastructure gérée sur AWS).
        </p>
      </LegalSection>

      <LegalSection title="Nature du site">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
          MonÉlu est un site d&apos;information citoyenne à but non lucratif. Il republique et met en forme des données
          publiques issues de l&apos;Assemblée nationale française et d&apos;autres sources open data officielles
          (voir <Link href="/licence-donnees" style={{ color: '#1B2B50' }}>Licence des données</Link>). Aucun produit
          ou service n&apos;est vendu sur ce site.
        </p>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
          Le code source de MonÉlu est public sur{' '}
          <a href="https://github.com/Walid-peach" target="_blank" rel="noopener noreferrer" style={{ color: '#1B2B50' }}>GitHub</a>.
          Les données parlementaires affichées restent la propriété de leurs producteurs respectifs et sont
          redistribuées sous les conditions de leur licence d&apos;origine.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p style={{ fontSize: '15px', lineHeight: 1.75, color: '#4B5563', margin: 0 }}>
          Pour toute question relative au site, à une donnée affichée ou à ces mentions légales, écrivez à{' '}
          <a href="mailto:walidelkhoukh99@gmail.com" style={{ color: '#1B2B50' }}>walidelkhoukh99@gmail.com</a>.
          Réponse sous 48 h pour les questions techniques.
        </p>
      </LegalSection>

    </LegalPageLayout>
  )
}
