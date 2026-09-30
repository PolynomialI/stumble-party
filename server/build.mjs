// Bundles the server (and the TS-source @sp/shared workspace) into dist/index.js.
// Every other bare import stays external and is resolved from node_modules at runtime.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  plugins: [
    {
      name: 'externalize-deps',
      setup(b) {
        b.onResolve({ filter: /^[^./]/ }, (args) =>
          args.path.startsWith('@sp/shared') ? undefined : { external: true },
        );
      },
    },
  ],
});
console.log('[server] built dist/index.js');
