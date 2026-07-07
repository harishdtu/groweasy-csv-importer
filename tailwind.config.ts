import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff4ee',
          100: '#ffe6d9',
          400: '#ff8a5c',
          500: '#f9622c',
          600: '#e4501e',
          700: '#bd3d16'
        },
        ink: {
          900: '#0b1220',
          800: '#111a2b',
          700: '#1a2540'
        }
      },
      boxShadow: {
        soft: '0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 3px rgba(16, 24, 40, 0.1)',
        card: '0 4px 16px rgba(16, 24, 40, 0.08)'
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } }
      },
      animation: {
        fadeIn: 'fadeIn 0.25s ease-out'
      }
    }
  },
  plugins: []
};

export default config;
