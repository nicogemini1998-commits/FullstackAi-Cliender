/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 900: '#0a1628', 800: '#0f2040', 700: '#1a3a6b' },
        lead: {
          green:  '#10b981',
          blue:   '#3b82f6',
          orange: '#f97316',
          red:    '#ef4444',
          gray:   '#6b7280',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}


