/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Vazirmatn", "system-ui", "sans-serif"],
      },
      colors: {
        ink: "#16302a",
        muted: "#6b7f78",
        line: "#e4ebe7",
        paper: "#f6f8f6",
        brand: {
          50: "#eaf6f0",
          100: "#d2ebe0",
          500: "#1e8a5f",
          600: "#187a53",
          700: "#136344",
        },
        warn: { 50: "#fdf3e3", 500: "#b06a00", 700: "#8a5200" },
        danger: { 50: "#fbeae8", 500: "#b3382e", 700: "#8f2a22" },
        info: { 50: "#eaf2fa", 500: "#2c6e9b" },
      },
      boxShadow: {
        card: "0 1px 2px rgba(22,48,42,.06), 0 8px 24px -16px rgba(22,48,42,.25)",
      },
      borderRadius: { xl2: "1.25rem" },
    },
  },
  plugins: [],
};
