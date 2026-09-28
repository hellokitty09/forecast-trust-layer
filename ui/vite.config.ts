import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// API runs on :8000 (`make api`); proxy /v1 so the UI never hard-codes a host.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    allowedHosts: true,
    proxy: { "/v1": { target: process.env.FTL_API ?? "http://localhost:8000", changeOrigin: true } },
  },
});
