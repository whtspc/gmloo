import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Eén losse index.html als resultaat: makkelijk te hosten en te delen.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: { target: 'es2020', chunkSizeWarningLimit: 4000, assetsInlineLimit: 100000000 },
});
