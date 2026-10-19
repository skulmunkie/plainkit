import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ root: import.meta.dirname, base: './', plugins: [react()], build: { outDir: '../../out/react', emptyOutDir: true }, logLevel: 'warn' });
