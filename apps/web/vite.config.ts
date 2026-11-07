import tailwindcss from '@tailwindcss/vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), tanstackStart(), react()],
  resolve: {
    // `@/` is the shadcn alias used by the Better Auth UI components.
    tsconfigPaths: true,
    alias: { 'use-sync-external-store/shim/index.js': 'react' },
  },
});
