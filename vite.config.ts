import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  // libauth usa top-level await: o pre-bundle do dev-mode precisa de target
  // moderno (o esbuild.target acima não se aplica ao optimizeDeps).
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
  server: {
    port: 3000,
    host: true,
  },
  esbuild: {
    target: 'esnext',
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          libauth: ['@bitauth/libauth'],
        },
      },
    },
  },
});
