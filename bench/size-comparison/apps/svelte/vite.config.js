import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({ root: import.meta.dirname, base: './', plugins: [svelte()], build: { outDir: '../../out/svelte', emptyOutDir: true }, logLevel: 'warn' });
