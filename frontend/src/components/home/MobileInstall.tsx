'use client'
import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { hasInstallPrompt, promptInstall, subscribeInstallPrompt } from '@/lib/installState'
import { recordInstallEvent } from '@/lib/installEvents'
import { AppStoreBadge } from '@/components/AppStoreBadge'

/** The app, drawn: what the visitor gets once it is on the home screen. */
function PhonePicture() {
  return (
    <div aria-hidden="true" className="relative mx-auto mt-2 h-[410px] w-full max-w-[350px]">
      <div className="absolute left-1/2 top-5 h-[250px] w-[250px] -translate-x-1/2 rounded-full bg-[#1A3258]" />
      <div className="absolute left-1/2 top-0 flex h-[400px] w-[196px] -translate-x-1/2 -rotate-[4deg] flex-col gap-2.5 rounded-[36px] border-[7px] border-[#233E6A] bg-gray-off px-3 pb-3 pt-[22px] text-navy shadow-[0_26px_50px_rgba(0,0,0,0.45)]">
        <span className="font-newsreader text-[21px] font-medium">Accueil</span>
        <div className="flex gap-1.5 text-[10px]">
          <span className="rounded-full bg-navy px-2.5 py-1 text-white">Pour vous</span>
          <span className="rounded-full border border-[#E0DED9] px-2.5 py-1">Assemblée</span>
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl bg-navy px-2.5 py-2.5">
          <span className="h-1.5 w-1/3 rounded-full bg-white/50" />
          <span className="h-2.5 w-2/3 rounded-full bg-white" />
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl bg-white p-2.5">
          <span className="h-1.5 w-2/5 rounded-full bg-[#E0DED9]" />
          <span className="h-2 rounded-full bg-navy" />
          <span className="h-2 w-3/4 rounded-full bg-navy" />
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            <span className="flex-[55] bg-navy" />
            <span className="flex-[36] bg-red-civic" />
            <span className="flex-[9] bg-[#B9B4AA]" />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 rounded-xl bg-white p-2.5">
          <span className="h-1.5 w-1/3 rounded-full bg-[#E0DED9]" />
          <span className="h-2 rounded-full bg-navy" />
          <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full">
            <span className="flex-[30] bg-navy" />
            <span className="flex-[64] bg-red-civic" />
            <span className="flex-[6] bg-[#B9B4AA]" />
          </div>
        </div>
      </div>
      <div className="absolute left-1 top-[84px] flex rotate-[4deg] items-center gap-2 rounded-[14px] bg-white px-3 py-2 text-navy shadow-[0_12px_26px_rgba(0,0,0,0.3)]">
        <span className="h-6 w-6 rounded-full bg-[#1A3258]" />
        <span className="text-xs font-bold">Votre député a voté</span>
      </div>
      <div className="absolute right-1 top-[250px] -rotate-[3deg] rounded-[14px] bg-red-civic px-3 py-2 text-xs font-bold text-white shadow-[0_12px_26px_rgba(0,0,0,0.3)]">
        Résumé en clair
      </div>
    </div>
  )
}

/**
 * Android and every other browser that can install a web app: the button
 * opens the browser's own install window when it offered one, and otherwise
 * (or once the visitor closed it) shows how to install from the menu.
 */
function InstallButton() {
  const promptAvailable = useSyncExternalStore(subscribeInstallPrompt, hasInstallPrompt, () => false)
  const [showHow, setShowHow] = useState(false)
  const [installed, setInstalled] = useState(false)

  async function install() {
    recordInstallEvent('install_section_tap')
    if (!promptAvailable) {
      setShowHow(open => !open)
      return
    }
    recordInstallEvent('install_prompt_shown')
    const result = await promptInstall()
    if (result === 'accepted') {
      recordInstallEvent('install_prompt_accepted')
      setInstalled(true)
      return
    }
    if (result === 'dismissed') recordInstallEvent('install_prompt_dismissed')
    setShowHow(true)
  }

  if (installed) {
    return (
      <p role="status" className="rounded-2xl bg-[#16294A] p-4 text-center text-[15px] font-semibold">
        MonÉlu est installé. Ouvrez-le depuis votre écran d&apos;accueil.
      </p>
    )
  }

  return (
    <div data-phone-app="phone" className="flex flex-col gap-3">
      <button
        type="button"
        onClick={install}
        aria-expanded={promptAvailable ? undefined : showHow}
        aria-controls={promptAvailable ? undefined : 'installer-comment'}
        className="flex h-[58px] items-center justify-center gap-2.5 rounded-[18px] bg-white text-[17px] font-bold text-navy shadow-[0_12px_30px_rgba(0,0,0,0.3)] active:scale-[0.99]"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m7 10 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Installer l&apos;application
      </button>
      {showHow && (
        <div id="installer-comment" className="flex flex-col gap-3 rounded-2xl bg-[#16294A] p-3.5">
          <ol aria-label="Comment installer MonÉlu" className="flex flex-col gap-2.5 text-sm leading-snug">
            <li className="flex items-center gap-3">
              <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gray-off font-serif text-base text-navy">1</span>
              <span>Ouvrez le menu <strong>⋮</strong> de Chrome, en haut à droite</span>
            </li>
            <li className="flex items-center gap-3">
              <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gray-off font-serif text-base text-navy">2</span>
              <span>Touchez <strong>Installer l&apos;application</strong> ou <strong>Ajouter à l&apos;écran d&apos;accueil</strong>, puis confirmez</span>
            </li>
          </ol>
          <Link href="/application" className="text-center text-[13px] text-white underline underline-offset-2">
            Un autre navigateur ? Toute l&apos;aide
          </Link>
        </div>
      )}
      <p className="text-center text-xs text-[color:var(--dp-text-secondary)]">Gratuit, sans compte</p>
    </div>
  )
}

/**
 * The install section below `md` (G3, medium): the app drawn on a phone, then
 * the one action that fits the device. iPhone and iPad get the App Store
 * badge once `NEXT_PUBLIC_IOS_APP_STORE_ID` is set (#597), and a "bientôt"
 * line until then; everyone else gets `InstallButton`.
 */
export function MobileInstall({ ios, appStoreId }: { ios: boolean; appStoreId: string | null }) {
  return (
    <section aria-labelledby="monelu-telephone-mobile" className="dp-dark flex flex-col gap-3 bg-navy px-5 pb-9 pt-11 text-white md:hidden">
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#F4A19E]">L&apos;application MonÉlu</p>
      <h2 id="monelu-telephone-mobile" className="font-serif text-[40px] leading-none">
        L&apos;Assemblée,
        <br />
        <em className="text-[#F4A19E]">dans votre poche.</em>
      </h2>
      <p className="text-base leading-normal text-[color:var(--dp-text-secondary)]">
        Votre député et ses votes, à un geste de votre écran d&apos;accueil.
      </p>
      <PhonePicture />
      {ios && appStoreId ? (
        <div data-phone-app="ios" className="flex flex-col items-center gap-2">
          <AppStoreBadge id={appStoreId} />
          <p className="text-xs text-[color:var(--dp-text-secondary)]">Gratuit, sans compte</p>
        </div>
      ) : ios ? (
        <p data-phone-app="ios" className="rounded-2xl bg-[#16294A] p-4 text-center text-[15px] font-semibold">
          Sur iPhone, l&apos;app native arrive bientôt sur l&apos;App Store.
        </p>
      ) : (
        <InstallButton />
      )}
    </section>
  )
}
