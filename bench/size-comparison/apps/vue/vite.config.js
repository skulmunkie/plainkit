import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({ root: import.meta.dirname, base: './', plugins: [vue()], build: { outDir: '../../out/vue', emptyOutDir: true }, logLevel: 'warn' });
