/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        obsidian: "#0a0c10",
        surface: "#111620",
        elevated: "#181f2e",
        bull: "#39ff14",
        bear: "#ff2d2d",
        neutral: "#f0c040",
        cyan: "#00d4ff",
        purple: "#a855f7",
        dim: "#3d4f60",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "monospace"],
        display: ["'Space Grotesk'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
