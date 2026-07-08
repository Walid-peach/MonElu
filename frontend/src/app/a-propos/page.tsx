import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'À propos — MonÉlu',
  description:
    "Comment MonÉlu collecte, transforme et publie les données de vote de l'Assemblée Nationale française.",
}

const heroStats = [
  { label: 'Députés suivis en temps réel', value: '577' },
  { label: 'Scrutins publics indexés', value: '1 200+' },
  { label: 'Chunks RAG indexés', value: '3 741' },
  { label: 'Mise à jour (jours ouvrés)', value: 'Quotidien' },
]

const valeurs = [
  {
    title: 'Transparence totale',
    desc: "Chaque donnée est accompagnée de sa source, de sa date d'ingestion et du lien vers le document officiel.",
    icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  },
  {
    title: 'Sources officielles uniquement',
    desc: "Aucune donnée issue de scraping non autorisé. Flux XML de l'Assemblée nationale, portail open data officiel.",
    icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  },
  {
    title: 'Mise à jour continue',
    desc: "Pipeline automatisé via GitHub Actions, actif chaque jour ouvré à 06h00 UTC. Délai d'ingestion inférieur à quelques minutes.",
    icon: '<polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>',
  },
  {
    title: 'Open data & open source',
    desc: 'Code source public sur GitHub. Données redistribuées sous licence Etalab 2.0. Réutilisation libre, attribution requise.',
    icon: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M6 9v6"/><path d="M9 6h6"/><path d="m15 15 2.1 2.1"/>',
  },
  {
    title: 'Zéro interprétation',
    desc: "Nous ne commentons pas, n'annotons pas, n'infèrons pas. Les votes sont des votes. Les absences sont des absences.",
    icon: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  },
  {
    title: 'Accessibilité universelle',
    desc: "Interface citoyenne, documentation développeur, API ouverte. Un seul jeu de données, trois portes d'entrée.",
    icon: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  },
]

const pipeline = [
  {
    step: '01 · Ingest',
    title: 'Collecte',
    desc: "Scripts Python téléchargent les exports ZIP de l'AN et insèrent les données via des upserts idempotents.",
    tags: ['Python', 'GitHub Actions', 'XML'],
  },
  {
    step: '02 · Store',
    title: 'Stockage',
    desc: 'PostgreSQL géré via Supabase avec pgvector pour la recherche sémantique. Idempotent, sans suppression.',
    tags: ['Supabase', 'PostgreSQL', 'pgvector'],
  },
  {
    step: '03 · Transform',
    title: 'Transformation',
    desc: 'Les tables brutes alimentent un projet dbt (staging → intermédiaire → marts), testé automatiquement à chaque PR.',
    tags: ['dbt', 'SQL', 'Marts'],
  },
  {
    step: '04 · Serve',
    title: 'Exposition',
    desc: 'API REST FastAPI avec requêtes SQL directes, rate-limiting et CORS. Déployée sur Railway.',
    tags: ['FastAPI', 'Railway', 'OpenAPI'],
  },
  {
    step: '05 · UI',
    title: 'Interface',
    desc: 'Application Next.js App Router avec RAG (Groq llama-3.3-70b) pour les questions en langage naturel.',
    tags: ['Next.js', 'RAG', 'Groq'],
  },
]

const techCards = [
  { cat: 'Ingestion', name: 'Python scripts', desc: "Fetch + upsert quotidien des ZIPs officiels de l'AN avec retry exponentiel." },
  { cat: 'Transformation', name: 'dbt Core', desc: 'Modèles SQL documentés, tests de qualité, lignage de données complet.' },
  { cat: 'Recherche IA', name: 'Groq llama-3.3-70b', desc: 'Inférence RAG rapide sur le corpus législatif, temperature=0.2.' },
  { cat: 'Embeddings', name: 'OpenAI text-embedding-3-small', desc: '3 741 chunks, 1 536 dimensions, ~0,006 $ par ré-indexation complète.' },
  { cat: 'API', name: 'FastAPI', desc: 'API asynchrone, OpenAPI 3.1, psycopg2 direct, rate-limiting slowapi.' },
  { cat: 'Hébergement', name: 'Railway + Supabase', desc: 'Déploiement automatique sur push master. Postgres 15 géré avec pgvector.' },
  { cat: 'CI/CD', name: 'GitHub Actions', desc: 'Ruff, pytest, dbt compile + test sur chaque PR. Ingestion cron quotidienne.' },
  { cat: 'Frontend', name: 'Next.js App Router', desc: 'SSR + streaming, Tailwind, Newsreader/DM Serif, déployé sur Vercel.' },
]

