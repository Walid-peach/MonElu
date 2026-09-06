import { render } from '@testing-library/react'
import MethodologiePage from '@/app/methodologie/page'
import AProposPage from '@/app/a-propos/page'
import { METHODOLOGIE_FAQ, A_PROPOS_FAQ, type FaqItem } from '@/lib/faq'
import { buildFaqJsonLd } from '@/lib/seo'

/**
 * Schema.org requires both halves of an FAQ pair to be visible to the reader on
 * the page carrying the markup. These tests are what make that a build-time
 * guarantee instead of a review-time promise: they render the real page and
 * fail the moment a copy edit moves the visible text away from what the
 * JSON-LD claims (MON-268).
 */

/** Collapse nbsp, narrow spaces and whitespace runs so a comparison is about
 *  wording rather than French typographic spacing. */
function normalize(text: string): string {
  return text.replace(/[   ]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Visible prose of one section, block by block, the way a reader reads it -
 *  `textContent` alone would run the last word of a paragraph into the first
 *  word of the next. */
function visibleProse(container: HTMLElement, id: string): string {
  const section = container.querySelector(`#${id}`)
  if (!section) throw new Error(`No element with id "${id}" on the page`)
  const blocks = Array.from(section.querySelectorAll('p, li')).map(el => el.textContent ?? '')
  return normalize(blocks.join(' '))
}

function headingOf(container: HTMLElement, id: string): string {
  const heading = container.querySelector(`#${id}`)?.querySelector('h2, h3')
  return normalize(heading?.textContent ?? '')
}

function jsonLdBlocks(container: HTMLElement): Record<string, unknown>[] {
  return Array.from(container.querySelectorAll('script[type="application/ld+json"]')).map(el =>
    JSON.parse(el.textContent ?? '{}')
  )
}

describe('buildFaqJsonLd', () => {
  const items: FaqItem[] = [{ id: 'x', question: 'Pourquoi ?', answer: 'Parce que.' }]

  it('builds an FAQPage whose mainEntity is Question/Answer pairs', () => {
    const data = buildFaqJsonLd(items)
    expect(data['@type']).toBe('FAQPage')
    expect(data.inLanguage).toBe('fr')
    expect(data.mainEntity).toEqual([
      {
        '@type': 'Question',
        name: 'Pourquoi ?',
        acceptedAnswer: { '@type': 'Answer', text: 'Parce que.' },
      },
    ])
  })

  it('carries every pair it is given, in order', () => {
    const data = buildFaqJsonLd(METHODOLOGIE_FAQ)
    expect(data.mainEntity).toHaveLength(METHODOLOGIE_FAQ.length)
    expect((data.mainEntity as { name: string }[]).map(q => q.name)).toEqual(
      METHODOLOGIE_FAQ.map(item => item.question)
    )
  })
})

describe('/methodologie FAQ markup', () => {
  it('emits an FAQPage block', () => {
    const { container } = render(<MethodologiePage />)
    const faq = jsonLdBlocks(container).find(block => block['@type'] === 'FAQPage')
    expect(faq).toBeDefined()
    expect(faq!.mainEntity).toHaveLength(METHODOLOGIE_FAQ.length)
  })

  it.each(METHODOLOGIE_FAQ.map(item => [item.id, item] as const))(
    '#%s shows its question as the section heading and its answer in the prose',
    (_id, item) => {
      const { container } = render(<MethodologiePage />)
      expect(headingOf(container, item.id)).toBe(normalize(item.question))
      expect(visibleProse(container, item.id)).toContain(normalize(item.answer))
    }
  )

  it('keeps the anchors deep-linked from other pages', () => {
    const { container } = render(<MethodologiePage />)
    // Linked from deputy pages, vote pages, the hemicycle chart and the home
    // page pulse panel - renaming a section must not break those.
    for (const id of ['presence', 'limites', 'deputes-suivis']) {
      expect(container.querySelector(`#${id}`)).not.toBeNull()
    }
  })
})

describe('/a-propos FAQ markup', () => {
  it('emits an FAQPage block', () => {
    const { container } = render(<AProposPage />)
    const faq = jsonLdBlocks(container).find(block => block['@type'] === 'FAQPage')
    expect(faq).toBeDefined()
    expect(faq!.mainEntity).toHaveLength(A_PROPOS_FAQ.length)
  })

  it.each(A_PROPOS_FAQ.map(item => [item.id, item] as const))(
    '#%s shows both its question and its answer',
    (_id, item) => {
      const { container } = render(<AProposPage />)
      expect(headingOf(container, item.id)).toBe(normalize(item.question))
      expect(visibleProse(container, item.id)).toContain(normalize(item.answer))
    }
  )
})
