/** @type {import("tailwindcss").Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "../../apps/dashboard/src/**/*.{ts,tsx}", "../../apps/dashboard/index.html"],
  theme: {
    extend: {
      colors: {
        ink: "var(--color-ink)",
        paper: "var(--color-paper)",
        gold: "var(--color-gold)",
        forest: "var(--color-forest)",
        brick: "var(--color-brick)",
        slate: "var(--color-slate)",
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
        mono: "var(--font-mono)",
      },
    },
  },
  plugins: [],
};
