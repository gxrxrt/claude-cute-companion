// Original chibi mascot, drawn from shapes. Pure functions: no `$`, no I/O.
// One shape list feeds two renderers:
//   svgFor()   -> an SVG document (Desktop app, VS Code)
//   cellsFor() -> packed terminal cells for a Raster (half-block pixel art)

export type Mood =
  | 'idle' | 'typing' | 'attention' | 'happy' | 'oops'
  // what Claude is busy with, by tool
  | 'reading' | 'searching' | 'writing' | 'terminal' | 'web' | 'agent' | 'compact'
  // life between turns
  | 'sleep' | 'wake' | 'yawn' | 'stretch' | 'sip' | 'look'
  // a skin's own way to finish a turn: Opus smug, Sonnet dancing
  | 'smug' | 'dance'
export type Skin = 'opus' | 'sonnet' | 'haiku' | 'fable' | 'mythos'
export type Pt = [number, number]

export const MOODS: Mood[] = [
  'idle', 'typing', 'attention', 'happy', 'oops',
  'reading', 'searching', 'writing', 'terminal', 'web', 'agent', 'compact',
  'sleep', 'wake', 'yawn', 'stretch', 'sip', 'look', 'smug', 'dance',
]
export const SKIN_IDS: Skin[] = ['opus', 'sonnet', 'haiku', 'fable', 'mythos']

type Palette = {
  hair: string
  hairDark: string
  hairLight: string
  hoodie: string
  hoodieDark: string
  accent: string
  glow: string
  star: string
}

export const SKINS: Record<Skin, Palette> = {
  opus: {
    hair: '#F28C28', hairDark: '#C9650F', hairLight: '#FFB95E',
    hoodie: '#7A4E3C', hoodieDark: '#573528', accent: '#E8503A',
    glow: '#FFD479', star: '#FFE066',
  },
  sonnet: {
    hair: '#2FB5A8', hairDark: '#1F8A80', hairLight: '#7FE3D8',
    hoodie: '#2F3E6B', hoodieDark: '#222E52', accent: '#FF8FA3',
    glow: '#9CF3E8', star: '#FFE066',
  },
  haiku: {
    hair: '#F58FB8', hairDark: '#D2679A', hairLight: '#FFC3DA',
    hoodie: '#FFFFFF', hoodieDark: '#DDD8EE', accent: '#8FD3FF',
    glow: '#FFD1E6', star: '#FFFFFF',
  },
  fable: {
    hair: '#8E6BE8', hairDark: '#6747C2', hairLight: '#BBA2FF',
    hoodie: '#3B2A74', hoodieDark: '#2A1D55', accent: '#F2C14E',
    glow: '#D7C4FF', star: '#F2C14E',
  },
  mythos: {
    hair: '#3F44B5', hairDark: '#2A2E86', hairLight: '#7A80F0',
    hoodie: '#17171F', hoodieDark: '#0E0E14', accent: '#F2C14E',
    glow: '#58E1FF', star: '#F2C14E',
  },
}

export const SKIN_NAMES: Record<Skin, string> = {
  opus: 'Opus', sonnet: 'Sonnet', haiku: 'Haiku', fable: 'Fable', mythos: 'Mythos',
}

// Maps whatever `$.session.model()` returns to a skin.
export function skinOfModel(model: string): Skin {
  const m = model.toLowerCase()
  if (m.includes('mythos')) return 'mythos'
  if (m.includes('fable')) return 'fable'
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('sonnet')) return 'sonnet'
  return 'opus'
}

// ---------------------------------------------------------------- shapes

// `op` and `d` come only with `detail`, which the SVG asks for and the
// rasterizer never does.
type Shape =
  | { k: 'ell'; cx: number; cy: number; rx: number; ry: number; fill: string; op?: number }
  | { k: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: string }
  | { k: 'poly'; pts: Pt[]; fill: string }
  | { k: 'line'; a: Pt; b: Pt; w: number; fill: string }
  | { k: 'd'; d: string; dx: number; dy: number; fill: string; stroke?: string; w?: number; op?: number }

const SKIN_TONE = '#FFDCC4'
const SKIN_SHADE = '#F0B8A0'
const BLUSH = '#FF9DB0'
const INK = '#2B2233'
const WHITE = '#FFFFFF'
const MOUTH = '#B5435C'
const MOUTH_IN = '#7A2438'
const PANTS = '#3A3550'
const SHOE = '#F4F4FA'
const LID = '#BCC0CC'
const LID_DARK = '#8F94A6'
const DROP = '#7FD4FF'
const ALERT = '#FF6B6B'
const PAPER = '#FBF8F1'
const PAPER_LINE = '#C9C3D6'
const TERM = '#1E1E2A'
const TERM_GREEN = '#7CE38B'
const SEA = '#4FA3E0'
const LAND = '#6CCB7A'
const STEAM = '#DDE3EE'
const CUP = '#F4F4FA'
const TEA = '#B5703A'
const GLASSES = '#5A3A2A'
const NIGHTCAP = '#5B6BBF'
const PENCIL = '#F7C948'

