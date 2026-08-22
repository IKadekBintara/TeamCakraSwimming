import type { Config } from "tailwindcss";

/**
 * TEAM CAKRA SWIMMING — Design Tokens
 * Aquatic teal-emerald accent + deep navy surfaces. Single source of truth;
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
        // Aquatic accent — shifted from pure emerald toward pool-water teal,
        // still recognizably the same brand as the existing UI.
        brand: {
          50: "#ecfdf7",
          100: "#d0fae9",
          200: "#a4f3d6",
          300: "#5fe8bd",
          400: "#2dd4a8",
          500: "#12b886",
          600: "#0d9670",
          700: "#0c785e",
          800: "#0e5f4d",
          900: "#0f4e40",
          950: "#032e26",
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
        card: "0 1px 2px rgb(11 20 36 / 0.06), 0 4px 16px rgb(11 20 36 / 0.06)",
        "card-dark": "0 1px 2px rgb(0 0 0 / 0.4), 0 4px 16px rgb(0 0 0 / 0.35)",
      },
      borderRadius: {
        xl: "0.875rem",
      },
    },
  },
  plugins: [],
};
export default config;
