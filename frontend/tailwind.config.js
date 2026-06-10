/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6ff', 100: '#d9eaff', 400: '#4d9aff',
          500: '#1f7aff', 600: '#0e5fe0', 700: '#0b4ab3',
        },
      },
    },
  },
  plugins: [],
};
