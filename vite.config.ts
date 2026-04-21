import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: env.VITE_BASE_URL ?? (mode === 'production' ? '/Bokf-ring-/' : '/'),
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          name: 'Lokal Bokföring',
          short_name: 'Bokföring',
          description: 'Lokal dubbel bokföring i webbläsaren',
          theme_color: '#0f172a',
          background_color: '#f8fafc',
          display: 'standalone',
          scope: '/Bokf-ring-/',
          start_url: '/Bokf-ring-/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
          // Assets are content-hashed → safe to cache indefinitely
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          // Always fetch index.html from network when online
          navigateFallback: 'index.html',
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith('/Bokf-ring-/assets/'),
              handler: 'CacheFirst',
              options: {
                cacheName: 'assets',
                expiration: { maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY ?? env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
