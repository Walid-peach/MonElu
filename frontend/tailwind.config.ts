import type { Config } from 'tailwindcss'

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
        serif: ['DM Serif Display', 'Georgia', 'serif'],
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display': ['3rem', { lineHeight: '1.1', fontWeight: '400' }],
        'display-sm': ['2rem', { lineHeight: '1.15', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
}
export default config