class Canvas {
  shapes: Shape[] = []
  // Where the current part sits: `ox` sways the whole figure (a dance), `oy`
  // lifts the head and torso.
  ox = 0
  oy = 0
  ell(cx: number, cy: number, rx: number, ry: number, fill: string) {
    this.shapes.push({ k: 'ell', cx: cx + this.ox, cy: cy + this.oy, rx, ry, fill })
  }
  rect(x: number, y: number, w: number, h: number, r: number, fill: string) {
    this.shapes.push({ k: 'rect', x: x + this.ox, y: y + this.oy, w, h, r, fill })
  }
  poly(pts: Pt[], fill: string) {
    this.shapes.push({ k: 'poly', pts: pts.map(([x, y]) => [x + this.ox, y + this.oy] as Pt), fill })
  }
  line(a: Pt, b: Pt, w: number, fill: string) {
    this.shapes.push({ k: 'line', a: [a[0] + this.ox, a[1] + this.oy], b: [b[0] + this.ox, b[1] + this.oy], w, fill })
  }
  path(points: Pt[], w: number, fill: string) {
    for (let i = 0; i + 1 < points.length; i++) this.line(points[i]!, points[i + 1]!, w, fill)
  }
  // A ring drawn as a stroke, so both renderers can show it.
  ring(cx: number, cy: number, r: number, w: number, fill: string) {
    const pts: Pt[] = []
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
    this.path(pts, w, fill)
  }
  // SVG only: a see-through ellipse, and a raw path (stroked when `stroke` is set).
  soft(cx: number, cy: number, rx: number, ry: number, fill: string, op: number) {
    this.shapes.push({ k: 'ell', cx: cx + this.ox, cy: cy + this.oy, rx, ry, fill, op })
  }
  d(d: string, fill: string, more: { stroke?: string; w?: number; op?: number } = {}) {
    this.shapes.push({ k: 'd', d, dx: this.ox, dy: this.oy, fill, ...more })
  }
  star(cx: number, cy: number, r: number, fill: string) {
    const s = r * 0.3
    this.poly(
      [[cx, cy - r], [cx + s, cy - s], [cx + r, cy], [cx + s, cy + s],
       [cx, cy + r], [cx - s, cy + s], [cx - r, cy], [cx - s, cy - s]],
      fill,
    )
  }
}

// ---------------------------------------------------------------- the character

type Eyes = 'open' | 'down' | 'blink' | 'joy' | 'wide' | 'side' | 'smug' | 'squeeze'
type Mouth = 'smile' | 'o' | 'grin' | 'wobble' | 'flat' | 'smirk' | 'yawn'

// SVG only: what makes an open eye read as anime, over its dark base: an iris
// in her hair's color that glows at the bottom, a pupil, a second glint, and a
// lash line with a flick at the outer corner (`outer` is -1 left, 1 right).
function iris(c: Canvas, p: Palette, ex: number, ey: number, rx: number, ry: number, outer: number) {
  c.ell(ex, ey + ry * 0.18, rx * 0.74, ry * 0.68, p.hairDark)
  c.soft(ex, ey + ry * 0.5, rx * 0.5, ry * 0.26, p.hairLight, 0.85)
  c.ell(ex, ey + ry * 0.1, rx * 0.34, ry * 0.36, INK)
  c.soft(ex + rx * 0.38, ey + ry * 0.42, rx * 0.2, rx * 0.2, WHITE, 0.9)
  const side = ey - ry * 0.45
  const tip = ex + outer * rx * 1.15
  c.d(`M${f(ex - rx * 1.15)} ${f(side)} Q${f(ex)} ${f(ey - ry * 1.5)} ${f(ex + rx * 1.15)} ${f(side)}`, 'none', { stroke: INK, w: 0.85 })
  c.d(`M${f(tip)} ${f(side)} L${f(tip + outer * 0.9)} ${f(side - 0.8)}`, 'none', { stroke: INK, w: 0.7 })
}

