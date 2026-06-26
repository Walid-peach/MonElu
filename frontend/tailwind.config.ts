import type { Config } from 'tailwindcss'

/**
 * Font role contract:
 *   font-serif      (DM Serif Display)  — landing page hero only
 *   font-newsreader (Newsreader)        — editorial headings (h1/h2/h3) on all data pages
 *   font-sans       (DM Sans)           — body copy, UI labels, navigation
 *   font-mono       (system monospace)  — numbers, dates, metadata, code blocks
 */
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: '#0D1F3C',
          light: '#1A3258',
          muted: 'rgba(13,31,60,0.06)',
        },
        red: {
          civic: '#C9302C',
          light: '#E8413D',
        },
        gray: {
          off: '#F8F7F4',
          light: '#EDECEA',
          mid: '#8A8885',
          border: '#E0DED9',
        },
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        newsreader: ['var(--font-newsreader)', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        // Heading scale — use these on h1/h2/h3 instead of inline fontSize
        'headline':    ['3.25rem', { lineHeight: '1.06' }], // 52px — hero h1
        'display':     ['3rem',    { lineHeight: '1.1', fontWeight: '400' }], // 48px — list page h1
        'title':       ['2.75rem', { lineHeight: '1.05' }], // 44px — detail page h1
        'section-lg':  ['2.625rem',{ lineHeight: '1.1'  }], // 42px — major section h2, stat numbers
        'section':     ['2.375rem',{ lineHeight: '1.1'  }], // 38px — section h2
        'section-sm':  ['1.875rem',{ lineHeight: '1.1'  }], // 30px — sub-section h2
        'display-sm':  ['2rem',    { lineHeight: '1.15' }], // 32px (legacy alias)
      },
    },
  },
  plugins: [],
}
export default config
