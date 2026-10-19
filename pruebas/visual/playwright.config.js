import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig({
  testDir: '.',
  // Vitest conserva sus pruebas unitarias; este sufijo requiere navegador real.
  testMatch: '*.pw.js',
  outputDir: '../../.arena/pruebas-visuales',
  fullyParallel: true,
  workers: 2,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    browserName: 'chromium',
    viewport: { width: 393, height: 740 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    // Permite usar un Chromium preinstalado en entornos sin descarga de binarios.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    } : {}
  },
  webServer: {
    command: 'npm run preview -- --host 0.0.0.0 --port 4173 --strictPort',
    cwd: raiz,
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI
  }
});
