import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rail: "#090B0A",
        amber: "#FFB000",
        vermilion: "#FF4F2E",
        lime: "#B6FF3B",
        cyan: "#00D1C1",
        cobalt: "#2454FF",
        concrete: "#E7E1D4",
        paper: "#F8F4EA",
        graphite: "#2B3032",
        signalwhite: "#F8FFF4",
        violet: "#7B4DFF",
        track: "#6F7772",
      },
      fontFamily: {
        head: ["var(--font-bebas)", "sans-serif"],
        body: ["var(--font-atkinson)", "sans-serif"],
        mono: ["var(--font-share)", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
