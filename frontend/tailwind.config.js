/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        // Map Tailwind utilities to CSS tokens for convenience
        base:     'var(--bg-base)',
        panel:    'var(--bg-panel)',
        sidebar:  'var(--bg-sidebar)',
        elevated: 'var(--bg-elevated)',
        accent:   'var(--accent)',
      },
      backdropBlur: {
        xs: '2px',
      },
      animation: {
        'fade-in':    'fade-in 0.18s ease both',
        'slide-up':   'slide-up 0.22s ease both',
        'slide-down': 'slide-down 0.18s ease both',
        'pulse-dot':  'pulse-dot 1.4s ease-in-out infinite',
        'toast-in':   'toast-in 0.24s cubic-bezier(0.34,1.56,0.64,1) both',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-6px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 80%, 100%': { opacity: '0.25', transform: 'scale(0.75)' },
          '40%':           { opacity: '1',    transform: 'scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(12px) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
      },
    },
  },
  plugins: [],
}
