import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // In local dev, `netlify dev` normally serves functions on :8888 and
      // proxies the Vite dev server itself. This fallback lets `vite` alone
      // (without the Netlify CLI) still resolve /.netlify/functions/* to a
      // local function runner if one is added later; harmless if unused.
      "/.netlify/functions": {
        target: "http://localhost:9999",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
