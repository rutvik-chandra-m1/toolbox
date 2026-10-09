import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// `vite build --mode native` produces the bundle that Capacitor wraps into the
// Android app. It has no service worker (the APK already ships every file) and
// goes to its own folder so it never clobbers the PWA build in `dist/`.
export default defineConfig(({ mode }) => {
  const native = mode === 'native';

  return {
    // Relative base: works from any URL, the Capacitor WebView and static hosts.
    base: './',
    plugins: [
      react(),
      tailwindcss(),
      ...(native
        ? []
        : [
            VitePWA({
              registerType: 'autoUpdate',
              includeAssets: ['icon.svg', 'apple-touch-icon.png'],
              manifest: {
                name: 'Toolbox',
                short_name: 'Toolbox',
                description: 'A personal collection of small offline tools.',
                start_url: './',
                scope: './',
                display: 'standalone',
                theme_color: '#4f46e5',
                background_color: '#f8fafc',
                icons: [
                  { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
                  { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
                  {
                    src: 'pwa-maskable-512x512.png',
                    sizes: '512x512',
                    type: 'image/png',
                    purpose: 'maskable',
                  },
                ],
              },
              workbox: {
                globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
                navigateFallback: 'index.html',
                cleanupOutdatedCaches: true,
              },
            }),
          ]),
    ],
    resolve: {
      alias: [
        { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
        // jsPDF lazily imports these three for features this app never calls
        // (jsPDF.html() and SVG images). Left alone they add ~380 KB of unused
        // chunks to the offline cache and the APK, including the old,
        // unmaintained html2canvas. Point it at the maintained fork we use and
        // stub the other two.
        { find: /^html2canvas$/, replacement: 'html2canvas-pro' },
        { find: /^(canvg|dompurify)$/, replacement: fileURLToPath(new URL('./scripts/empty-module.mjs', import.meta.url)) },
      ],
    },
    build: {
      outDir: native ? 'dist-android' : 'dist',
      emptyOutDir: true,
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
    },
  };
});
