import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/**
 * Writes the hand-written service worker (sw/sw.js) into the build as /sw.js, with the list of files to
 * precache (the built bundle plus public/) and a version that changes whenever any of them does.
 */
function serviceWorkerPlugin(): Plugin {
  return {
    name: 'tickdone-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const publicDir = new URL('./public/', import.meta.url)
      // Pages config files (_headers, _redirects) and dotfiles are not served
      const publicFiles = readdirSync(publicDir, { recursive: true, encoding: 'utf8' })
        .filter((p) => statSync(new URL(p, publicDir)).isFile() && !/(^|\/)[_.]/.test(p))
        .map((p) => '/' + p)
      const built = Object.keys(bundle)
        .filter((f) => !f.endsWith('.map'))
        .map((f) => '/' + f)
      const files = [...new Set([...built, ...publicFiles])].sort()
      const src = readFileSync(new URL('./sw/sw.js', import.meta.url), 'utf8')
      const hash = createHash('sha256').update(src)
      for (const f of files) {
        hash.update(f)
        const out = bundle[f.slice(1)]
        if (out) hash.update(out.type === 'chunk' ? out.code : typeof out.source === 'string' ? out.source : Buffer.from(out.source))
        else hash.update(readFileSync(new URL('./public' + f, import.meta.url)))
      }
      const version = hash.digest('hex').slice(0, 12)
      const code = src.replace("const VERSION = '__VERSION__'", `const VERSION = '${version}'`).replace('const PRECACHE = []', `const PRECACHE = ${JSON.stringify(files)}`)
      if (code === src) this.error('sw/sw.js: the VERSION and PRECACHE placeholders are missing')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: code })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), serviceWorkerPlugin()],
  // The app version shown in Settings > About comes from package.json
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
})
