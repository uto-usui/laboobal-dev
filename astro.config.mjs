import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://labobal.dev',
  trailingSlash: 'always',
  build: { format: 'directory' },
  compressHTML: true,
  prerenderConflictBehavior: 'error',
})
