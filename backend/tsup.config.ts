import { defineConfig } from 'tsup';
// @order-desk/shared ships TypeScript source, so bundle it into the output.
export default defineConfig({
  entry: ['src/server.ts', 'src/scripts/indexes.ts', 'src/scripts/seed.ts'],
  format: ['esm'], target: 'node20', outDir: 'dist', clean: true, sourcemap: true,
  noExternal: ['@order-desk/shared'],
});
