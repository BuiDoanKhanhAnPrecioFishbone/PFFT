import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  // Root is src/ui so that assets are resolved relative to the UI source.
  root: path.resolve(__dirname, 'src/ui'),
  build: {
    // Output to plugin/ root so Figma can find ui.html next to manifest.json.
    outDir: path.resolve(__dirname),
    emptyOutDir: false,
    // Figma plugin iframes run in sandbox="allow-scripts" — ES modules are NOT
    // supported. IIFE format inlines everything into a plain <script> with no
    // type="module", which works in Figma's sandboxed environment.
    target: 'es2017',
    rollupOptions: {
      input: path.resolve(__dirname, 'src/ui/ui.html'),
      output: {
        format: 'iife',
        name: 'PluginUI',
      },
    },
  },
});
