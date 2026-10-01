import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4173/pizarra/' },
  webServer: { command: 'npm run build && npm run preview -- --port 4173', url: 'http://localhost:4173/pizarra/', reuseExistingServer: true },
});
