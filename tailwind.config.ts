import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        // Orfeo dark theme
        base: {
          bg:      '#0f0f12',   // main background
          panel:   '#1a1a22',   // panel surfaces
          border:  '#2a2a36',   // subtle borders
          hover:   '#22222e',   // hover states
          active:  '#2e2e3e',   // active/selected
        },
        // Amber gold accent
        accent: {
          DEFAULT: '#e8a027',
          dim:     '#b87d1a',
          bright:  '#f0b84a',
          glow:    'rgba(232,160,39,0.25)',
        },
        // Note colors
        note: {
          right:   '#e8a027',   // right hand / track default
          left:    '#7c6fa0',   // left hand / secondary track
          ghost:   '#3a3a50',   // muted/hidden notes
        },
        // Text
        text: {
          primary:   '#e8e8f0',
          secondary: '#8888a0',
          muted:     '#4a4a60',
          accent:    '#e8a027',
        },
        // Piano keys
        key: {
          white:   '#e8e8e2',
          black:   '#1a1a1e',
          pressed: '#e8a027',
        }
      },
      fontFamily: {
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'xxs': '0.625rem',
      },
      boxShadow: {
        'key-glow':   '0 0 12px rgba(232,160,39,0.6), 0 0 4px rgba(232,160,39,0.4)',
        'panel':      '0 4px 24px rgba(0,0,0,0.4)',
        'inner-dark': 'inset 0 1px 3px rgba(0,0,0,0.5)',
      },
      borderRadius: {
        'key': '0 0 4px 4px',
      }
    },
  },
  plugins: [],
} satisfies Config
