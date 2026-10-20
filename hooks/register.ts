import type { Register } from 'claude-code'

import { SKIN_IDS, SKIN_NAMES, cellsFor, skinOfModel, svgFor } from './art.js'
import type { Mood, Skin } from './art.js'

const PANE = 'desk-buddy'
const HEX = /^#[0-9a-fA-F]{6}$/
// Pixels on the terminal (Raster, cut to the rows the band has) and on the
// remote surfaces (Svg, CSS pixels).
const SIZES: Record<string, { cells: number; svg: number }> = {
  s: { cells: 16, svg: 88 },
  m: { cells: 24, svg: 120 },
  l: { cells: 32, svg: 160 },
}

const LABELS = {
  ru: {
    idle: 'отдыхаю',
    typing: 'печатаю…',
    attention: 'эй, посмотри сюда!',
    happy: 'готово!',
    oops: 'ой…',
  },
  en: {
    idle: 'chilling',
    typing: 'typing…',
    attention: 'hey, look here!',
    happy: 'done!',
    oops: 'oops…',
  },
} as const

// The mascot's state. Plain variables: they only matter while the module lives,
// and the preferences are saved in $.store.
let mood: Mood = 'idle'
let variant = 0
let skinAuto: Skin = 'opus'
let skinPin: Skin | null = null
let size = 'm'
let isHidden = false
// What the band is painted with, to melt into the app's own background (the
// dark theme's); null leaves the card the app draws behind her as it is.
let backdrop: string | null = '#151515'
let lang: 'ru' | 'en' = 'ru'
let ticks = 0
let hold = 0
let then: Mood = 'idle'

function setMood(next: Mood, holdTicks = 0, after: Mood = 'idle') {
  mood = next
  variant = 0
  hold = holdTicks
  then = after
}

// The biggest of 16, 24 that fits the room the band has, up to `want`.
function fit(want: number, columns: number, rows: number): number {
  let n = want
  if (columns < n) n = columns
  if ((rows - 1) * 2 < n) n = (rows - 1) * 2
  return Math.max(16, Math.floor(n / 8) * 8)
}

