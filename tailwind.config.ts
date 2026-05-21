import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#1a3a5c",
          dark: "#13293f",
          light: "#2c5580",
        },
      },
      fontFamily: {
        sans: ['"Noto Sans JP"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
