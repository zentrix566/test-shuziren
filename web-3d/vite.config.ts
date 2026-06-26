import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    // 开发期把 /api 转发到本地 TTS 中转后端（server.mjs）
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
});
