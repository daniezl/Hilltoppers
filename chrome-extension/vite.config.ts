import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { removeFirebaseRemoteCode } from './vite-plugin-remove-firebase-remote-code';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react(), removeFirebaseRemoteCode()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: path.resolve(rootDir, 'popup.html'),
        options: path.resolve(rootDir, 'options.html'),
        classSettings: path.resolve(rootDir, 'class-settings.html'),
        login: path.resolve(rootDir, 'login.html'),
        background: path.resolve(rootDir, 'src/background/background.ts')
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') {
            return 'background.js';
          }
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name].[hash].js',
        assetFileNames: 'assets/[name].[hash][extname]',
        // Ensure all code is inlined, no external scripts
        inlineDynamicImports: false,
        manualChunks: undefined
      }
    },
    // Target modern browsers for better compatibility
    target: 'esnext',
    minify: 'esbuild'
  },
  // Ensure all dependencies are bundled
  resolve: {
    alias: {
      // Prevent Firebase from trying to load external scripts
      '@firebase/app': '@firebase/app',
      '@firebase/auth': '@firebase/auth',
      '@firebase/firestore': '@firebase/firestore'
    }
  }
});