const sources = [
  {
    name: 'Assemblée nationale — flux XML',
    desc: 'Scrutins, positions par député, comptes rendus de séance',
    status: 'Actif · J+0',
    icon: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  },
  {
    name: 'data.gouv.fr — open data',
    desc: 'Données électorales, mandats, circonscriptions',
    status: 'Actif · J+1',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  },
  {
    name: 'Légifrance — textes officiels',
    desc: 'Lois adoptées, Journal officiel, textes en navette',
    status: 'Actif · J+0',
    icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  },
  {
    name: "Registre des représentants d'intérêts",
    desc: "Déclarations HATVP, conflits d'intérêts, patrimoine",
    status: 'Actif · hebdomadaire',
    icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  },
]

const freshness = [
  { label: 'Votes en séance', cadence: 'Quotidien' },
  { label: 'Fiches députés', cadence: 'Quotidien' },
  { label: 'Corpus RAG', cadence: 'Quotidien' },
  { label: 'Textes de loi', cadence: 'J+1' },
  { label: 'Données patrimoniales', cadence: 'Hebdomadaire' },
]

const apiFeatures = [
  'Accès complet à 577 fiches de députés avec historique de votes',
  'Tous les scrutins de la XVIIᵉ législature, filtrables par date et groupe',
  'Ventilation des votes par groupe parlementaire',
  'Recherche sémantique en langage naturel sur le corpus législatif',
  'Rate-limiting transparent · 30 req/min global · documentation OpenAPI',
]

