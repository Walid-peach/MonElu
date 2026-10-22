'use client'
import { useSyncExternalStore } from 'react'
import Link from 'next/link'
import { isIOS, isStandalone } from '@/lib/installState'
import { SITE_HOST } from '@/lib/site'
import { iosAppStoreId } from '@/lib/appStore'
import { recordInstallEvent } from '@/lib/installEvents'
import { AppStoreBadge } from '@/components/AppStoreBadge'

const noopSubscribe = () => () => {}

const countTap = () => recordInstallEvent('install_section_tap')

const ctaStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'var(--dp-cta-bg)',
  color: '#fff',
  padding: '12px 26px',
  borderRadius: 9,
  fontWeight: 600,
  fontSize: 15,
  textDecoration: 'none',
  boxShadow: '0 2px 8px var(--dp-cta-shadow)',
} as const

const textStyle = {
  fontSize: '15.5px',
  lineHeight: 1.7,
  color: 'var(--dp-text-secondary)',
  margin: 0,
} as const

/**
 * Client half of PhoneAppSection (#596). The server render, and the render
 * before hydration, picks phone or computer with CSS alone: an install link
 * below `md`, the QR code from `md` up. After hydration, iPhone and iPad get
 * the "arrive bientôt" message instead, and the installed web app hides the
 * section entirely.
 */
export function PhoneAppSectionClient({ qrSvg }: { qrSvg: string }) {
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => false)
  const ios = useSyncExternalStore(noopSubscribe, isIOS, () => false)

  if (standalone) return null
  const appStoreId = iosAppStoreId()

  return (
    <section
      aria-labelledby="monelu-telephone"
      style={{
        background: 'var(--dp-page-bg)',
        borderTop: '1px solid var(--dp-border)',
        padding: 'clamp(40px,5vw,56px) clamp(16px,5vw,56px)',
      }}
    >
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <h2
          id="monelu-telephone"
          style={{
            fontFamily: 'var(--font-serif), Georgia, serif',
            fontSize: 'clamp(22px,2.6vw,28px)',
            lineHeight: 1.2,
            letterSpacing: '-0.02em',
            color: 'var(--dp-text)',
            margin: '0 0 10px',
          }}
        >
          MonÉlu sur votre téléphone
        </h2>
        <p style={textStyle}>
          Retrouvez votre député et ses votes, directement depuis votre écran d&apos;accueil.
        </p>

        {ios && appStoreId ? (
          <div data-phone-app="ios" style={{ marginTop: 20 }}>
            <p style={{ ...textStyle, color: 'var(--dp-text)', fontWeight: 600 }}>
              L&apos;application MonÉlu est disponible sur iPhone.
            </p>
            <AppStoreBadge id={appStoreId} />
          </div>
        ) : ios ? (
          <div data-phone-app="ios" style={{ marginTop: 20 }}>
            <p style={{ ...textStyle, color: 'var(--dp-text)', fontWeight: 600 }}>
              L&apos;application iPhone arrive bientôt. En attendant, retrouvez tous les votes sur
              MonÉlu.
            </p>
            <p style={{ margin: '14px 0 0' }}>
              <Link href="/votes" style={{ color: 'var(--dp-text)', fontWeight: 600, fontSize: 15 }}>
                Continuer sur le site →
              </Link>
            </p>
          </div>
        ) : (
          <>
            <div data-phone-app="phone" className="mt-5 md:hidden">
              <Link href="/application" style={ctaStyle} onClick={countTap}>
                Installer MonÉlu
              </Link>
            </div>
            <div data-phone-app="computer" className="mt-6 hidden items-center gap-6 md:flex">
              <div
                role="img"
                aria-label="QR code vers la page d'installation de MonÉlu"
                // Sized by the SVG itself and never clipped: cropping the white
                // border around the code is what makes a QR code hard to scan.
                style={{ flexShrink: 0, lineHeight: 0, border: '1px solid var(--dp-border)' }}
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <div>
                <p style={{ ...textStyle, color: 'var(--dp-text)', fontWeight: 600 }}>
                  Scannez pour retrouver MonÉlu sur votre téléphone.
                </p>
                <p style={{ margin: '8px 0 0', fontSize: 15 }}>
                  <Link href="/application" style={{ color: 'var(--dp-text)' }} onClick={countTap}>
                    {SITE_HOST}/application
                  </Link>
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
