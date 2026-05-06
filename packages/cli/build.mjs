import { readFileSync, cpSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'
import { build } from 'esbuild'

const { version } = JSON.parse(readFileSync('package.json', 'utf-8'))

const cjsBanner = 'import { createRequire as _cjsReq } from "module"; const require = _cjsReq(import.meta.url);'

// Main CLI entry point
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
    js: ['#!/usr/bin/env node', cjsBanner].join('\n'),
  },
  define: { __CLI_VERSION__: JSON.stringify(version) },
  tsconfig: 'tsconfig.json',
})

// Shared library subpath exports.
//
// Each of these is consumed by @open-code-review/dashboard via its
// own esbuild bundling. Library bundles must NOT carry the `cjsBanner`
// — the dashboard bundle adds its own banner once at the top, and
// duplicating the `_cjsReq` declaration via repeated banners across
// inlined subpath bundles produces a `SyntaxError: Identifier
// '_cjsReq' has already been declared` at runtime. The library code
// constructs its own `createRequire` inline (e.g. `db/index.ts`
// `locateWasm`), so no module-scope `require` is needed here.
const libraryBundle = (entryPoint, outfile, externals = []) => ({
  entryPoints: [entryPoint],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  minify: false,
  external: externals,
  tsconfig: 'tsconfig.json',
})

await build(libraryBundle('src/lib/db/index.ts', 'dist/lib/db/index.js', ['sql.js']))
await build(libraryBundle('src/lib/runtime-config.ts', 'dist/lib/runtime-config.js'))
// `yaml` is CommonJS-published, and inlining it via esbuild emits a
// `require()` call that fails when the consuming dashboard server is
// loaded in dev mode (tsx watch, no `createRequire` banner). Keeping it
// external means node's ESM resolver picks the package's own entry point
// at runtime — works in both dev mode and production-bundled mode.
await build(libraryBundle('src/lib/team-config.ts', 'dist/lib/team-config.js', ['yaml']))
await build(libraryBundle('src/lib/models.ts', 'dist/lib/models.js'))
await build(libraryBundle('src/lib/vendor-resume.ts', 'dist/lib/vendor-resume.js'))

// Copy dashboard dist into CLI dist (cross-platform, replaces Unix-only cp -r)
const dashboardSrc = resolve('..', 'dashboard', 'dist')
const dashboardDest = resolve('dist', 'dashboard')
rmSync(dashboardDest, { recursive: true, force: true })
cpSync(dashboardSrc, dashboardDest, { recursive: true })
