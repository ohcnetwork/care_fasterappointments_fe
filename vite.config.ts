import federation from "@originjs/vite-plugin-federation";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    federation({
      name: "care_fasterappointments",
      filename: "remoteEntry.js",
      exposes: { "./manifest": "./src/manifest.tsx" },
      shared: [
        "react",
        "react-dom",
        "react-i18next",
        "@tanstack/react-query",
        "raviger",
        "sonner",
      ],
    }),
    react(),
  ],
  build: {
    target: "esnext",
    minify: true,
    cssCodeSplit: false,
    // Preload helper resolves chunk URLs against the host origin and 404s for remotes.
    modulePreload: false,
    rollupOptions: {
      input: { main: "./index.html" },
      output: { format: "esm" },
    },
  },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  preview: {
    port: 10126,
    host: "0.0.0.0",
    cors: true,
    allowedHosts: true,
  },
});
