import { defineConfig } from 'vitest/config';

// GitHub Pages sirve el sitio en https://davidaguayov.github.io/pizarra/
export default defineConfig({
  base: '/pizarra/',
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
});