// `detail` adds what only a smooth SVG shows well; the terminal's pixel art
// leaves it out. `night` puts her nightcap on.
export function buildShapes(skin: Skin, mood: Mood, variant: number, detail = false, night = false): Shape[] {
  const p = SKINS[skin]
  const v = variant ? 1 : 0
  const c = new Canvas()

  // What each mood does, in one place.
  let eyes: Eyes = 'open'
  let mouth: Mouth = 'smile'
  let headDy = 0
  if (mood === 'idle') eyes = v ? 'blink' : 'open'
  if (mood === 'typing' || mood === 'reading' || mood === 'writing') eyes = 'down'
  if (mood === 'attention') mouth = 'o'
  if (mood === 'happy') { eyes = 'joy'; mouth = 'grin'; headDy = v ? -1.4 : 0 }
  if (mood === 'oops') { eyes = 'wide'; mouth = 'wobble'; headDy = v ? 0.6 : 0 }
  if (mood === 'searching' || mood === 'look') eyes = 'side'
  if (mood === 'terminal') { eyes = 'down'; mouth = 'flat' }
  if (mood === 'web' || mood === 'agent') eyes = 'open'
  if (mood === 'compact') { eyes = 'squeeze'; mouth = 'wobble' }
  if (mood === 'sleep') { eyes = 'blink'; mouth = 'o'; headDy = v ? 1.8 : 1.2 }
  if (mood === 'wake') { eyes = 'wide'; mouth = 'o'; headDy = -0.8 }
  if (mood === 'yawn') { eyes = 'squeeze'; mouth = 'yawn'; headDy = -0.4 }
  if (mood === 'stretch') { eyes = 'joy'; mouth = 'o'; headDy = v ? -1 : -0.4 }
  if (mood === 'sip') eyes = v ? 'blink' : 'open'
  if (mood === 'smug') { eyes = 'smug'; mouth = 'smirk' }
  if (mood === 'dance') { eyes = 'joy'; mouth = 'grin'; headDy = v ? -0.8 : 0; c.ox = v ? 1.5 : -1.5 }

  // back hair + cat ears; Sonnet's side ponytail behind it all
  c.oy = headDy
  if (skin === 'sonnet') {
    // tied high at the side, falling down past her shoulder
    const sway = mood === 'dance' ? (v ? 2 : -1) : 0
    c.poly([[43, 8], [50, 7], [54.5, 12], [56 + sway, 21], [54 + sway, 30], [51 + sway, 24], [48, 14]], p.hair)
    c.poly([[49, 10], [53, 13], [54 + sway, 22], [52.4 + sway, 27], [51, 18]], p.hairDark)
    c.ell(46.4, 9.2, 2.2, 2, p.accent)
  }
  c.ell(32, 19, 16.5, 15.5, p.hairDark)
  c.poly([[19.5, 12], [21.5, 1.8], [29, 7.2]], p.hair)
  c.poly([[44.5, 12], [42.5, 1.8], [35, 7.2]], p.hair)
  c.poly([[21.8, 9.8], [22.5, 5], [26.2, 7.8]], BLUSH)
  c.poly([[42.2, 9.8], [41.5, 5], [37.8, 7.8]], BLUSH)
  c.rect(15.2, 17, 6.4, 18, 3.2, p.hair)
  c.rect(42.4, 17, 6.4, 18, 3.2, p.hair)
  if (detail) {
    // pointed tips on the side locks, a strand down each, fluff in the ears
    c.poly([[15.2, 33], [18.4, 38], [21.6, 33]], p.hair)
    c.poly([[42.4, 33], [45.6, 38], [48.8, 33]], p.hair)
    c.d('M18.6 19 Q17.4 27 18.4 36', 'none', { stroke: p.hairDark, w: 0.6, op: 0.7 })
    c.d('M45.4 19 Q46.6 27 45.6 36', 'none', { stroke: p.hairDark, w: 0.6, op: 0.7 })
    c.d('M23 9.4 L23.6 6.6 M24.4 9 L25.2 7.4', 'none', { stroke: WHITE, w: 0.4, op: 0.6 })
    c.d('M41 9.4 L40.4 6.6 M39.6 9 L38.8 7.4', 'none', { stroke: WHITE, w: 0.4, op: 0.6 })
  }
  c.oy = 0

  // legs, feet
  c.ell(19, 53, 9.5, 4.2, PANTS)
  c.ell(45, 53, 9.5, 4.2, PANTS)
  c.ell(27.5, 55.2, 4.2, 2.7, SHOE)
  c.ell(36.5, 55.2, 4.2, 2.7, SHOE)
  if (detail) {
    c.soft(17, 51.4, 4, 1.2, WHITE, 0.12)
    c.soft(47, 51.4, 4, 1.2, WHITE, 0.12)
    c.d('M23.6 56.4 Q27.5 58.4 31.4 56.4 M32.6 56.4 Q36.5 58.4 40.4 56.4', 'none', { stroke: LID_DARK, w: 0.6, op: 0.8 })
  }

  // torso (hoodie)
  c.oy = headDy * 0.5
  c.rect(21, 32, 22, 20, 7, p.hoodie)
  c.ell(32, 33.4, 9, 3.4, p.hoodieDark)
  c.line([29.4, 35], [29, 41], 0.9, p.accent)
  c.line([34.6, 35], [35, 41], 0.9, p.accent)
  c.oy = 0

  // head
  c.oy = headDy
  c.ell(32, 20, 13, 12, SKIN_TONE)
  c.ell(32, 30.2, 8, 1.6, SKIN_SHADE)
  if (detail) {
    c.soft(32, 13.5, 11.5, 4.5, SKIN_SHADE, 0.55) // shade under the bangs
    c.soft(32, 24.7, 0.45, 0.35, '#E0957F', 1) // nose
  }

  // eyes
  const eyeL: Pt = [26.4, 21.4]
  const eyeR: Pt = [37.6, 21.4]
  for (const [ex, ey] of [eyeL, eyeR]) {
    const outer = ex < 32 ? -1 : 1
    if (eyes === 'open') {
      c.ell(ex, ey, 2.3, 3.1, INK)
      if (detail) iris(c, p, ex, ey, 2.3, 3.1, outer)
      c.ell(ex - 0.8, ey - 1.1, 0.95, 1.1, WHITE)
    } else if (eyes === 'down') {
      const lx = v ? 0.5 : -0.5
      c.ell(ex + lx, ey + 1, 2.3, 2.6, INK)
      if (detail) iris(c, p, ex + lx, ey + 1, 2.3, 2.6, outer)
      c.ell(ex - 0.3 + lx, ey + 0.1, 0.9, 0.95, WHITE)
    } else if (eyes === 'wide') {
      c.ell(ex, ey, 2.8, 3.8, INK)
      if (detail) iris(c, p, ex, ey, 2.8, 3.8, outer)
      c.ell(ex - 0.9, ey - 1.4, 1.1, 1.3, WHITE)
      c.line([ex - 2.8, ey - 5.2 + (ex < 32 ? 0.8 : -0.8)], [ex + 2.8, ey - 5.2 + (ex < 32 ? -0.8 : 0.8)], 0.9, INK)
    } else if (eyes === 'side') {
      // looking to one side, then the other
      const lx = v ? 0.9 : -0.9
      c.ell(ex, ey, 2.3, 3.1, INK)
      if (detail) iris(c, p, ex + lx * 0.4, ey, 2.1, 2.9, outer)
      c.ell(ex + lx, ey - 1.1, 0.95, 1.1, WHITE)
    } else if (eyes === 'smug') {
      // half-lidded: the lower half of the eye under a heavy lid
      c.ell(ex, ey + 0.8, 2.3, 2.2, INK)
      if (detail) iris(c, p, ex, ey + 0.8, 2.2, 2, outer)
      c.line([ex - 2.6, ey - 0.6], [ex + 2.6, ey - 0.6], 1.4, INK)
      c.rect(ex - 2.6, ey - 3.6, 5.2, 2.9, 1, SKIN_TONE)
    } else if (eyes === 'squeeze') {
      // > <
      const d = outer < 0 ? 1 : -1
      c.path([[ex - 2 * d, ey - 1.6], [ex + 2 * d, ey + 0.2], [ex - 2 * d, ey + 2]], 1.2, INK)
    } else if (eyes === 'blink') {
      c.line([ex - 2.2, ey + 0.9], [ex + 2.2, ey + 0.9], 1.2, INK)
    } else {
      c.path([[ex - 2.3, ey + 1.4], [ex, ey - 1.2], [ex + 2.3, ey + 1.4]], 1.3, INK)
    }
  }
  if (detail) {
    // soft blush with the little hatching lines
    c.soft(23.2, 25.8, 3, 1.8, BLUSH, 0.6)
    c.soft(40.8, 25.8, 3, 1.8, BLUSH, 0.6)
    c.d('M22 26.6 L22.8 25.2 M23.4 26.6 L24.2 25.2 M40.6 26.6 L41.4 25.2 M42 26.6 L42.8 25.2', 'none', { stroke: '#F27D96', w: 0.35, op: 0.8 })
  } else {
    c.ell(23.2, 25.8, 2.7, 1.6, BLUSH)
    c.ell(40.8, 25.8, 2.7, 1.6, BLUSH)
  }

  // mouth
  if (mouth === 'smile') c.path([[29.6, 26.6], [32, 28.4], [34.4, 26.6]], 1.1, MOUTH)
  if (mouth === 'o') { c.ell(32, 27.5, 1.5, 1.9, MOUTH_IN) }
  if (mouth === 'grin') {
    c.ell(32, 27.2, 2.7, 2.2, MOUTH_IN)
    c.ell(32, 28.3, 1.5, 0.9, '#FF8A9E')
    if (detail) c.soft(32, 25.9, 1.7, 0.55, WHITE, 1)
  }
  if (mouth === 'wobble') c.path([[29.4, 27.8], [30.7, 26.6], [32, 27.8], [33.3, 26.6], [34.6, 27.8]], 1.1, MOUTH)
  if (mouth === 'flat') c.line([30.4, 27.4], [33.6, 27.4], 1.1, MOUTH)
  if (mouth === 'smirk') c.path([[29.8, 27.6], [32.6, 27.8], [34.8, 26.2]], 1.1, MOUTH)
  if (mouth === 'yawn') {
    c.ell(32, 27.6, 2.2, 2.8, MOUTH_IN)
    c.ell(32, 28.9, 1.3, 0.9, '#FF8A9E')
  }

  // bangs, shine, clip
  c.poly(
    [[18.4, 19], [19.6, 10.6], [25.5, 6], [32, 4.8], [38.5, 6], [44.4, 10.6], [45.6, 19],
     [42.4, 14.2], [39.2, 19.6], [35.6, 14], [32, 19.4], [28.4, 14], [24.8, 19.6], [21.6, 14.2]],
    p.hair,
  )
  if (detail) {
    // strands down the bangs, and a curl sticking up on top
    c.d(
      'M32 5.6 Q30.6 11 28.4 14 M32 5.6 Q33.4 11 35.6 14 M27.4 6.8 Q23.4 10 21.6 14.2 ' +
        'M36.6 6.8 Q40.6 10 42.4 14.2 M30 6 Q27 12 24.8 19.2 M34 6 Q37 12 39.2 19.2',
      'none',
      { stroke: p.hairDark, w: 0.5, op: 0.55 },
    )
    c.d('M31.4 5.4 Q29.6 2.4 33.4 1.4 Q31.4 3.2 32.8 5.2 Z', p.hair)
  }
  c.path([[24.5, 9.5], [28, 7.6], [31.5, 7]], 1.3, p.hairLight)
  if (detail) c.soft(29.4, 7.6, 0.7, 0.45, WHITE, 0.8)
  c.star(41.8, 11.4, 3.1, p.star)
  if (detail) c.soft(41.8, 11.4, 0.7, 0.7, WHITE, 0.9)

  // Opus reads through round glasses
  if (skin === 'opus') {
    for (const ex of [26.4, 37.6]) {
      c.ring(ex, 21.6, 3.9, 0.7, GLASSES)
      if (detail) c.soft(ex - 1.4, 20, 1.2, 0.7, WHITE, 0.35)
    }
    c.path([[30.3, 21], [32, 20.2], [33.7, 21]], 0.7, GLASSES)
    if (mood === 'smug' && v) c.star(41.6, 18.2, 1.8, WHITE)
  }

  // headphone band + cups
  const band: Pt[] = []
  for (let a = 196; a <= 344; a += 12) {
    const r = (a * Math.PI) / 180
    band.push([32 + 14.8 * Math.cos(r), 19 + 14.4 * Math.sin(r)])
  }
  c.path(band, 1.8, p.accent)
  c.ell(17.6, 21.5, 3.2, 4.6, p.accent)
  c.ell(46.4, 21.5, 3.2, 4.6, p.accent)
  c.ell(18.2, 21.5, 1.6, 3, p.hoodieDark)
  c.ell(45.8, 21.5, 1.6, 3, p.hoodieDark)
  if (detail) {
    // a glint on each cup and along the band
    c.soft(16.2, 19.2, 0.8, 1.4, WHITE, 0.35)
    c.soft(44.6, 19.2, 0.8, 1.4, WHITE, 0.35)
    const glint: string[] = []
    for (let a = 214; a <= 262; a += 12) {
      const r = (a * Math.PI) / 180
      glint.push(f(32 + 14.4 * Math.cos(r)) + ' ' + f(19 + 14 * Math.sin(r)))
    }
    c.d('M' + glint.join(' L'), 'none', { stroke: WHITE, w: 0.45, op: 0.35 })
  }

  // a floppy nightcap, late at night
  if (night) {
    c.poly([[19, 12], [23, 5], [32, 2.4], [41, 5], [45, 12], [32, 9]], NIGHTCAP)
    c.poly([[38, 4], [49, 5], [53, 12], [44, 9]], NIGHTCAP)
    c.path([[19.5, 11.6], [32, 8.6], [44.5, 11.6]], 1.6, WHITE)
    c.ell(53, 12.6, 2.2, 2.2, WHITE)
  }
  c.oy = 0

  // laptop, seen from behind
  const logo = mood === 'oops' ? ALERT : p.glow
  c.rect(17, 51, 30, 3, 1.5, LID_DARK)
  c.rect(19, 36, 26, 16, 2.6, LID)
  c.rect(19, 36, 26, 2.2, 1.1, LID_DARK)
  if (detail) {
    c.soft(32, 44.5, 6, 6, logo, 0.22)
    c.d('M21.2 38.9 H42.8', 'none', { stroke: WHITE, w: 0.35, op: 0.4 })
  }
  c.ell(32, 44.5, 2.6, 2.6, logo)
  if (detail) c.soft(31.3, 43.8, 0.8, 0.8, WHITE, 0.75)

  // arms and hands
  const sleeve = p.hoodie
  const hand = (x: number, y: number) => c.ell(x, y, 2.6, 2.5, SKIN_TONE)
  const arm = (from: Pt, to: Pt) => c.line(from, to, 5.2, sleeve)
  const shL: Pt = [24, 35]
  const shR: Pt = [40, 35]

  if (mood === 'typing') {
    const l: Pt = [27, 37.2 + (v ? 0 : 1)]
    const r: Pt = [37, 37.2 + (v ? 1 : 0)]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
    c.ell(v ? 24 : 40, 32.5, 0.9, 0.9, p.glow)
    c.ell(v ? 44 : 20, 30.5, 0.7, 0.7, p.glow)
  } else if (mood === 'attention') {
    const l: Pt = [26.5, 37.5]
    arm(shL, l); hand(l[0], l[1])
    const up: Pt = v ? [51.5, 21] : [49.5, 17.5]
    arm(shR, up); hand(up[0], up[1])
    c.ell(56, 8, 5.8, 5.8, INK)
    c.ell(56, 8, 5.1, 5.1, WHITE)
    c.line([56, 5], [56, 8.6], 1.4, INK)
    c.ell(56, 11, 0.9, 0.9, INK)
  } else if (mood === 'happy') {
    const l: Pt = v ? [13, 13.5] : [13.5, 17]
    const r: Pt = v ? [51, 13.5] : [50.5, 17]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
    c.star(v ? 8 : 55, v ? 26 : 9, 3.4, p.star)
    c.star(v ? 55 : 9, v ? 8 : 25, 2.6, WHITE)
    c.star(v ? 32 : 47, v ? 1.6 : 3, 2, p.star)
  } else if (mood === 'oops') {
    const l: Pt = [22.2, 28.5 + (v ? 1 : 0)]
    const r: Pt = [41.8, 28.5 + (v ? 1 : 0)]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
    const dy = v ? 4 : 0
    c.poly([[49, 8 + dy], [51.4, 12.6 + dy], [49, 14.4 + dy], [46.6, 12.6 + dy]], DROP)
    c.ell(49, 12.8 + dy, 2.4, 2.2, DROP)
  } else if (mood === 'reading') {
    // an open book held over the laptop, a page turning
    c.rect(20.6, 31.6, 22.8, 10, 1.4, p.accent)
    c.rect(21.6, 32.4, 10.2, 8.4, 0.8, PAPER)
    c.rect(32.2, 32.4, 10.2, 8.4, 0.8, PAPER)
    for (const y of [34.4, 36.4, 38.4]) {
      c.line([23, y], [30.4, y], 0.5, PAPER_LINE)
      c.line([33.6, y], [41, y], 0.5, PAPER_LINE)
    }
    if (v) c.poly([[32.2, 32.4], [38.6, 30.4], [38.6, 38.8], [32.2, 40.8]], WHITE)
    const l: Pt = [21.6, 39]
    const r: Pt = [42.4, 39]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
  } else if (mood === 'searching') {
    // a magnifier held up beside her face, sweeping
    const mx = v ? 51.5 : 49.5
    const l: Pt = [26.5, 37.5]
    arm(shL, l); hand(l[0], l[1])
    const r: Pt = [mx + 2.6, 26.5]
    arm(shR, r)
    c.line([mx + 2.2, 21.4], [mx + 3.4, 26], 1.6, GLASSES)
    if (detail) c.soft(mx, 17.6, 3.6, 3.6, p.glow, 0.35)
    c.ring(mx, 17.6, 4, 1.2, p.accent)
    hand(r[0], r[1])
  } else if (mood === 'writing') {
    // a pencil scribbling, sparkles flying off
    const l: Pt = [27, 37.2 + (v ? 1 : 0)]
    arm(shL, l); hand(l[0], l[1])
    const r: Pt = [38 + (v ? 1.2 : 0), 36.4]
    arm(shR, r)
    hand(r[0], r[1])
    // a yellow pencil, its tip down on the lid, the eraser up
    c.line([r[0] - 1, r[1] + 1.2], [r[0] + 7, r[1] - 9.4], 2.2, PENCIL)
    c.line([r[0] + 6, r[1] - 8.1], [r[0] + 7.2, r[1] - 9.6], 2.2, BLUSH)
    c.poly([[r[0] - 2.4, r[1] + 3.2], [r[0] - 0.1, r[1] + 1.9], [r[0] - 1.9, r[1] + 0.6]], PAPER)
    c.ell(r[0] - 2.2, r[1] + 3, 0.5, 0.5, INK)
    c.star(v ? 50 : 47, v ? 26 : 22, 1.8, p.star)
    c.star(v ? 15 : 13, v ? 28 : 31, 1.4, p.glow)
  } else if (mood === 'terminal') {
    // a little console floating up right, its cursor blinking
    const l: Pt = [27, 37.2 + (v ? 0 : 1)]
    const r: Pt = [37, 37.2 + (v ? 1 : 0)]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
    c.rect(48, 1.5, 15, 11, 1.6, TERM)
    c.rect(48, 1.5, 15, 2.4, 1.2, LID_DARK)
    c.path([[50.2, 6], [52.2, 7.6], [50.2, 9.2]], 0.9, TERM_GREEN)
    if (v) c.rect(53.6, 8.2, 2.6, 1.2, 0.2, TERM_GREEN)
  } else if (mood === 'web') {
    // a spinning globe
    const l: Pt = [27, 37.2 + (v ? 0 : 1)]
    const r: Pt = [37, 37.2 + (v ? 1 : 0)]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
    c.ell(54.5, 9.5, 6.2, 6.2, SEA)
    const s = v ? 2 : 0
    c.ell(52 + s, 7.2, 2.2, 1.6, LAND)
    c.ell(56 + s, 11.6, 1.8, 2, LAND)
    c.ell(50.4 + s, 12, 1, 0.9, LAND)
    c.path([[54.5, 3.3], [52.4, 9.5], [54.5, 15.7]], 0.4, WHITE)
    c.line([48.3, 9.5], [60.7, 9.5], 0.4, WHITE)
  } else if (mood === 'agent') {
    // a tiny helper of her own, bobbing up right
    const l: Pt = [27, 37.2 + (v ? 0 : 1)]
    const r: Pt = [37, 37.2 + (v ? 1 : 0)]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
    const hy = v ? 9 : 10.6
    c.poly([[49.6, hy - 3], [50.4, hy - 7.6], [53, hy - 4.6]], p.hair)
    c.poly([[59.4, hy - 3], [58.6, hy - 7.6], [56, hy - 4.6]], p.hair)
    c.ell(54.5, hy, 5.4, 5, p.hairDark)
    c.ell(54.5, hy + 0.8, 4.4, 4, SKIN_TONE)
    c.poly([[50, hy], [51, hy - 3.6], [54.5, hy - 4.8], [58, hy - 3.6], [59, hy], [54.5, hy - 2]], p.hair)
    c.ell(52.8, hy + 1.2, 0.7, 0.9, INK)
    c.ell(56.2, hy + 1.2, 0.7, 0.9, INK)
    c.ell(51.6, hy + 2.6, 0.9, 0.5, BLUSH)
    c.ell(57.4, hy + 2.6, 0.9, 0.5, BLUSH)
  } else if (mood === 'compact') {
    // squashing a stack of pages down
    const h = v ? 4 : 6.4
    for (let i = 0; i < 3; i++) c.rect(22 + i * 0.8, 36 - h - i * 1.2, 18, 2.2, 0.4, i % 2 ? PAPER_LINE : PAPER)
    const l: Pt = [24, 33.4 - h]
    const r: Pt = [40, 33.4 - h]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
  } else if (mood === 'sleep') {
    const l: Pt = [26, 38]
    const r: Pt = [38, 38]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
    // z z z
    const z = (x: number, y: number, s: number) =>
      c.path([[x, y], [x + s, y], [x, y + s], [x + s, y + s]], s * 0.28, p.glow)
    z(48, v ? 14 : 16, 3)
    z(53, v ? 6 : 8, 4)
    if (v) z(58.5, 0.5, 2.6)
    if (detail) c.soft(34.4, 26 + headDy, v ? 1.8 : 1.1, v ? 1.8 : 1.1, DROP, 0.55) // a bubble
  } else if (mood === 'wake') {
    const l: Pt = [24.5, 33]
    const r: Pt = [39.5, 33]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
    c.line([15, 6], [17.4, 11], 1.3, ALERT)
    c.line([49, 6], [46.6, 11], 1.3, ALERT)
    c.line([32, 0.6], [32, 2.6], 1.3, ALERT)
  } else if (mood === 'yawn') {
    const l: Pt = [26, 38]
    arm(shL, l); hand(l[0], l[1])
    const r: Pt = [37.4, 29.6]
    arm(shR, r); hand(r[0], r[1])
    if (detail) c.soft(22.6, 21.6, 0.8, 1, DROP, 0.8) // a sleepy tear
  } else if (mood === 'stretch') {
    const l: Pt = v ? [18, 4] : [19.5, 7]
    const r: Pt = v ? [46, 4] : [44.5, 7]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
  } else if (mood === 'sip') {
    // Sonnet takes her coffee to go, the others a cup of tea
    const l: Pt = [26, 38]
    arm(shL, l); hand(l[0], l[1])
    const r: Pt = [38.6, 33]
    arm(shR, r)
    if (skin === 'sonnet') {
      c.rect(36.6, 26.2 + (v ? -1 : 0), 5.4, 7, 1, p.accent)
      c.rect(36.2, 25.2 + (v ? -1 : 0), 6.2, 1.6, 0.6, WHITE)
      c.rect(36.6, 28.8 + (v ? -1 : 0), 5.4, 2, 0, PAPER)
    } else {
      c.rect(36.4, 27.4 + (v ? -1 : 0), 6, 5, 1.6, CUP)
      c.ell(39.4, 27.6 + (v ? -1 : 0), 2.8, 0.8, TEA)
      c.ring(43.2, 29.6 + (v ? -1 : 0), 1.3, 0.7, CUP)
    }
    hand(r[0], r[1] + 0.4)
    c.path(v ? [[38.6, 23], [39.6, 21], [38.6, 19]] : [[40, 23.4], [39, 21.4], [40, 19.4]], 0.6, STEAM)
    c.path(v ? [[41, 22.6], [40, 20.6], [41, 18.6]] : [[41.6, 22.8], [42.6, 20.8], [41.6, 18.8]], 0.6, STEAM)
  } else if (mood === 'smug') {
    // a hand at the chin
    const l: Pt = [26, 38]
    arm(shL, l); hand(l[0], l[1])
    const r: Pt = [35.6, 31]
    arm(shR, r); hand(r[0], r[1])
  } else if (mood === 'dance') {
    const l: Pt = v ? [15, 15] : [20, 42]
    const r: Pt = v ? [44, 42] : [49, 15]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
    // music notes
    const note = (x: number, y: number) => {
      c.ell(x, y, 1.5, 1.2, p.glow)
      c.line([x + 1.3, y], [x + 1.3, y - 4.4], 0.6, p.glow)
      c.line([x + 1.3, y - 4.4], [x + 3, y - 3.4], 0.6, p.glow)
    }
    note(v ? 53 : 8, v ? 9 : 11)
    note(v ? 7 : 54, v ? 24 : 26)
  } else {
    const l: Pt = [26, 38]
    const r: Pt = [38, 38]
    arm(shL, l); arm(shR, r); hand(l[0], l[1]); hand(r[0], r[1])
  }

  return c.shapes
}

