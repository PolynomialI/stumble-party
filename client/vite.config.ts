import { defineConfig, type Plugin } from 'vite';

/**
 * Rapier's "compat" build inlines its WebAssembly as base64 (4.3 MB of JS). Production builds load the
 * package's own .wasm file instead: about 0.5 MB less to download, compiled while it streams in, and kept
 * compiled in the browser's code cache for the next visit (a big win on Chromebooks). Dev keeps the inline copy.
 */
function rapierWasmFile(): Plugin {
  const inline = /\{module_or_path:[\w$]+\.toByteArray\("AGFzbQ[A-Za-z0-9+/=]*"\)(?:\.buffer)?\}/;
  return {
    name: 'rapier-wasm-file',
    apply: 'build',
    enforce: 'pre',
    transform(code, id) {
      if (!/rapier3d-compat[\\/]dist[\\/]rapier\.mjs$/.test(id)) return null;
      if (!inline.test(code)) this.error('inline Rapier wasm not found: check this plugin against the Rapier version');
      return { code: `import __rapierWasm from "./rapier_wasm3d_bg.wasm?url";\n${code.replace(inline, '{module_or_path:__rapierWasm}')}`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [rapierWasmFile()],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
});
