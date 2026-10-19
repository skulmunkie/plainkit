import { defineConfig } from 'vite';

export default defineConfig({ root: import.meta.dirname, base: './', build: { outDir: '../../out/lit', emptyOutDir: true }, logLevel: 'warn' });