// ---------------------------------------------------------------- SVG output

const f = (n: number) => String(Math.round(n * 100) / 100)

// `paint` turns a flat color into the gradient that stands for it, if any.
function shapeSvg(s: Shape, paint: (color: string) => string): string {
  if (s.k === 'ell') {
    const op = s.op === undefined ? '' : ` opacity="${f(s.op)}"`
    return `<ellipse cx="${f(s.cx)}" cy="${f(s.cy)}" rx="${f(s.rx)}" ry="${f(s.ry)}" fill="${paint(s.fill)}"${op}/>`
  }
  if (s.k === 'rect') return `<rect x="${f(s.x)}" y="${f(s.y)}" width="${f(s.w)}" height="${f(s.h)}" rx="${f(s.r)}" fill="${paint(s.fill)}"/>`
  if (s.k === 'poly') return `<polygon points="${s.pts.map(([x, y]) => f(x) + ',' + f(y)).join(' ')}" fill="${paint(s.fill)}"/>`
  if (s.k === 'd') {
    const look = s.stroke
      ? `fill="none" stroke="${s.stroke}" stroke-width="${f(s.w ?? 1)}" stroke-linecap="round" stroke-linejoin="round"`
      : `fill="${paint(s.fill)}"`
    const op = s.op === undefined ? '' : ` opacity="${f(s.op)}"`
    const at = s.dx || s.dy ? ` transform="translate(${f(s.dx)} ${f(s.dy)})"` : ''
    return `<path d="${s.d}" ${look}${op}${at}/>`
  }
  return `<line x1="${f(s.a[0])}" y1="${f(s.a[1])}" x2="${f(s.b[0])}" y2="${f(s.b[1])}" stroke="${paint(s.fill)}" stroke-width="${f(s.w)}" stroke-linecap="round"/>`
}

