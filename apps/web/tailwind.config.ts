import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f17",
        panel: "#121826",
        edge: "#1f2a3d",
        accent: "#fbbf24",
      },
    },
  },
  plugins: [],
} satisfies Config;
