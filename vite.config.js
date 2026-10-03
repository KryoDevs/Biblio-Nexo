import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    target: 'esnext',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        escaneo: resolve(__dirname, 'escaneo-remoto.html'),
        privacidad: resolve(__dirname, 'privacidad.html'),
        error404: resolve(__dirname, '404.html')
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // 'script' genera un archivo externo para registrar el SW en vez de un
      // script en línea — necesario porque el CSP de index.html tiene
      // script-src 'self' que bloquea scripts inline (fix crítico #2).
      injectRegister: 'script',
      // La aplicación usa /manifest.json desde index.html y los headers de Vercel.
      // Esta opción va al nivel del plugin, no dentro del contenido del manifest.
      manifestFilename: 'manifest.json',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf}'],
        // Excluir rutas de supabase si las hubiera, aunque el SW usualmente solo intercepta get
        navigateFallback: 'index.html',
      },
      manifest: {
        name: "BiblioNexo — Biblioteca Municipal de Futrono",
        short_name: "BiblioNexo",
        description: "Sistema de gestión de préstamos de la Biblioteca Pública Municipal de Futrono.",
        id: "/index.html",
        start_url: "/index.html",
        scope: "/",
        display: "standalone",
        lang: "es-CL",
        dir: "ltr",
        background_color: "#F7F4EB",
        theme_color: "#7A431D",
        icons: [
          {
            src: "/icono-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any"
          },
          {
            src: "/icono-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any"
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.js']
  }
});
