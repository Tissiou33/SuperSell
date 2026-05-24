export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#1a3c5e", light: "#2a5a8e", dark: "#0f2540" },
        accent: "#2ecc71",
        warning: "#f39c12",
        danger: "#e74c3c",
      },
    },
  },
  plugins: [],
};
