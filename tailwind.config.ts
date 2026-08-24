import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#12100E",
        clay: "#B4552D",
        trail: "#2F5D50",
        sand: "#F4EFE7",
      },
    },
  },
  plugins: [],
} satisfies Config;