// A top-to-bottom gradient over the whole drawing (user space, so a straight
// line or a flat shape still gets it), from `y1` to `y2`.
function linear(id: string, y1: number, y2: number, stops: [number, string][]): string {
  const s = stops.map(([at, color]) => `<stop offset="${f(at)}" stop-color="${color}"/>`).join('')
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${f(y1)}" x2="0" y2="${f(y2)}">${s}</linearGradient>`
}

function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hex(a)
  const [br, bg, bb] = hex(b)
  const ch = (x: number, y: number) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return '#' + ch(ar, br) + ch(ag, bg) + ch(ab, bb)
}

const svgCache = new Map<string, string>()

export function svgFor(skin: Skin, mood: Mood, variant: number, px: number, night = false): string {
  const key = `${skin}|${mood}|${variant ? 1 : 0}|${px}|${night ? 1 : 0}`
  const hit = svgCache.get(key)
  if (hit) return hit

  // Shading: the hair, skin, hoodie and lid fade top to bottom. Each fill keeps
  // its flat color as the fallback, should a surface drop the gradients.
  const p = SKINS[skin]
  const ids: Record<string, string> = { [p.hair]: 'hair', [p.hoodie]: 'hood', [SKIN_TONE]: 'skin', [LID]: 'lid' }
  const paint = (color: string) => (ids[color] ? `url(#${ids[color]}) ${color}` : color)
  const defs =
    linear('hair', 0, 38, [[0, p.hairLight], [0.38, p.hair], [1, p.hairDark]]) +
    linear('hood', 30, 54, [[0, mix(p.hoodie, WHITE, 0.14)], [0.5, p.hoodie], [1, p.hoodieDark]]) +
    linear('skin', 8, 34, [[0, '#FFE8D8'], [0.6, SKIN_TONE], [1, '#F6CBB2']]) +
    linear('lid', 36, 52, [[0, '#D5D8E1'], [0.5, LID], [1, '#A7ACBA']]) +
    // a thin ink outline around the whole silhouette, sticker-style
    '<filter id="ink" x="-5%" y="-5%" width="110%" height="110%">' +
    '<feMorphology in="SourceAlpha" operator="dilate" radius="0.55" result="grown"/>' +
    `<feFlood flood-color="${INK}"/><feComposite in2="grown" operator="in" result="rim"/>` +
    '<feMerge><feMergeNode in="rim"/><feMergeNode in="SourceGraphic"/></feMerge></filter>'

  const body = buildShapes(skin, mood, variant, true, night).map(s => shapeSvg(s, paint)).join('')
  const shadow = '<ellipse cx="32" cy="57.6" rx="20" ry="2.6" fill="#000" opacity="0.3"/>'
  const out =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${px}" height="${px}">` +
    `<defs>${defs}</defs>${shadow}<g filter="url(#ink)">${body}</g></svg>`
  svgCache.set(key, out)
  return out
}

