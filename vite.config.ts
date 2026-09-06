import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { outDir: 'dist', chunkSizeWarningLimit: 1500, rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } } } });
