import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME } from './src/config/app';
import { color } from './src/theme/tokens';

export default defineConfig({
  plugins: [
    react(),
    // PWA: installable app shell. Only the static build output is precached; API responses and
    // uploads are never cached by the service worker (customer data, prices, auth). See docs/pwa.md.
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        id: '/',
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: APP_DESCRIPTION,
        lang: 'de',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: color.brand,
        background_color: color.background,
        categories: ['business', 'productivity'],
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Only the latin subsets of the font are precached; other subsets load on demand.
        globIgnores: ['**/*cyrillic*', '**/*vietnamese*'],
        navigateFallback: '/index.html',
        // Server routes that must always hit the network (API, uploaded files).
        navigateFallbackDenylist: [/^\/api\//, /^\/uploads\//],
        cleanupOutdatedCaches: true,
        // No runtimeCaching on purpose: authenticated API data must not end up in a shared cache.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
  },
});
