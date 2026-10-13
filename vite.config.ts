import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fastpixStartup } from "./vite-plugins/fastpix-startup";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), fastpixStartup()],
  build: {
    // Our demo app + FastPix player bundle is intentionally a bit heavy.
    // Bump the warning limit and split vendor code into its own chunk.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
        },
      },
    },
  },
});
