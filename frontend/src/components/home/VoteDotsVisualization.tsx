'use client'

export function VoteDotsVisualization() {
  return (
    <section className="relative bg-gray-off px-4 py-16 md:px-8 md:py-20 lg:px-12">
      <div className="mx-auto max-w-7xl border border-navy/10 bg-white/75 p-6 shadow-xl shadow-navy/5 md:p-8">
        <p className="text-xs font-semibold uppercase text-red-civic">Prochaine lecture</p>
        <h2 className="mt-3 max-w-3xl font-serif text-3xl leading-tight text-navy md:text-5xl">
          Les sièges deviennent des positions de vote.
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-7 text-navy/62">
          La prochaine transformation pourra remplacer progressivement l&apos;hémicycle par
          une visualisation en points: vert pour, rouge contre, orange abstention, gris
          non-votant.
        </p>
      </div>
    </section>
  )
}
