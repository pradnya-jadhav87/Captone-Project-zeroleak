import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Allow the ngrok tunnel host (and any future tunnel hosts) through
      // Vite's dev-server host check.
      allowedHosts: ['.ngrok-free.dev', '.ngrok-free.app'],
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: false,
      watch: {
        ignored: [
          '**/zeroleak_data.sqlite*',
          '**/*.sqlite*',
          '**/*.log',
          '**/server/**',
          '**/uploads/**',
          '**/temp/**',
          '**/storage/**',
          '**/local_documents/**',
          '**/generated_papers/**',
          '**/paper_figures/**',
          '**/published_figures/**',
          '**/.user_uploaded/**',
          '**/electron/**',
          '**/scripts/**',
          '**/tests/**',
          '**/.gemini/**',
          '**/node_modules/**',
          '**/.git/**',
        ],
      },
    },
  };
});
