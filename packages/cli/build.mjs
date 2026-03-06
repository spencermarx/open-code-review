import { readFileSync } from 'node:fs'
import { build } from 'esbuild'

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'))

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile: 'dist/index.js',
  minify: false,
  external: ['sql.js'],
  banner: {
    js: [
      '#!/usr/bin/env node',
      'import { createRequire as _cjsReq } from "module"; const require = _cjsReq(import.meta.url);',
    ].join('\n'),
  },
  define: { __CLI_VERSION__: JSON.stringify(version) },
  tsconfig: 'tsconfig.json',
})
