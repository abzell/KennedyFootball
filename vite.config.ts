import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'apple-touch-icon-coach.png'],
      // The two app manifests are static files in public/ (see index.html), not generated here.
      manifest: false,
      workbox: {
        // Cache the app shell only. API calls are never cached: scoring always hits the network.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        // Helmet images are cached the first time each one is shown rather than all up front.
        globIgnores: ['**/helmets/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/helmets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'helmets', expiration: { maxEntries: 80 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8788' },
  },
});
