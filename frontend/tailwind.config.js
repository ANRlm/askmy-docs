/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        base:     'var(--bg-base)',
        panel:    'var(--bg-panel)',
        sidebar:  'var(--bg-sidebar)',
        elevated: 'var(--bg-elevated)',
        accent:   'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
      },
      fontFamily: {
        sans: ['Geist', 'Noto Sans SC', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['GeistMono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
        xl: '24px',
      },
      animation: {
        'fade-in':      'fade-in 0.2s ease both',
        'slide-up':     'slide-up 0.25s ease both',
        'slide-down':   'slide-down 0.2s ease both',
        'pulse-dot':    'pulse-dot 1.4s ease-in-out infinite',
        'toast-in':     'toast-in 0.2s cubic-bezier(0.34,1.56,0.64,1) both',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-down': {
          from: { opacity: '0', transform: 'translateY(-4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 80%, 100%': { opacity: '0.3', transform: 'scale(0.8)' },
          '40%':           { opacity: '0.8', transform: 'scale(1)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(8px)' },
          to:   { opacity: '1', transform: 'translateX(0)' },
        },
      },
      boxShadow: {
        'glow':   '0 0 20px rgba(0,0,0,0.3)',
        'glow-lg':'0 0 40px rgba(0,0,0,0.4)',
      },
      transitionDuration: {
        '150': '150ms',
      },
    },
  },
  plugins: [],
}
