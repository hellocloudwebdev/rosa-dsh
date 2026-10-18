import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import path from "node:path";

const API_PORT = Number(process.env.ROSA_API_PORT ?? 8787);

// The app is a Vite SPA. `rosa-server` (server/) provides the API layer and is
// proxied during local development; in production the same handler runs as a
// Vercel Function or Cloudflare Pages Function.
export default defineConfig({
  plugins: [
    react(),
    {
      name: "rosa:tailwind-inline",
      configResolved(config) {
        // Tailwind is applied through postcss.config.js; this plugin only
        // guarantees the watcher picks up config changes reliably.
        void config;
        void tailwindcss;
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@shared": path.resolve(import.meta.dirname, "./shared"),
    },
  },
  server: {
    port: 5173,
    host: process.env.ROSA_DEV_HOST || undefined,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (
              id.includes("react-markdown") ||
              id.includes("katex") ||
              id.includes("highlight.js") ||
              id.includes("remark") ||
              id.includes("rehype") ||
              id.includes("mdast") ||
              id.includes("micromark") ||
              id.includes("unified") ||
              id.includes("prop-types") ||
              id.includes("vfile")
            ) {
              return "markdown";
            }
            if (id.includes("@clerk")) {
              return "clerk";
            }
            if (id.includes("@radix-ui")) {
              return "radix-ui";
            }
            if (id.includes("lucide-react")) {
              return "icons";
            }
            if (id.includes("react") || id.includes("scheduler") || id.includes("framer-motion")) {
              return "react-vendor";
            }
          }
          return undefined;
        },
      },
    },
  },
});