// ---------------------------------------------------------------- rasterizer

function polysOf(s: Shape): Pt[][] {
  const circle = (cx: number, cy: number, rx: number, ry: number, n = 28): Pt[] => {
    const out: Pt[] = []
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      out.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
    }
    return out
  }
  if (s.k === 'd') return [] // SVG only, never rasterized
  if (s.k === 'ell') return [circle(s.cx, s.cy, s.rx, s.ry)]
  if (s.k === 'poly') return [s.pts]
  if (s.k === 'rect') {
    const r = Math.min(s.r, s.w / 2, s.h / 2)
    const out: Pt[] = []
    const corner = (cx: number, cy: number, from: number) => {
      for (let i = 0; i <= 5; i++) {
        const a = ((from + (i / 5) * 90) * Math.PI) / 180
        out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
      }
    }
    corner(s.x + s.w - r, s.y + s.h - r, 0)
    corner(s.x + r, s.y + s.h - r, 90)
    corner(s.x + r, s.y + r, 180)
    corner(s.x + s.w - r, s.y + r, 270)
    return [out]
  }
  const [ax, ay] = s.a
  const [bx, by] = s.b
  const dx = bx - ax
  const dy = by - ay
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * (s.w / 2)
  const ny = (dx / len) * (s.w / 2)
  return [
    [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]],
    circle(ax, ay, s.w / 2, s.w / 2, 14),
    circle(bx, by, s.w / 2, s.w / 2, 14),
  ]
}

