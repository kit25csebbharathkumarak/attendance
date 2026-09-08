/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          800: '#1e222e',
          850: '#151821',
          900: '#0f1117',
          950: '#0a0c10',
        },
        brand: {
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
        },
        accent: {
          emerald: '#10b981',
          cyan: '#06b6d4',
          violet: '#8b5cf6',
          rose: '#f43f5e',
        }
      },
      animation: {
        'pulse-subtle': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'flash-green': 'flashGreen 1.2s ease-out',
      },
      keyframes: {
        flashGreen: {
          '0%': { backgroundColor: 'rgba(16, 185, 129, 0.25)' },
          '100%': { backgroundColor: 'transparent' },
        }
      }
    },
  },
  plugins: [],
};
