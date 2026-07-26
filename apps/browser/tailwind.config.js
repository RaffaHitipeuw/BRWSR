/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#1B2430",
        paper: "#F6F3EC",
        gold: "#C8932B",
        forest: "#3F7D58",
        brick: "#B3492F",
        slate: "#4A6FA5",
      },
    },
  },
  plugins: [],
};
