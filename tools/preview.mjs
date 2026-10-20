// Dev tool: renders every pose to a contact sheet so the art can be checked.
//   node --experimental-strip-types tools/preview.mjs <out-dir> [pixels] [skins,comma,separated]
// Writes one PPM per frame (terminal pixel art on a dark background) into <out-dir>,
// and sheet.html: every frame as the SVG the desktop app draws, on the app's background.
// Not part of the mod: Claude Code never loads it.
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MOODS, SKIN_IDS, pixelsFor, svgFor } from '../hooks/art.ts'

const out = process.argv[2]
const n = Number(process.argv[3] ?? 40)
const skins = (process.argv[4] ?? SKIN_IDS.join(',')).split(',')
if (!out) throw new Error('usage: preview.mjs <out-dir> [pixels] [skins]')
mkdirSync(out, { recursive: true })

const BG = [30, 30, 36]
let rows = ''
for (const skin of skins) {
  let cells = ''
  for (const mood of MOODS) {
    for (const variant of [0, 1]) {
      const px = pixelsFor(skin, mood, variant, n)
      const body = Buffer.alloc(n * n * 3)
      for (let i = 0; i < n * n; i++) {
        const solid = px[i * 4 + 3] > 0
        body[i * 3] = solid ? px[i * 4] : BG[0]
        body[i * 3 + 1] = solid ? px[i * 4 + 1] : BG[1]
        body[i * 3 + 2] = solid ? px[i * 4 + 2] : BG[2]
      }
      writeFileSync(join(out, `${skin}_${mood}_${variant}.ppm`), Buffer.concat([Buffer.from(`P6\n${n} ${n}\n255\n`), body]))
      const svg = svgFor(skin, mood, variant, 120)
      cells += `<figure><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"><figcaption>${mood} ${variant}</figcaption></figure>`
    }
  }
  rows += `<h2>${skin}</h2><div class="row">${cells}</div>`
}
writeFileSync(
  join(out, 'sheet.html'),
  `<!doctype html><meta charset="utf-8"><title>desk-buddy sheet</title><style>
body{background:#151515;color:#888;font:12px system-ui;margin:16px}
h2{font-size:13px;margin:12px 0 4px}.row{display:flex;flex-wrap:wrap;gap:4px}
figure{margin:0;text-align:center}img{width:120px;height:120px;display:block}
</style>${rows}`,
)
console.log('frames and sheet.html written to', out)
