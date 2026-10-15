/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic tokens — resolved from CSS variables at runtime so a single
        // set of utility classes works in both light and dark themes.
        surface: {
          app: "var(--bg-app)",
          panel: "var(--bg-panel)",
          raised: "var(--bg-panel-2)",
          sunken: "var(--bg-panel-2)",
        },
        line: {
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        ink: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          inverse: "var(--text-inverse)",
        },
        brand: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          soft: "var(--accent-soft)",
          text: "var(--accent-text)",
        },
        state: {
          ok: "var(--ok)",
          warn: "var(--warn)",
          danger: "var(--danger)",
          info: "var(--info)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "'Segoe UI'",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "'SF Mono'",
          "Menlo",
          "Consolas",
          "'Liberation Mono'",
          "monospace",
        ],
      },
      boxShadow: {
        subtle: "0 1px 2px 0 rgba(0, 0, 0, 0.04)",
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px -1px rgba(0, 0, 0, 0.04)",
        popover: "0 10px 38px -10px rgba(0, 0, 0, 0.18), 0 10px 20px -15px rgba(0, 0, 0, 0.12)",
      },
      borderRadius: {
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
      },
      transitionTimingFunction: {
        swift: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};
