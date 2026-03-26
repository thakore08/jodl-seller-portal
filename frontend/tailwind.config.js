/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef3ff',
          100: '#dce6ff',
          500: '#4169ff',
          600: '#3459ea',
          700: '#2a49cc',
          900: '#13256f',
        },
        signal: {
          50: '#fff2f3',
          100: '#ffe3e6',
          500: '#fb5457',
          600: '#e64346',
          700: '#be2f31',
        },
      },
    },
  },
  plugins: [],
};
