/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Violet brand — replaces the old blue
        brand: {
          50:  '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
          950: '#2e1065',
        },
        // Dark-mode surface palette (navy-black)
        dark: {
          base:    '#070C18',
          surface: '#0D1325',
          raised:  '#121C32',
          border:  '#1C2B42',
          subtle:  '#152035',
        },
        // Light-mode surface palette (cool off-white)
        light: {
          base:    '#EEF1FB',
          raised:  '#F6F8FF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      boxShadow: {
        'card-light': '0 1px 3px rgba(0,0,0,.06), 0 2px 8px rgba(0,0,0,.04)',
        'card-dark':  '0 1px 4px rgba(0,0,0,.3),  0 4px 16px rgba(0,0,0,.2)',
        'overlay':    '0 8px 32px rgba(0,0,0,.18)',
        'overlay-dark': '0 12px 40px rgba(0,0,0,.6)',
      },
      keyframes: {
        'slide-in-left':  { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'fade-in':        { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-up-fade':  { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        'slide-in-left': 'slide-in-left 0.22s cubic-bezier(.22,.68,0,1.2)',
        'fade-in':       'fade-in 0.18s ease-out',
        'slide-up-fade': 'slide-up-fade 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
