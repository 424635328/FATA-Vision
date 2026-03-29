import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#08111d",
        panel: "#102033",
        accent: "#f97316",
        accentSoft: "#22d3ee",
        sand: "#f6ede1"
      },
      boxShadow: {
        glow: "0 24px 80px rgba(8, 17, 29, 0.45)"
      }
    }
  },
  plugins: []
};

export default config;
