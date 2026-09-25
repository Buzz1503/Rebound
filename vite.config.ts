import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub project Pages serve from /<repo>/ (case-sensitive). CI passes VITE_BASE.
const base = process.env.VITE_BASE ?? '/Rebound/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered in src/pwa.ts
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'splash/*.png'],
      manifest: {
        name: 'Rebound',
        short_name: 'Rebound',
        description: 'Rehab and strength training. Not medical advice.',
        lang: 'en-AU',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0a0c0f',
        background_color: '#0a0c0f',
        categories: ['health', 'fitness'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the app needs is precached so it works in airplane mode.
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        globIgnores: ['splash/**'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/splash/'),
            handler: 'CacheFirst',
            options: { cacheName: 'splash', expiration: { maxEntries: 12 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    // recharts (~150 kB gzipped) is split out and only loads with Rehab and Progress.
    chunkSizeWarningLimit: 600,
  },
})
