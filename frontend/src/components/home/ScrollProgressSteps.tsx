'use client'

const STEPS = [
  'Extérieur',
  'Entrée',
  'Hémicycle',
]

type ScrollProgressStepsProps = {
  activeStep: number
}

export function ScrollProgressSteps({ activeStep }: ScrollProgressStepsProps) {
  return (
    <div className="pointer-events-none absolute bottom-6 left-1/2 z-30 hidden -translate-x-1/2 items-center gap-3 rounded-full border border-white/12 bg-navy/45 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/48 backdrop-blur-md md:flex">
      {STEPS.map((step, index) => (
        <div key={step} className="flex items-center gap-3">
          <span className={activeStep === index ? 'text-white' : ''}>{step}</span>
          {index < STEPS.length - 1 && <span className="h-px w-5 bg-white/22" aria-hidden="true" />}
        </div>
      ))}
    </div>
  )
}
