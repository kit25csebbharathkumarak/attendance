/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Sandal & Red Palette (Zero Navy, Zero Black):
        sandal: {
          50: '#FAF4F0',   // Warm sandalwood background
          100: '#FFF0EA',  // Soft sandal surface
          200: '#FCE0D4',  // Light sandal border
          300: '#F9C4B0',  // Sandal border accent
          400: '#FDA481',  // Signature Sandal / Sunset Peach
          500: '#F18057',  // Deep sandal
          600: '#D95C30',
          800: '#7E2C14',  // Warm sandal text
          900: '#4A1709',
        },
        red: {
          50: '#FDF2F4',   // Soft red tint
          100: '#FCE3E7',  // Soft red badge
          200: '#F9BAC4',  // Light red border
          300: '#F48A9C',
          500: '#DC243E',
          600: '#B4182D',  // Signature Crimson Red
          700: '#961123',  // Hover crimson
          800: '#730B19',  // Deep red text
          900: '#4A0812',  // Primary heading dark ruby
          950: '#2E050B',
        },
        // Mapped convenience tokens:
        palette: {
          sandal: '#FDA481',
          red: '#B4182D',
          crimson: '#B4182D',
          peach: '#FDA481',
          bg: '#FAF4F0',
          card: '#FFFFFF',
          border: '#FCE0D4',
        }
      },
      boxShadow: {
        'sandal-sm': '0 2px 8px rgba(180, 24, 45, 0.04)',
        'sandal-md': '0 8px 24px rgba(180, 24, 45, 0.06)',
        'sandal-lg': '0 16px 36px rgba(180, 24, 45, 0.08)',
        'red-sm': '0 4px 14px rgba(180, 24, 45, 0.25)',
      },
      animation: {
        'pulse-subtle': 'pulse 2.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};


