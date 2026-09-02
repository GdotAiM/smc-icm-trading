import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  root: ".",
  publicDir: "public",
  server: {
    port: 5173,
    fs: {
      allow: [resolve(__dirname, "..")],
    },
  },
});
