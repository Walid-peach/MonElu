import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPageLayout, LegalSection } from '@/components/LegalPageLayout'
import { SNAPSHOT_ROBOTS } from '@/lib/seo'
import { canonicalUrl } from '@/lib/site'
import { SignInClient } from './SignInClient'

/**
 * Sign-in (#415, ADR-040): an email, then a six-digit code. No password and no
 * social sign-in - either one needs an amendment to ADR-040.
 *
 * `noindex` through the shared `SNAPSHOT_ROBOTS` (never re-declared) and absent
 * from `sitemap.ts`: an account page is nothing a search result should lead
 * to. The metadata is a static export, so there is no early-return path on
 * which the directive could go missing.
 */
export const metadata: Metadata = {
  title: 'Se connecter - MonÉlu',
  description: 'Connexion à un compte MonÉlu par code envoyé par e-mail, sans mot de passe.',
  alternates: { canonical: canonicalUrl('/connexion') },
  robots: SNAPSHOT_ROBOTS,
}

const pStyle = { fontSize: '15px', lineHeight: 1.75, color: 'var(--dp-text-secondary)', margin: 0 }

export default function ConnexionPage() {
  return (
    <LegalPageLayout eyebrow="Compte" title="Se connecter">
      <LegalSection title="Sans mot de passe">
        <p style={pStyle}>
          Saisissez votre adresse e-mail : nous vous envoyons un code à six chiffres, à recopier ici. Il
          n&apos;y a pas de mot de passe à créer ni à retenir. La première connexion crée votre compte.
        </p>
      </LegalSection>

      <SignInClient />

      <LegalSection title="Un compte n'est jamais obligatoire">
        <p style={pStyle}>
          Tout MonÉlu reste consultable sans compte : fiches des députés, votes, ordre du jour, quiz et
          recherche. Ce qui est enregistré lorsque vous vous connectez, et pourquoi, est détaillé dans la{' '}
          <Link href="/confidentialite" style={{ color: 'var(--dp-text)' }}>
            politique de confidentialité
          </Link>
          .
        </p>
      </LegalSection>
    </LegalPageLayout>
  )
}
