import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const audio = await readFile(new URL('assets/time-stop-v2.wav', root))
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('src/adapter.ts', root))],
  bundle: true,
  write: false,
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  globalName: 'TimeStopTheme',
  minify: true,
  legalComments: 'inline',
  define: {
    DSH_AUDIO_URL: JSON.stringify(`data:audio/wav;base64,${audio.toString('base64')}`),
  },
})

const bundled = outputFiles[0].text
const code = `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;\n${bundled}\nmodule.exports={inject:['slots','theme'],apply(ctx){TimeStopTheme.install(ctx,ctx.get('theme'),require)}};return module.exports;}});\n`
await mkdir(new URL('lib/', root), { recursive: true })
await writeFile(new URL('lib/client.js', root), code)
console.log(JSON.stringify({
  bytes: Buffer.byteLength(code),
  sha256: createHash('sha256').update(code).digest('hex'),
}))
