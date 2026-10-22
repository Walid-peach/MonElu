'use client'
import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import {
  decideInstallSituation,
  hasInstallPrompt,
  isIOS,
  isStandalone,
  promptInstall,
  subscribeInstallPrompt,
  type InstallSituation,
} from '@/lib/installState'

const NAVY = 'var(--dp-text)'
const LINE = 'var(--dp-border)'

const noopSubscribe = () => () => {}

/**
 * The action block of /application (#595). The server render, and the client
 * render before hydration, is the 'manual' state: menu instructions work in
 * every browser, so a visitor without JavaScript is never stuck, and the HTML
 * never depends on the user agent.
 */
export function InstallActions() {
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => false)
  const ios = useSyncExternalStore(noopSubscribe, isIOS, () => false)
  const promptAvailable = useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt, () => false)
  const [outcome, setOutcome] = useState<'accepted' | 'dismissed' | null>(null)

  const situation = decideInstallSituation({ standalone, ios, promptAvailable, outcome })

  async function install() {
    const result = await promptInstall()
    // 'unavailable' falls back to the menu instructions of the 'manual' state.
    setOutcome(result === 'unavailable' ? null : result)
  }

  return (
    <section
      aria-live="polite"
      data-install-situation={situation}
      style={{
        background: 'var(--dp-card-bg)',
        border: `1px solid ${LINE}`,
        borderRadius: 14,
        padding: '24px 22px',
      }}
    >
      <ActionBody situation={situation} onInstall={install} />
    </section>
  )
}

function ActionBody({ situation, onInstall }: { situation: InstallSituation; onInstall: () => void }) {
  switch (situation) {
    case 'installed':
      return (
        <>
          <Lead>Vous utilisez déjà l&apos;application MonÉlu.</Lead>
          <PrimaryLink href="/mon-depute">Accéder à mon député</PrimaryLink>
        </>
      )
    case 'ios':
      return (
        <>
          <Lead>
            L&apos;application iPhone arrive bientôt. En attendant, retrouvez tous les votes sur
            MonÉlu.
          </Lead>
          <PrimaryLink href="/">Continuer sur le site</PrimaryLink>
        </>
      )
    case 'accepted':
      return (
        <>
          <Lead>MonÉlu est installé. Ouvrez-le depuis votre écran d&apos;accueil.</Lead>
          <SecondaryLink href="/mon-depute">Accéder à mon député</SecondaryLink>
        </>
      )
    case 'prompt':
      return (
        <>
          <Lead>Installez MonÉlu en un geste, sans passer par une boutique d&apos;applications.</Lead>
          <button type="button" onClick={onInstall} style={primaryStyle}>
            Installer MonÉlu
          </button>
          <ContinueLink />
        </>
      )
    case 'dismissed':
      return (
        <>
          <Lead>
            Installation annulée. Vous pourrez installer MonÉlu plus tard depuis le menu de votre
            navigateur.
          </Lead>
          <MenuInstructions />
          <ContinueLink />
        </>
      )
    case 'manual':
      return (
        <>
          <Lead>Installez MonÉlu depuis le menu de votre navigateur.</Lead>
          <MenuInstructions />
          <ContinueLink />
        </>
      )
  }
}

function Lead({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ margin: '0 0 18px', fontSize: 16, lineHeight: 1.6, color: NAVY, fontWeight: 600 }}>
      {children}
    </p>
  )
}

function MenuInstructions() {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.75, color: 'var(--dp-text-secondary)' }}>
      <li>
        <strong style={{ color: NAVY }}>Chrome sur Android</strong> : menu ⋮, puis « Ajouter à
        l&apos;écran d&apos;accueil » ou « Installer l&apos;application ».
      </li>
      <li>
        <strong style={{ color: NAVY }}>Samsung Internet, Firefox, Edge</strong> : menu, puis
        « Ajouter à l&apos;écran d&apos;accueil » ou « Installer ».
      </li>
      <li>
        <strong style={{ color: NAVY }}>Sur ordinateur</strong> (Chrome, Edge) : l&apos;icône
        d&apos;installation à droite de la barre d&apos;adresse.
      </li>
    </ul>
  )
}

const primaryStyle = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  background: 'var(--dp-cta-bg)', color: '#fff', border: 'none', cursor: 'pointer',
  padding: '12px 26px', borderRadius: 9, fontWeight: 600, fontSize: 15,
  textDecoration: 'none', fontFamily: 'inherit',
  boxShadow: '0 2px 8px var(--dp-cta-shadow)',
} as const

function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} style={primaryStyle}>{children}</Link>
}

function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} style={{ color: NAVY, fontWeight: 600, fontSize: 15 }}>
      {children} →
    </Link>
  )
}

function ContinueLink() {
  return (
    <p style={{ margin: '18px 0 0' }}>
      <SecondaryLink href="/">Continuer sur le site</SecondaryLink>
    </p>
  )
}
