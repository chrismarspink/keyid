/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#1a3a6b',
          700: '#152f58',
          800: '#102445',
          900: '#0b1a32',
          950: '#060e1a'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Mono', 'monospace'],
        sans: ['Inter', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        card: '0 4px 24px 0 rgba(26,58,107,0.18)',
        'card-lg': '0 8px 40px 0 rgba(26,58,107,0.24)'
      }
    }
  },
  plugins: []
};