// She at the left, her caption beside her. `rows` and `columns` are the room
// the band has.
function draw($: any, e: any, rows: number, columns: number) {
  const { Box, Text } = $.ui.resolve(e)
  // Raster exists on the terminal only, Svg everywhere else.
  const { Raster, Svg } = $.ui.resolve(e) as Record<string, any>
  const skin = skinPin ?? skinAuto
  const caption = SKIN_NAMES[skin] + ' · ' + LABELS[lang][mood]
  const want = SIZES[size]!

  let picture
  if (e.surface === 'terminal' && Raster) {
    const px = fit(want.cells, columns, rows)
    picture = Raster({ key: 'buddy', columns: px, rows: px / 2, cells: cellsFor(skin, mood, variant, px) })
  } else if (Svg) {
    picture = Svg({ source: svgFor(skin, mood, variant, want.svg), alt: caption, width: want.svg, height: want.svg })
  } else {
    picture = Text({ children: ['(' + caption + ')'] })
  }

  const content = [picture, Text({ dimColor: true, children: [' ' + caption] })]
  if (!backdrop || e.surface === 'terminal') {
    return Box({ flexDirection: 'row', justifyContent: 'flex-start', alignItems: 'center', children: content })
  }

  // The app draws the band inside a card with a padding of its own, the rim it
  // shows around the backdrop. At the sides a negative margin stretches the
  // backdrop over it (the padding puts her back where she stood); above and
  // below, where the desktop takes no such margin, a strip on each edge covers
  // it, outside her own box so it never paints over her.
  const strip = (edge: 'top' | 'bottom') =>
    Box({ position: 'absolute', [edge]: -1, left: 0, right: 0, height: 1, backgroundColor: backdrop })
  return Box({
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: backdrop,
    marginX: -1,
    paddingX: 1,
    children: [strip('top'), strip('bottom'), ...content],
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'buddy',
      description: 'Show, hide or tune the mascot above the prompt',
      argumentHint: '[close | skin <name|auto> | size <s|m|l> | bg <#rrggbb|off> | lang <ru|en>]',
      immediate: true,
    })

    const saved = await $.store.get('prefs')
    if (saved && typeof saved === 'object') {
      const prefs = saved as { skin?: string; size?: string; lang?: string; isHidden?: boolean; bg?: string }
      if (prefs.bg === 'off') backdrop = null
      else if (prefs.bg && HEX.test(prefs.bg)) backdrop = prefs.bg
      if (prefs.skin && (SKIN_IDS as string[]).includes(prefs.skin)) skinPin = prefs.skin as Skin
      if (prefs.size && SIZES[prefs.size]) size = prefs.size
      if (prefs.lang === 'en' || prefs.lang === 'ru') lang = prefs.lang
      if (prefs.isHidden === true) isHidden = true
    }
    try {
      skinAuto = skinOfModel(await $.session.model())
    } catch {
      // keep the default skin
    }

    // No event says the model changed (/model, the app's picker): ask each tick,
    // so her look follows it at once rather than at the next prompt.
    let isAsking = false
    $.clock.every(600, () => {
      if (isAsking) return
      isAsking = true
      void $.session
        .model()
        .then(model => {
          const skin = skinOfModel(model)
          if (skin === skinAuto) return
          skinAuto = skin
          if (!skinPin) $.ui.invalidate('ui.render')
        })
        .catch(() => {
          // keep the last skin
        })
        .finally(() => {
          isAsking = false
        })
    })

    // One tick every 600 ms: wave, type, blink, and fall back to idle.
    $.clock.every(600, () => {
      ticks += 1
      let changed = false
      if (hold > 0) {
        hold -= 1
        if (hold === 0) {
          mood = then
          variant = 0
          changed = true
        }
      }
      if (mood === 'idle') {
        const blink = ticks % 7 === 0 ? 1 : 0
        if (blink !== variant) {
          variant = blink
          changed = true
        }
      } else {
        variant = variant ? 0 : 1
        changed = true
      }
      if (changed) $.ui.invalidate('ui.render')
    })

    // An earlier version drew a side pane; a reload may find it still open.
    try {
      await $.ui.close({ id: PANE })
    } catch {
      // no pane to close
    }
    return next(e)
  })

  on('command.run', { command: 'buddy' }, async ($, e) => {
    const [word = '', arg = ''] = e.args.trim().split(/\s+/)
    const save = () => $.store.set('prefs', { skin: skinPin, size, lang, isHidden, bg: backdrop ?? 'off' })

    if (word === 'close') {
      isHidden = true
      await save()
      $.ui.invalidate('ui.render')
      return { text: 'Mascot hidden. /buddy shows her again.' }
    }
    if (word === 'skin') {
      if (arg === 'auto') {
        skinPin = null
      } else if ((SKIN_IDS as string[]).includes(arg)) {
        skinPin = arg as Skin
      } else {
        return { text: 'Skins: ' + SKIN_IDS.join(', ') + ', auto (follows the model).' }
      }
      await save()
      $.ui.invalidate('ui.render')
      return { text: 'Skin: ' + (skinPin ? SKIN_NAMES[skinPin] : 'auto') }
    }
    if (word === 'size') {
      if (!SIZES[arg]) return { text: 'Sizes: s (small), m (medium), l (large).' }
      size = arg
      await save()
      $.ui.invalidate('ui.render')
      return { text: 'Size: ' + arg }
    }
    if (word === 'bg') {
      if (arg === 'off') backdrop = null
      else if (HEX.test(arg)) backdrop = arg
      else return { text: 'Background: #rrggbb to match the app (dark theme: #151515), or off.' }
      await save()
      $.ui.invalidate('ui.render')
      return { text: 'Background: ' + (backdrop ?? 'off') }
    }
    if (word === 'lang') {
      if (arg !== 'ru' && arg !== 'en') return { text: 'Languages: ru, en.' }
      lang = arg
      await save()
      $.ui.invalidate('ui.render')
      return { text: 'Language: ' + arg }
    }

    isHidden = false
    await save()
    $.ui.invalidate('ui.render')
    return { text: 'Mascot shown above the prompt.' }
  })

  // A model turn begins: she starts typing, in the skin of the current model.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      try {
        skinAuto = skinOfModel(await $.session.model())
      } catch {
        // keep the last skin
      }
      setMood('typing')
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // The turn ends: cheer, shrug or settle down.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      if (e.reason === 'answer') setMood('happy', 6, 'idle')
      else if (e.reason === 'aborted') setMood('idle')
      else setMood('oops', 8, 'idle')
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // Claude asks you a question: she waves until the call is answered.
  on('tool.call', async ($, e, next) => {
    if (e.tool === 'AskUserQuestion') {
      setMood('attention')
      $.ui.invalidate('ui.render')
    }
    const ran = await next(e)
    if (mood === 'attention') {
      setMood('typing')
      $.ui.invalidate('ui.render')
    }
    return ran
  }).catch(($, e, next) => next(e))

  // A permission prompt is about to show: she waves.
  on('tool.check', async ($, e, next) => {
    const decision = await next(e)
    if (decision.decision === 'ask') {
      setMood('attention')
      $.ui.invalidate('ui.render')
    }
    return decision
  }).catch(($, e, next) => next(e))

  // A tool failed: a short "oops", then back to work.
  on('classic.PostToolUseFailure', async ($, e, next) => {
    setMood('oops', 3, 'typing')
    $.ui.invalidate('ui.render')
    return next(e)
  }).catch(($, e, next) => next(e))

  // The band right above the prompt, in the chat column. A survey owns it while
  // it shows.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (isHidden || e.props.hasSurvey) return next(e)
    return draw($, e, e.props.maxRows, e.props.bodyColumns)
  })
}
