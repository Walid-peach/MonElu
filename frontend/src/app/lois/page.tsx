import type { Metadata } from 'next'
import { api } from '@/lib/api'
import { canonicalUrl } from '@/lib/site'
import { LoisIndexClient } from './LoisIndexClient'

export const revalidate = 86400

const title = 'Où en sont les lois ? - MonÉlu'
const description =
  'Les textes débattus à l\'Assemblée nationale depuis 2024 : où en est chacun, ' +
  'de son dépôt à sa promulgation, et comment les députés ont voté.'

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: canonicalUrl('/lois') },
  openGraph: { title, description },
}

export default async function LoisPage() {
  const data = await api.lois.list().catch(() => null)
  return (
    <main className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-4 py-8 md:px-8 md:py-12">
      <header className="flex flex-col gap-3">
        <span className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-[color:var(--dp-red)]">Textes de loi</span>
        <h1 className="font-newsreader text-[36px] font-semibold leading-[1.1] text-[color:var(--dp-text)] md:text-[46px]">
          Où en sont les lois ?
        </h1>
        <p className="max-w-[640px] text-[15px] leading-relaxed text-[color:var(--dp-text-secondary)]">
          Chaque texte qui a fait l&apos;objet d&apos;un scrutin public, avec son parcours entre l&apos;Assemblée et le
          Sénat. Le statut est déduit de la dernière décision officielle, citée telle quelle sur chaque page.
        </p>
      </header>
      {data ? (
        <LoisIndexClient items={data.items} />
      ) : (
        <p className="text-[14px] text-[color:var(--dp-text-secondary)]">
          La liste des textes est indisponible pour le moment.
        </p>
      )}
    </main>
  )
}
