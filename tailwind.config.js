/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#F8F7F4",
        surface: "#FFFFFF",
        subtle: "#F2F0EB",
        ink: {
          DEFAULT: "#14171A",
          secondary: "#4B5563",
          muted: "#6B7280",
        },
        line: {
          DEFAULT: "#E2E5E9",
          strong: "#CBD2D9",
        },
        emerald: "#059669",
        amber: "#D97706",
        rose: "#E11D48",
        blue: "#2563EB",
      },
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["\"Geist Mono\"", "ui-monospace", "monospace"],
      },
      transitionTimingFunction: {
        emphasis: "cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
};