export default function AProposPage() {
  return (
    <div style={{ background: '#F7F4ED', minHeight: '100vh' }}>

      {/* ====== HERO ====== */}
      <div style={{ padding: '72px 56px 64px', background: 'linear-gradient(180deg,#ffffff 0%,#F7F4ED 100%)', borderBottom: '1px solid #ECE7DC' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 400px', gap: '80px', alignItems: 'center' }}>
          <div>
            <div className="text-red-civic font-semibold text-xs tracking-[0.18em] uppercase mb-5">Notre mission</div>
            <h1 className="font-newsreader text-headline" style={{ fontWeight: 600, lineHeight: 1.06, letterSpacing: '-0.02em', color: '#1B2B50', margin: '0 0 22px', maxWidth: '600px' }}>
              La démocratie mérite<br />des données <em>en clair</em>.
            </h1>
            <p style={{ fontSize: '18px', lineHeight: 1.65, color: '#4B5563', maxWidth: '500px', margin: '0 0 32px' }}>
              MonÉlu ingère, transforme et sert les données de vote de l&apos;Assemblée nationale à tous les citoyens — sans jargon, sans filtre politique, sans abonnement.
            </p>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <Link href="/deputes" style={{ background: '#1B2B50', color: '#fff', padding: '13px 26px', borderRadius: '8px', fontWeight: 600, fontSize: '15px', textDecoration: 'none' }}>
                Explorer les données
              </Link>
              <a
                href="https://monelu-production.up.railway.app/docs"
                target="_blank"
                rel="noopener noreferrer"
                style={{ border: '1.5px solid #E4E6EA', color: '#4B5563', padding: '13px 26px', borderRadius: '8px', fontWeight: 600, fontSize: '15px', background: '#fff', textDecoration: 'none' }}
              >
                Documentation API
              </a>
            </div>
          </div>

          {/* Stats card */}
          <div style={{ background: '#fff', border: '1px solid #E4E6EA', borderRadius: '14px', padding: '32px', boxShadow: '0 4px 16px rgba(27,43,80,0.08)' }}>
            <div style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '24px' }}>
              Plateforme en chiffres
            </div>
            {heroStats.map((s) => (
              <div key={s.label} style={{ padding: '16px 0', borderBottom: '1px solid #F0F1F3', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '16px' }}>
                <span style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.35 }}>{s.label}</span>
                <span className="font-newsreader text-[28px]" style={{ fontWeight: 600, color: '#1B2B50', letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{s.value}</span>
              </div>
            ))}
            <div className="font-mono" style={{ paddingTop: '16px', fontSize: '11.5px', color: '#9CA3AF' }}>
              Mise à jour continue · flux officiel AN
            </div>
          </div>
        </div>
      </div>

      {/* ====== MANIFESTE ====== */}
      <div style={{ padding: '80px 56px', borderBottom: '1px solid #ECE7DC', background: '#F7F4ED' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'grid', gridTemplateColumns: '280px 1fr', gap: '80px', alignItems: 'start' }}>
          <div>
            <div className="text-red-civic font-semibold text-xs tracking-[0.18em] uppercase mb-4">Pourquoi MonÉlu</div>
            <div style={{ width: '40px', height: '3px', background: '#1B2B50', borderRadius: '2px' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <p className="font-newsreader text-[26px]" style={{ fontWeight: 500, lineHeight: 1.5, color: '#1B2B50', margin: 0 }}>
              &laquo;&nbsp;Les données parlementaires existent — elles sont publiques, officielles, riches. Mais elles sont éparpillées, peu structurées, et inaccessibles au plus grand nombre.&nbsp;&raquo;
            </p>
            <p style={{ fontSize: '16px', lineHeight: 1.7, color: '#4B5563', margin: 0 }}>
              MonÉlu est né de ce constat. Nous agrégeons les flux bruts de l&apos;Assemblée nationale, les transformons via un pipeline de données de production, et les restituons sous une forme lisible — pour les citoyens, les journalistes, les chercheurs et les développeurs.
            </p>
            <p style={{ fontSize: '16px', lineHeight: 1.7, color: '#4B5563', margin: 0 }}>
              Chaque donnée affichée est traçable jusqu&apos;à sa source officielle. Aucune interprétation, aucune inférence non documentée. Les votes sont des votes. Les absences sont des absences.
            </p>
          </div>
        </div>
      </div>

      {/* ====== VALEURS ====== */}
      <div style={{ padding: '80px 56px', borderBottom: '1px solid #ECE7DC', background: '#fff' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
          <div style={{ marginBottom: '48px' }}>
            <div className="text-red-civic font-semibold text-xs tracking-[0.18em] uppercase mb-3">Nos engagements</div>
            <h2 className="font-newsreader text-section" style={{ fontWeight: 600, color: '#1B2B50', margin: 0, letterSpacing: '-0.015em' }}>Ce qui nous guide</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '24px' }}>
            {valeurs.map((v) => (
              <div key={v.title} style={{ background: '#F7F4ED', border: '1px solid #ECE7DC', borderRadius: '12px', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fff', border: '1px solid #E4E6EA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B2B50" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: v.icon }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: '15.5px', color: '#1B2B50' }}>{v.title}</div>
                <div style={{ fontSize: '14px', lineHeight: 1.6, color: '#6B7280' }}>{v.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ====== METHODOLOGIE ====== */}
      <div style={{ padding: '80px 56px', borderBottom: '1px solid #ECE7DC', background: '#F7F4ED' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          <div style={{ marginBottom: '48px' }}>
            <div className="text-red-civic font-semibold text-xs tracking-[0.18em] uppercase mb-3">Comment lire les chiffres</div>
            <h2 className="font-newsreader text-section" style={{ fontWeight: 600, color: '#1B2B50', margin: 0, letterSpacing: '-0.015em' }}>Méthodologie</h2>
          </div>

          <div id="methodologie-presence" style={{ scrollMarginTop: '96px', background: '#fff', border: '1px solid #E4E6EA', borderRadius: '12px', padding: '28px 30px', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1B2B50', marginBottom: '10px' }}>Le taux de présence</div>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#4B5563', margin: '0 0 12px' }}>
              Un·e député·e est compté·e présent·e dès qu&apos;une position — <strong>pour</strong>, <strong>contre</strong>, <strong>abstention</strong> ou <strong>non-votant</strong> — est enregistrée sur un scrutin. Un non-votant était en séance mais n&apos;a pas pris position ; c&apos;est un cas documenté d&apos;absence de vote, pas une absence physique, donc il compte comme présent.
            </p>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#4B5563', margin: '0 0 12px' }}>
              Le dénominateur ne compte que les scrutins tenus pendant le mandat du·de la député·e — un·e élu·e arrivé·e en cours de législature n&apos;est pas pénalisé·e pour des votes antérieurs à son entrée en fonction.
            </p>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#4B5563', margin: 0 }}>
              C&apos;est pourquoi la Présidente de l&apos;Assemblée nationale, qui apparaît sur chaque scrutin par fonction, affiche 100&nbsp;% de présence.
            </p>
          </div>

          <div id="nonvotant-abstention" style={{ scrollMarginTop: '96px', background: '#fff', border: '1px solid #E4E6EA', borderRadius: '12px', padding: '28px 30px', marginBottom: '20px' }}>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1B2B50', marginBottom: '10px' }}>Non-votant ≠ abstention</div>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#4B5563', margin: '0 0 12px' }}>
              Ce sont deux positions distinctes dans les données officielles de l&apos;Assemblée nationale : <strong>abstention</strong> est une position exprimée volontairement — le·la député·e a choisi de ne pencher ni pour ni contre. <strong>Non-votant</strong> signifie qu&apos;aucune position n&apos;a été enregistrée, pour des raisons variées (mandat, empêchement, choix de ne pas participer au vote).
            </p>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#4B5563', margin: 0 }}>
              Les pourcentages pour/contre/abstention affichés sur les fiches de scrutin ne portent que sur les positions exprimées (pour + contre + abstention) — le nombre de non-votants est affiché à part, jamais mélangé dans ce calcul.
            </p>
          </div>

          <div id="nombre-deputes" style={{ scrollMarginTop: '96px', background: '#fff', border: '1px solid #E4E6EA', borderRadius: '12px', padding: '28px 30px' }}>
            <div style={{ fontWeight: 700, fontSize: '16px', color: '#1B2B50', marginBottom: '10px' }}>Pourquoi le nombre de députés varie</div>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#4B5563', margin: 0 }}>
              L&apos;Assemblée nationale compte 577 sièges. Le compteur affiché sur la page d&apos;accueil dénombre l&apos;ensemble des député·e·s ayant siégé au moins une fois depuis le début de la XVIIᵉ législature (7 juillet 2024) — y compris celles et ceux remplacé·e·s en cours de mandat (décès, nomination au gouvernement, invalidation). Ce total est donc naturellement supérieur à 577.
            </p>
          </div>
        </div>
      </div>

      {/* ====== STACK TECHNIQUE ====== */}
      <div style={{ padding: '80px 56px', borderBottom: '1px solid #ECE7DC', background: '#111C35' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto' }}>
          <div style={{ marginBottom: '52px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: '12px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#E0786E', marginBottom: '14px' }}>Architecture</div>
              <h2 className="font-newsreader text-section" style={{ fontWeight: 600, color: '#fff', margin: 0, letterSpacing: '-0.015em' }}>
                Une infrastructure de production,<br />pas un prototype.
              </h2>
            </div>
            <div style={{ fontSize: '13.5px', color: '#6B7280', maxWidth: '320px', lineHeight: 1.6, textAlign: 'right' }}>
              Code source ouvert · audit indépendant possible · aucune donnée personnelle collectée
            </div>
          </div>

          {/* Pipeline flow */}
          <div style={{ display: 'flex', alignItems: 'stretch', marginBottom: '48px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', overflow: 'hidden' }}>
            {pipeline.map((pl, i) => (
              <div key={pl.step} style={{ flex: 1, padding: '28px 22px', borderRight: i < pipeline.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
                <div className="font-mono" style={{ fontWeight: 700, fontSize: '10px', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#E0786E', marginBottom: '14px' }}>{pl.step}</div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: '#fff', marginBottom: '8px' }}>{pl.title}</div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#9CA3AF' }}>{pl.desc}</div>
                <div style={{ marginTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {pl.tags.map((tag) => (
                    <span key={tag} className="font-mono" style={{ fontSize: '11px', padding: '3px 9px', borderRadius: '4px', background: 'rgba(255,255,255,0.07)', color: '#9CA3AF', border: '1px solid rgba(255,255,255,0.08)' }}>{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Tech grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '16px' }}>
            {techCards.map((tc) => (
              <div key={tc.name} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '20px 18px' }}>
                <div className="font-mono" style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E0786E', marginBottom: '10px' }}>{tc.cat}</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: '#fff', marginBottom: '6px' }}>{tc.name}</div>
                <div style={{ fontSize: '13px', color: '#6B7280', lineHeight: 1.5 }}>{tc.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ====== SOURCES & TRANSPARENCE ====== */}
      <div style={{ padding: '80px 56px', borderBottom: '1px solid #ECE7DC', background: '#F7F4ED' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 420px', gap: '72px', alignItems: 'start' }}>
          <div>
            <div className="text-red-civic font-semibold text-xs tracking-[0.18em] uppercase mb-3">Transparence des données</div>
            <h2 className="font-newsreader text-section" style={{ fontWeight: 600, color: '#1B2B50', margin: '0 0 22px', letterSpacing: '-0.015em' }}>D&apos;où viennent les données&nbsp;?</h2>
            <p style={{ fontSize: '16px', lineHeight: 1.7, color: '#4B5563', margin: '0 0 36px' }}>
              Toutes les informations affichées sur MonÉlu proviennent de sources publiques officielles. Nous ne produisons pas de données — nous les structurons, les enrichissons et les rendons accessibles. Chaque entrée est horodatée et traçable.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {sources.map((src) => (
                <div key={src.name} style={{ background: '#fff', border: '1px solid #E4E6EA', borderRadius: '10px', padding: '20px 22px', display: 'flex', alignItems: 'center', gap: '18px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <div style={{ width: '44px', height: '44px', flexShrink: 0, borderRadius: '10px', background: '#F7F4ED', border: '1px solid #ECE7DC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1B2B50" strokeWidth="1.8" strokeLinecap="round" dangerouslySetInnerHTML={{ __html: src.icon }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '15px', color: '#1B2B50' }}>{src.name}</div>
                    <div style={{ fontSize: '13px', color: '#9CA3AF', marginTop: '3px' }}>{src.desc}</div>
                  </div>
                  <div className="font-mono" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#1F8A5B', background: '#EAF5EF', padding: '5px 11px', borderRadius: '999px', whiteSpace: 'nowrap' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '999px', background: '#1F8A5B', flexShrink: 0, display: 'inline-block' }} />
                    {src.status}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Freshness + license card */}
          <div style={{ position: 'sticky', top: '100px' }}>
            <div style={{ background: '#fff', border: '1px solid #E4E6EA', borderRadius: '14px', padding: '28px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', marginBottom: '16px' }}>
              <div style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '20px' }}>Fraîcheur des données</div>
              {freshness.map((fr) => (
                <div key={fr.label} style={{ padding: '14px 0', borderBottom: '1px solid #F0F1F3', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                  <span style={{ fontSize: '13.5px', color: '#374151' }}>{fr.label}</span>
                  <span className="font-mono" style={{ fontSize: '12px', color: '#6B7280' }}>{fr.cadence}</span>
                </div>
              ))}
              <div style={{ paddingTop: '18px', fontSize: '12.5px', lineHeight: 1.6, color: '#9CA3AF' }}>
                Pipeline actif tous les jours ouvrés :<br />
                <span style={{ color: '#1B2B50', fontWeight: 600 }}>06h00 UTC · GitHub Actions cron</span>
              </div>
            </div>
            <div style={{ background: '#EAF5EF', border: '1px solid #C2E3D2', borderRadius: '10px', padding: '16px 18px', fontSize: '13.5px', lineHeight: 1.6, color: '#1F8A5B' }}>
              <span style={{ fontWeight: 700 }}>Licence ouverte Etalab 2.0</span><br />
              Toutes les données redistribuées sont sous licence ouverte. Réutilisation libre, attribution requise.
            </div>
          </div>
        </div>
      </div>

      {/* ====== API ====== */}
      <div style={{ padding: '80px 56px', borderBottom: '1px solid #ECE7DC', background: '#fff' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 540px', gap: '80px', alignItems: 'center' }}>
          <div>
            <div className="text-red-civic font-semibold text-xs tracking-[0.18em] uppercase mb-3">Pour les développeurs</div>
            <h2 className="font-newsreader text-section" style={{ fontWeight: 600, color: '#1B2B50', margin: '0 0 20px', letterSpacing: '-0.015em' }}>
              Une API REST pensée pour être utilisée.
            </h2>
            <p style={{ fontSize: '16px', lineHeight: 1.7, color: '#4B5563', margin: '0 0 32px' }}>
              Accédez à l&apos;intégralité des données MonÉlu par programme. Députés, votes, scrutins — tout est exposé, documenté, versionné.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '36px' }}>
              {apiFeatures.map((af) => (
                <div key={af} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F8A5B" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span style={{ fontSize: '15px', color: '#374151' }}>{af}</span>
                </div>
              ))}
            </div>
            <a
              href="https://monelu-production.up.railway.app/docs"
              target="_blank"
              rel="noopener noreferrer"
              style={{ background: '#C9302C', color: '#fff', padding: '13px 26px', borderRadius: '8px', fontWeight: 600, fontSize: '15px', textDecoration: 'none', display: 'inline-block' }}
            >
              Documentation complète →
            </a>
          </div>

          {/* Code block */}
          <div style={{ background: '#111C35', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 8px 24px rgba(0,0,0,0.14)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ width: '11px', height: '11px', borderRadius: '999px', background: '#FF5F57', display: 'inline-block' }} />
              <span style={{ width: '11px', height: '11px', borderRadius: '999px', background: '#FEBC2E', display: 'inline-block' }} />
              <span style={{ width: '11px', height: '11px', borderRadius: '999px', background: '#28C840', display: 'inline-block' }} />
              <span className="font-mono" style={{ fontSize: '12px', color: '#4B5563', marginLeft: '8px' }}>Terminal</span>
            </div>
            <div className="font-mono" style={{ padding: '24px 24px 28px', fontSize: '13.5px', lineHeight: 2, color: '#E4E6EA', overflowX: 'auto' }}>
              <div><span style={{ color: '#9CA3AF' }}># Votes d&apos;un député</span></div>
              <div style={{ marginTop: '8px' }}>
                <span style={{ color: '#E0786E' }}>GET</span>
                <span style={{ color: '#fff' }}> /deputies/PA722990/votes</span>
              </div>
              <div style={{ marginTop: '16px', color: '#9CA3AF' }}>{'{'}</div>
              <div style={{ paddingLeft: '20px' }}>
                <span style={{ color: '#E0786E' }}>&quot;total&quot;</span>
                <span style={{ color: '#9CA3AF' }}>: </span>
                <span style={{ color: '#1F8A5B' }}>1248</span>
                <span style={{ color: '#9CA3AF' }}>,</span>
              </div>
              <div style={{ paddingLeft: '20px' }}>
                <span style={{ color: '#E0786E' }}>&quot;pour&quot;</span>
                <span style={{ color: '#9CA3AF' }}>: </span>
                <span style={{ color: '#1F8A5B' }}>892</span>
                <span style={{ color: '#9CA3AF' }}>,</span>
              </div>
              <div style={{ paddingLeft: '20px' }}>
                <span style={{ color: '#E0786E' }}>&quot;contre&quot;</span>
                <span style={{ color: '#9CA3AF' }}>: </span>
                <span style={{ color: '#1F8A5B' }}>198</span>
                <span style={{ color: '#9CA3AF' }}>,</span>
              </div>
              <div style={{ paddingLeft: '20px' }}>
                <span style={{ color: '#E0786E' }}>&quot;derniere_sync&quot;</span>
                <span style={{ color: '#9CA3AF' }}>: </span>
                <span style={{ color: '#E0786E' }}>&quot;2025-06-25T06:14:00Z&quot;</span>
              </div>
              <div style={{ color: '#9CA3AF' }}>{'}'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== CONTACT ====== */}
      <div style={{ padding: '64px 56px', borderBottom: '1px solid #ECE7DC', background: '#fff' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'grid', gridTemplateColumns: '280px 1fr', gap: '80px', alignItems: 'start' }}>
          <div>
            <div className="text-red-civic font-semibold text-xs tracking-[0.18em] uppercase mb-4">Contact</div>
            <div style={{ width: '40px', height: '3px', background: '#1B2B50', borderRadius: '2px', marginBottom: '20px' }} />
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: '#6B7280', margin: 0 }}>
              Une question, un bug, une proposition de partenariat ? Contactez directement la personne responsable de la plateforme.
            </p>
          </div>

          <div style={{ background: '#F7F4ED', border: '1px solid #ECE7DC', borderRadius: '14px', padding: '32px', display: 'flex', alignItems: 'center', gap: '32px' }}>
            <Image
              src="https://github.com/Walid-peach.png"
              alt="Walid Elkhoukh"
              width={72}
              height={72}
              style={{ borderRadius: '999px', flexShrink: 0, objectFit: 'cover' }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '19px', color: '#1B2B50', marginBottom: '4px' }}>Walid Elkhoukh</div>
              <div style={{ fontSize: '14px', color: '#9CA3AF', marginBottom: '16px' }}>Data Engineer · responsable de la plateforme</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                <a
                  href="mailto:walidelkhoukh99@gmail.com"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #E4E6EA', color: '#1B2B50', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  walidelkhoukh99@gmail.com
                </a>
                <a
                  href="https://github.com/Walid-peach"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#fff', border: '1px solid #E4E6EA', color: '#1B2B50', padding: '10px 18px', borderRadius: '8px', fontWeight: 600, fontSize: '14px', textDecoration: 'none' }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  GitHub
                </a>
              </div>
            </div>
            <div style={{ flexShrink: 0, background: '#fff', border: '1px solid #E4E6EA', borderRadius: '10px', padding: '16px 20px', minWidth: '200px' }}>
              <div className="font-mono" style={{ fontWeight: 700, fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9CA3AF', marginBottom: '12px' }}>Temps de réponse</div>
              <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
                Bugs &amp; questions techniques<br />
                <span style={{ fontWeight: 600, color: '#1B2B50' }}>sous 48 h</span>
              </div>
              <div style={{ height: '1px', background: '#F0F1F3', margin: '12px 0' }} />
              <div style={{ fontSize: '14px', color: '#374151', lineHeight: 1.6 }}>
                Partenariats<br />
                <span style={{ fontWeight: 600, color: '#1B2B50' }}>sous une semaine</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====== CTA FINAL ====== */}
      <div style={{ padding: '80px 56px', background: '#1B2B50' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '48px', flexWrap: 'wrap' }}>
          <div>
            <h2 className="font-newsreader text-section-lg" style={{ fontWeight: 600, color: '#fff', margin: '0 0 14px', letterSpacing: '-0.015em' }}>
              Prêt à explorer les données&nbsp;?
            </h2>
            <p style={{ fontSize: '16px', color: '#9CA3AF', margin: 0, lineHeight: 1.6 }}>
              Données ouvertes · API documentée · Code source public
            </p>
          </div>
          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <Link
              href="/deputes"
              style={{ background: '#E0786E', color: '#fff', padding: '14px 30px', borderRadius: '8px', fontWeight: 700, fontSize: '16px', textDecoration: 'none', boxShadow: '0 2px 12px rgba(224,120,110,0.4)' }}
            >
              Commencer →
            </Link>
            <a
              href="https://github.com/Walid-peach"
              target="_blank"
              rel="noopener noreferrer"
              style={{ border: '1.5px solid rgba(255,255,255,0.2)', color: '#fff', padding: '14px 28px', borderRadius: '8px', fontWeight: 600, fontSize: '16px', textDecoration: 'none' }}
            >
              GitHub
            </a>
          </div>
        </div>
      </div>

    </div>
  )
}
