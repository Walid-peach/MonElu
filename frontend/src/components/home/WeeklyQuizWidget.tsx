'use client'
import { useState } from 'react'
import Link from 'next/link'
import type { QuizAnswerPosition, QuizWeeklyQuestion } from '@/lib/api'
import { POS } from '@/lib/vote-position'

// "Scrutin de la semaine" (MON-185, MON-178 step 7): a single auto-picked
// scrutin, answered inline, reveal in the same style as the full quiz
// (MON-180). Nothing is sent to the server — the answer only decides which
// local reveal copy to show, mirroring the full quiz's ADR-025 stance that
// individual answers are never persisted.
export function WeeklyQuizWidget({ question }: { question: QuizWeeklyQuestion | null }) {
  const [answer, setAnswer] = useState<QuizAnswerPosition | null>(null)

  if (!question) return null

  const tallyKnown = question.votes_for != null && question.votes_against != null
  const resultVerb =
    question.result === 'adopté' ? 'adopté' : question.result === 'rejeté' ? 'rejeté' : null
  const resultLine = tallyKnown
    ? (resultVerb ? `L’Assemblée a ${resultVerb} ce texte : ` : 'Résultat du scrutin : ') +
      `${question.votes_for} pour, ${question.votes_against} contre` +
      (question.abstentions != null
        ? `, ${question.abstentions} abstention${question.abstentions > 1 ? 's' : ''}`
        : '') +
      '.'
    : null
  const majority =
    tallyKnown && question.votes_for !== question.votes_against
      ? question.votes_for! > question.votes_against!
        ? 'pour'
        : 'contre'
      : null
  const outcomeLine =
    answer === 'abstention'
      ? 'Vous vous êtes abstenu·e sur ce texte.'
      : majority
        ? answer === majority
          ? 'Vous étiez avec la majorité.'
          : 'Vous étiez avec la minorité.'
        : null

  return (
    <section className="mx-auto max-w-2xl px-4 py-16">
      <div className="border border-navy/10 bg-white p-6 shadow-xl shadow-navy/6 sm:p-8">
        <p className="text-xs font-semibold uppercase text-red-civic">Le scrutin de la semaine</p>
        <h2 className="mt-3 font-serif text-2xl leading-tight text-navy">
          Auriez-vous voté pour ou contre&nbsp;?
        </h2>
        <p className="mt-3 text-sm leading-6 text-gray-mid">{question.question}</p>

        {answer ? (
          <div className="mt-5 rounded-lg border border-navy/10 bg-[var(--dp-card-bg)] p-5">
            <p className="m-0 text-[15.5px] font-semibold leading-6 text-navy">
              {resultLine ?? 'Résultat du scrutin indisponible pour ce texte.'}
            </p>
            {outcomeLine && (
              <p className="mt-2.5 text-sm text-gray-mid">{outcomeLine}</p>
            )}
            <Link
              href="/quiz"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-civic px-5 py-2.5 text-sm font-semibold text-white"
            >
              Faire le quiz complet →
            </Link>
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {(['pour', 'contre', 'abstention'] as const).map(pos => {
              const { label } = POS[pos]
              return (
                <button
                  key={pos}
                  onClick={() => setAnswer(pos)}
                  className="rounded-lg border-2 border-transparent px-5 py-3.5 text-left text-base font-semibold"
                  style={{ color: POS[pos].color, background: POS[pos].bg }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
