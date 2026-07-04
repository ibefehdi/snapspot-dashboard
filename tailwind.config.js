/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#0f1419',
          raised: '#1a2332',
          border: '#2d3748',
        },
      },
    },
  },
  plugins: [],
}
