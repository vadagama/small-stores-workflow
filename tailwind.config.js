/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', '-apple-system', 'sans-serif'],
        display: ['Raleway', 'sans-serif'],
      },
      colors: {
        bg: '#0d1117',
        panel: '#161c22',
        panel2: '#1d252d',
      },
    },
  },
  plugins: [],
}
