import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 关键：把 /api 代理到后端，让浏览器视角「同源」。
      // 不这么做的话，refresh token 的 httpOnly Cookie 在跨端口时带不上，
      // 而且还要处理 CORS 预检。
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
