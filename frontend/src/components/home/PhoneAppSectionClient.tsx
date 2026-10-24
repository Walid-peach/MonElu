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

const textStyle = {
  fontSize: '15.5px',
  lineHeight: 1.7,
  color: 'var(--dp-text-secondary)',
  margin: 0,
} as const

/**
 * Below `md` (G3): one navy card, the install button and a line on each
 * platform. iPhone and iPad get the App Store badge once there is one, or
 * the "bientôt" line instead of the button.
 */
function PhoneCard({ ios, appStoreId }: { ios: boolean; appStoreId: string | null }) {
  return (
    <section aria-labelledby="monelu-telephone-mobile" className="dp-dark bg-gray-off px-4 pb-6 pt-7 md:hidden">
      <div className="flex flex-col gap-4 rounded-3xl bg-navy p-5 text-white">
        <div className="flex items-center gap-3.5">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 flex-none -rotate-6 items-center justify-center rounded-[15px] bg-gray-off font-serif text-[30px] text-navy shadow-[0_8px_20px_rgba(0,0,0,0.3)]"
          >
            M<span className="text-red-civic">É</span>
          </span>
          <div className="flex flex-col gap-1">
            <h2 id="monelu-telephone-mobile" className="font-serif text-[26px] leading-[1.05]">
              L&apos;Assemblée, dans votre poche.
            </h2>
            <p className="text-[13px] text-[color:var(--dp-text-secondary)]">Plein écran, sur votre député, sans compte.</p>
          </div>
        </div>
        {ios && appStoreId ? (
          <div data-phone-app="ios">
            <AppStoreBadge id={appStoreId} />
          </div>
        ) : ios ? (
          <p data-phone-app="ios" className="text-sm font-semibold">
            Sur iPhone, l&apos;app native arrive bientôt sur l&apos;App Store.
          </p>
        ) : (
          <div data-phone-app="phone" className="flex flex-col gap-3">
            <Link
              href="/application"
              onClick={countTap}
              className="flex h-[50px] items-center justify-center gap-2 rounded-[14px] bg-white text-base font-bold text-navy"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="6" y="2" width="12" height="20" rx="3" />
                <path d="M11 18h2" />
              </svg>
              Installer l&apos;application
            </Link>
            <p className="text-center text-xs leading-snug text-[color:var(--dp-text-secondary)]">
              Android : en un geste depuis Chrome · iPhone : bientôt sur l&apos;App Store
            </p>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Client half of PhoneAppSection (#596). The server render, and the render
 * before hydration, picks phone or computer with CSS alone: `PhoneCard` below
 * `md`, the section with its QR code from `md` up. After hydration, iPhone and
 * iPad get the "arrive bientôt" message instead, and the installed web app
 * hides both.
 */
export function PhoneAppSectionClient({ qrSvg }: { qrSvg: string }) {
  const standalone = useSyncExternalStore(noopSubscribe, isStandalone, () => false)
  const ios = useSyncExternalStore(noopSubscribe, isIOS, () => false)

  if (standalone) return null
  const appStoreId = iosAppStoreId()

  return (
    <>
      <PhoneCard ios={ios} appStoreId={appStoreId} />
      <section
        aria-labelledby="monelu-telephone"
        className="hidden md:block"
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
            <div data-phone-app="computer" className="mt-6 flex items-center gap-6">
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
          )}
        </div>
      </section>
    </>
  )
}