function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!
    const [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

function hex(rgb: string): [number, number, number] {
  const n = parseInt(rgb.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// RGBA pixels, `n` by `n`, colors snapped to the colors the shapes use so the
// result is crisp pixel art and the terminal sees few distinct color pairs.
export function pixelsFor(skin: Skin, mood: Mood, variant: number, n: number, night = false): Uint8Array {
  const shapes = buildShapes(skin, mood, variant, false, night)
  const scale = n / 64
  const SS = 3
  const r = new Float64Array(n * n)
  const g = new Float64Array(n * n)
  const b = new Float64Array(n * n)
  const a = new Float64Array(n * n)

  for (const s of shapes) {
    const polys = polysOf(s).map(poly => poly.map(([x, y]) => [x * scale, y * scale] as Pt))
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const poly of polys) for (const [x, y] of poly) {
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
    const [cr, cg, cb] = hex(s.fill)
    const x0 = Math.max(0, Math.floor(minX))
    const x1 = Math.min(n - 1, Math.ceil(maxX))
    const y0 = Math.max(0, Math.floor(minY))
    const y1 = Math.min(n - 1, Math.ceil(maxY))
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        let hits = 0
        for (let sy = 0; sy < SS; sy++) {
          for (let sx = 0; sx < SS; sx++) {
            const x = px + (sx + 0.5) / SS
            const y = py + (sy + 0.5) / SS
            for (const poly of polys) {
              if (inside(poly, x, y)) { hits++; break }
            }
          }
        }
        if (!hits) continue
        const cov = hits / (SS * SS)
        const i = py * n + px
        r[i] = r[i]! * (1 - cov) + cr * cov
        g[i] = g[i]! * (1 - cov) + cg * cov
        b[i] = b[i]! * (1 - cov) + cb * cov
        a[i] = a[i]! + cov * (1 - a[i]!)
      }
    }
  }

  const palette = [...new Set(shapes.map(s => s.fill))].map(hex)
  const out = new Uint8Array(n * n * 4)
  for (let i = 0; i < n * n; i++) {
    if (a[i]! < 0.5) continue
    let best = palette[0]!
    let bestD = Infinity
    for (const col of palette) {
      const d = (col[0] - r[i]!) ** 2 + (col[1] - g[i]!) ** 2 + (col[2] - b[i]!) ** 2
      if (d < bestD) { bestD = d; best = col }
    }
    out[i * 4] = best[0]
    out[i * 4 + 1] = best[1]
    out[i * 4 + 2] = best[2]
    out[i * 4 + 3] = 255
  }
  return out
}

// ---------------------------------------------------------------- terminal cells

const DEFAULT_COLOR = 0x01000000
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function base64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!
    const b1 = bytes[i + 1]
    const b2 = bytes[i + 2]
    out += B64[b0 >> 2]
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)]
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)]
    out += b2 === undefined ? '=' : B64[b2 & 63]
  }
  return out
}

