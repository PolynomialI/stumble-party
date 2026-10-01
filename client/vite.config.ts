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

/**
 * `npm run build:html`: the whole client as one self-contained HTML file (script, styles and Rapier's
 * inline wasm) that runs straight from disk, without a web server.
 */
function singleFile(): Plugin {
  return {
    name: 'single-file',
    apply: 'build',
    enforce: 'post',
    generateBundle(_, bundle) {
      const page = bundle['index.html'];
      if (!page || page.type !== 'asset') this.error('index.html missing from the bundle');
      let html = String(page.source);
      for (const [name, file] of Object.entries(bundle)) {
        const ref = new RegExp(`<(script|link)\\b[^>]*"/${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>(</script>)?`);
        if (file.type === 'chunk') {
          // "</script" inside the code would end the element early.
          const code = file.code.replace(/<\/script/gi, '<\\/script');
          html = html.replace(ref, () => `<script type="module">${code}</script>`);
        } else if (name.endsWith('.css')) {
          html = html.replace(ref, () => `<style>${String(file.source)}</style>`);
        } else continue;
        delete bundle[name];
      }
      if (/\/assets\//.test(html)) this.error('single-file: something was not inlined');
      delete bundle['index.html'];
      this.emitFile({ type: 'asset', fileName: 'stumble-party.html', source: html });
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  return {
    plugins: [single ? singleFile() : rapierWasmFile()],
    server: { port: 5173, host: true },
    preview: { port: 4173, host: true },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: single ? 6000 : 1500,
      ...(single ? { outDir: '../play', emptyOutDir: true } : {}),
    },
  };
});
