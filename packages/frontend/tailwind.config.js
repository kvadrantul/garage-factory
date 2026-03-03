/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'node-pending': '#e5e7eb',
        'node-running': '#60a5fa',
        'node-completed': '#4ade80',
        'node-error': '#f87171',
        'node-hitl': '#fbbf24',
      },
    },
  },
  plugins: [],
}
