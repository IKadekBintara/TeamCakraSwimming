import type { Config } from "tailwindcss";

/**
 * TEAM CAKRA SWIMMING — Design Tokens
 * Pool blue accent + warm white and deep navy surfaces. Single source of truth;
 * pages never define their own colors beyond these scales.
 */
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Pool blue from the approved FigCraft redesign.
        brand: {
          50: "#eef4ff",
          100: "#dce8ff",
          200: "#bdd4ff",
          300: "#93baff",
          400: "#6b9cff",
          500: "#3979ed",
          600: "#2264db",
          700: "#1d51b4",
          800: "#203f88",
          900: "#203868",
          950: "#122341",
        },
        // Deep water navy — premium surfaces, headers, dark-mode base.
        navy: {
          50: "#f2f6fa",
          100: "#e3ebf3",
          200: "#c5d4e4",
          300: "#9db4cd",
          400: "#7092b4",
          500: "#51749b",
          600: "#3e5c81",
          700: "#344a68",
          800: "#2c3f57",
          900: "#152238",
          950: "#0b1424",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgb(11 20 36 / 0.02)",
        "card-dark": "0 1px 2px rgb(0 0 0 / 0.4), 0 4px 16px rgb(0 0 0 / 0.35)",
      },
      borderRadius: {
        xl: "1rem",
      },
    },
  },
  plugins: [],
};
export default config;
