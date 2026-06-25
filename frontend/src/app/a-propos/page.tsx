import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'À propos — MonÉlu',
  description:
    "Comment MonÉlu collecte, transforme et publie les données de vote de l'Assemblée Nationale française.",
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-14 border-t border-navy/10 first:border-t-0 first:pt-0">
      <p className="text-xs font-medium tracking-widest uppercase text-red-civic mb-6">{label}</p>
      {children}
    </section>
  )
}

function PipelineStep({
  step,
  title,
  body,
}: {
  step: string
  title: string
  body: string
}) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full border border-navy/20 flex items-center justify-center text-xs font-medium text-navy/50">
        {step}
      </div>
      <div className="pt-1">
        <p className="font-medium text-navy text-sm">{title}</p>
        <p className="text-sm text-gray-mid mt-0.5 leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

export default function AProposPage() {
  return (
    <div className="bg-gray-off min-h-screen">
      {/* Hero */}
      <div className="bg-white border-b border-gray-border">
        <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
          <div className="w-8 h-0.5 bg-red-civic mb-8" />
          <h1 className="font-serif text-display text-navy leading-tight mb-5">
            Chaque vote.<br />Chaque député.<br />
            <span className="italic text-navy/50">En clair.</span>
          </h1>
          <p className="text-base md:text-lg text-gray-mid leading-relaxed max-w-xl">
            MonÉlu rend le registre complet des votes de l&apos;Assemblée Nationale accessible à
            tous les citoyens - sans jargon, sans filtre politique, sans abonnement.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-16 space-y-0">

        <Section label="La mission">
          <h2 className="font-serif text-display-sm text-navy mb-4">
            La transparence démocratique n&apos;est pas un privilège.
          </h2>
          <div className="space-y-4 text-[15px] text-navy/80 leading-relaxed">
            <p>
              Depuis juillet 2024, chaque scrutin de la 17e législature est enregistré publiquement.
              Pourtant, ces données restent enfouies dans des fichiers ZIP et des interfaces
              administratives illisibles pour le commun des mortels.
            </p>
            <p>
              MonÉlu ingère, structure et publie ces données en temps réel pour que n&apos;importe
              quel citoyen puisse, en quelques secondes, connaître la position de son député sur
              n&apos;importe quel vote.
            </p>
          </div>
        </Section>

        <Section label="Les données">
          <h2 className="font-serif text-display-sm text-navy mb-4">
            Source unique&nbsp;: l&apos;Assemblée Nationale.
          </h2>
          <div className="space-y-4 text-[15px] text-navy/80 leading-relaxed mb-8">
            <p>
              Toutes les données proviennent exclusivement du portail open data officiel de
              l&apos;Assemblée Nationale. Aucune donnée n&apos;est saisie manuellement, aucune
              interprétation éditoriale n&apos;est ajoutée.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { value: '577', label: 'députés profileés' },
              { value: '1 200+', label: 'votes enregistrés' },
              { value: 'Quotidien', label: 'mise à jour (jours ouvrés)' },
            ].map(({ value, label }) => (
              <div key={label} className="bg-white rounded-lg border border-gray-border p-5">
                <p className="font-serif text-2xl text-navy mb-1">{value}</p>
                <p className="text-xs text-gray-mid">{label}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-mid mt-4">
            Périmètre de production&nbsp;: votes depuis le 1er juillet 2025.
            La base locale couvre l&apos;intégralité de la législature depuis le 7 juillet 2024.
          </p>
        </Section>

        <Section label="La méthodologie">
          <h2 className="font-serif text-display-sm text-navy mb-4">
            Pipeline automatisé, open source.
          </h2>
          <p className="text-[15px] text-navy/80 leading-relaxed mb-8">
            Chaque jour ouvré à 06h00 UTC, un pipeline entièrement automatisé collecte, transforme
            et publie les nouvelles données sans intervention humaine.
          </p>
          <div className="space-y-5">
            <PipelineStep
              step="1"
              title="Ingestion"
              body="Scripts Python téléchargent les exports ZIP de l'AN et insèrent les nouvelles données via des upserts idempotents (INSERT … ON CONFLICT DO UPDATE)."
            />
            <PipelineStep
              step="2"
              title="Transformation dbt"
              body="Les tables brutes alimentent un projet dbt (staging → intermédiaire → marts). Les marts analytics sont testés automatiquement à chaque Pull Request."
            />
            <PipelineStep
              step="3"
              title="API REST"
              body="Une API FastAPI expose les données via des requêtes SQL directes (psycopg2, sans ORM). Rate-limiting, CORS et gestion d'erreurs inclus."
            />
            <PipelineStep
              step="4"
              title="Recherche sémantique"
              body="Un moteur RAG (pgvector + Groq llama-3.3-70b) permet de poser des questions en langage naturel sur le corpus législatif. Les embeddings sont générés avec text-embedding-3-small d'OpenAI."
            />
          </div>
        </Section>

        <Section label="L'indépendance">
          <h2 className="font-serif text-display-sm text-navy mb-4">
            Aucun financement. Aucune publicité. Aucune affiliation.
          </h2>
          <div className="space-y-4 text-[15px] text-navy/80 leading-relaxed">
            <p>
              MonÉlu est un projet indépendant, développé sans financement externe, sans
              partenariat politique et sans publicité. La plateforme n&apos;appartient à aucun
              parti, mouvement ou organisation.
            </p>
            <p>
              L&apos;objectif est uniquement de rendre les données publiques plus accessibles.
              Si vous constatez une erreur dans les données, elle est dans la source officielle -
              MonÉlu ne modifie aucune donnée brute.
            </p>
          </div>
        </Section>

        <Section label="API publique">
          <h2 className="font-serif text-display-sm text-navy mb-4">
            Les données sont aussi disponibles via API.
          </h2>
          <p className="text-[15px] text-navy/80 leading-relaxed mb-6">
            Toute l&apos;infrastructure MonÉlu est accessible programmatiquement.
            Chercheurs, journalistes et développeurs peuvent interroger l&apos;API REST
            directement ou intégrer la recherche sémantique dans leurs propres outils.
          </p>
          <a
            href="https://monelu-production.up.railway.app/docs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 border border-navy text-navy text-sm font-medium px-5 py-2.5 rounded hover:bg-navy hover:text-white transition-colors"
          >
            Documentation API →
          </a>
        </Section>

      </div>

      {/* Footer strip */}
      <div className="border-t border-gray-border bg-white mt-8">
        <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-gray-mid">
            MonÉlu — Données officielles de l&apos;Assemblée Nationale
          </p>
          <div className="flex items-center gap-6 text-sm text-gray-mid">
            <Link href="/deputes" className="hover:text-navy transition-colors">Députés</Link>
            <Link href="/votes" className="hover:text-navy transition-colors">Votes</Link>
            <Link href="/chat" className="hover:text-navy transition-colors">Chat IA</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
