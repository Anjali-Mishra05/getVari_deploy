/** @type {import('tailwindcss').Config} */
module.exports = {
  // NOTE: Update this to include the paths to all of your component files.
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Menlo", "Courier", "monospace"],
      },
      colors: {
        vari: {
          bg: '#02050e',
          accent: '#06b6d4',
          glow: 'rgba(6, 182, 212, 0.05)',
        }
      }
    },
  },
  plugins: [],
}
