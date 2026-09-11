import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { main: 'src/main.ts', preload: 'src/preload.ts' },
    format: 'cjs',
    target: 'node20',
    clean: true,
    external: ['electron'],
    outExtension: () => ({ js: '.cjs' }),
  },
])
