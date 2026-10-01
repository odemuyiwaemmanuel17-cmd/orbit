/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        space: {
          950: '#030712',
          900: '#061020',
          800: '#0b1a30',
          700: '#12263f',
        },
        pulse: {
          DEFAULT: '#22d3ee',
          soft: 'rgba(34,211,238,0.14)',
          line: 'rgba(34,211,238,0.35)',
        },
      },
      fontFamily: {
        mono: ['Cascadia Code', 'JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        hud: '0 0 24px rgba(34,211,238,0.12), inset 0 0 24px rgba(34,211,238,0.05)',
        glow: '0 0 12px rgba(34,211,238,0.6)',
      },
    },
  },
  plugins: [],
}
