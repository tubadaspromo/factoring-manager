/** @type {import('tailwindcss').Config} */
export default {
  content: [
  "./index.html",
  "./src/**/*.{js,ts,jsx,tsx}",
  "./src/pages/**/*.{js,ts,jsx,tsx}", // Adicione esta linha por segurança
],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#0D0F14',
          surface:  '#161A23',
          elevated: '#1E2330',
          overlay:  '#252B3B',
        },
        brand: {
          DEFAULT: '#00D4AA',
          muted:   '#00D4AA26',
          dark:    '#009E7E',
          contrast:'#003D30',
        },
        status: {
          active:    '#00D4AA',
          overdue:   '#FF5C5C',
          settled:   '#A3A8B8',
          pending:   '#FFB547',
        },
        content: {
          primary:   '#F0F2F8',
          secondary: '#8B91A7',
          tertiary:  '#505668',
        },
        border: '#252B3B',
      },
      fontFamily: {
        heading: ['Syne', 'sans-serif'],
        body:    ['Inter', 'sans-serif'],
        mono:    ['Space Mono', 'monospace'],
      },
      boxShadow: {
        brand: '0 4px 24px 0 rgba(0, 212, 170, 0.20)',
        card:  '0 2px 8px 0 rgba(0, 0, 0, 0.35)',
      },
    },
  },
  plugins: [],
}
