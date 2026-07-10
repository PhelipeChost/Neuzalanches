import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: proxy /api → backend (porta 3002 por padrão; MERCADO_API pra apontar outra)
const alvoApi = process.env.MERCADO_API || "http://localhost:3002";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": { target: alvoApi, changeOrigin: true },
    },
  },
});
