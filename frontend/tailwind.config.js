/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // OrbitalPulse cinematic mission-control palette (single source of truth).
        // Green is reserved for success semantics; amber/red for caution/critical.
        bg: { DEFAULT: '#050B17', alt: '#0A1425' }, // deep-space backgrounds
        panel: '#0E1B2E',                            // mission panel surfaces
        pri: '#3B82F6',                              // primary blue
        hi: '#38D9FF',                               // cyan highlight
        fg: '#F2F7FF',                               // main text
        mut: '#91A6C2',                              // secondary text
        ok: '#2DD4BF',                               // success / nominal
        cau: '#F5B942',                              // caution
        crit: '#FF647C',                             // critical alert
      },
      fontFamily: {
        mono: ['Cascadia Code', 'JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
