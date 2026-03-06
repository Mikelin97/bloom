const defaultTheme = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Spectral", "Inter", ...defaultTheme.fontFamily.sans],
        serif: ["Cormorant Garamond", "Merriweather", ...defaultTheme.fontFamily.serif],
        mono: ["JetBrains Mono", ...defaultTheme.fontFamily.mono]
      }
    }
  },
  plugins: [require('@tailwindcss/typography')]
};