const cellCache = new Map<string, string>()

// `n` pixels square -> a Raster of `n` columns by `n / 2` rows (two pixels per
// cell, drawn with half blocks). Pass an even `n`.
export function cellsFor(skin: Skin, mood: Mood, variant: number, n: number, night = false): string {
  const key = `${skin}|${mood}|${variant ? 1 : 0}|${n}|${night ? 1 : 0}`
  const hit = cellCache.get(key)
  if (hit) return hit
  const px = pixelsFor(skin, mood, variant, n, night)
  const rows = n / 2
  const words = new Uint32Array(n * rows * 3)
  const color = (x: number, y: number): number | null => {
    const i = (y * n + x) * 4
    if (px[i + 3] === 0) return null
    return (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!
  }
  let w = 0
  for (let row = 0; row < rows; row++) {
    for (let x = 0; x < n; x++) {
      const top = color(x, row * 2)
      const bottom = color(x, row * 2 + 1)
      let ch = ' '
      let fg = DEFAULT_COLOR
      let bg = DEFAULT_COLOR
      if (top !== null && bottom !== null) { ch = '▀'; fg = top; bg = bottom }
      else if (top !== null) { ch = '▀'; fg = top }
      else if (bottom !== null) { ch = '▄'; fg = bottom }
      words[w++] = ch.codePointAt(0)!
      words[w++] = fg
      words[w++] = bg
    }
  }
  const out = base64(new Uint8Array(words.buffer))
  cellCache.set(key, out)
  return out
}
