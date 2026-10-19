import { defineConfig } from 'vite';

export default defineConfig({ root: import.meta.dirname, base: './', build: { outDir: '../../out/shoelace', emptyOutDir: true }, logLevel: 'warn' });
