import { execSync } from 'node:child_process';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Byggmetadata som visas i UI:t (version + byggdatum). I GitHub Actions finns
// GITHUB_SHA; lokalt läses kort commit-SHA via git. Faller tillbaka på 'dev'.
function buildSha(): string {
  const envSha = process.env.GITHUB_SHA;
  if (envSha) return envSha.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'dev'; }
}
const BUILD_SHA = buildSha();
const BUILD_DATE = new Date().toISOString();

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
    // OBS: Ingen GEMINI_API_KEY bäddas in längre. OCR-skanningen använder
    // användarens EGNA lokalt sparade nyckel (samma som AI-chatten) — inget
    // hemligt läcker via den publika bundeln och varje användare har sin kvot.
    define: {
      __APP_VERSION__: JSON.stringify(BUILD_SHA),
      __BUILD_DATE__: JSON.stringify(BUILD_DATE),
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
