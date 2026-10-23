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

// The app's own backgrounds, one per theme, that the band melts into.
const THEMES = { dark: '#151515', light: '#faf9f5' } as const

const LABELS = {
  ru: {
    idle: 'отдыхаю',
    typing: 'печатаю…',
    attention: 'эй, посмотри сюда!',
    happy: 'готово!',
    oops: 'ой…',
    reading: 'читаю…',
    searching: 'ищу…',
    writing: 'пишу код…',
    terminal: 'колдую в терминале…',
    web: 'гуглю…',
    agent: 'позвала помощницу',
    compact: 'утрамбовываю контекст…',
    sleep: 'z z z',
    wake: 'а? я не сплю!',
    yawn: 'зеваю…',
    stretch: 'потягиваюсь~',
    sip: 'чаёк',
    look: 'осматриваюсь',
    smug: 'хе, изи',
    dance: 'с первого раза!',
    coffee: 'кофеёк',
    late: 'поздно уже, иди спать…',
    theme: 'Фон:',
    dark: 'Тёмный',
    light: 'Светлый',
    off: 'Без фона',
  },
  en: {
    idle: 'chilling',
    typing: 'typing…',
    attention: 'hey, look here!',
    happy: 'done!',
    oops: 'oops…',
    reading: 'reading…',
    searching: 'searching…',
    writing: 'writing code…',
    terminal: 'casting in the terminal…',
    web: 'googling…',
    agent: 'called a helper',
    compact: 'squashing the context…',
    sleep: 'z z z',
    wake: "huh? I'm awake!",
    yawn: 'yawning…',
    stretch: 'stretching~',
    sip: 'tea time',
    look: 'looking around',
    smug: 'heh, easy',
    dance: 'first try!',
    coffee: 'coffee time',
    late: "it's late, go to bed…",
    theme: 'Background:',
    dark: 'Dark',
    light: 'Light',
    off: 'None',
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
// The little settings row under her caption, opened by the gear.
let isSettingsOpen = false
let ticks = 0
let hold = 0
let then: Mood = 'idle'
// Life between turns: ticks since anything happened, when the next fidget
// comes, whether it is night where the person sits.
let idleTicks = 0
let nextFidget = 25
let isNight = false
let isTurnRunning = false
let turnHadError = false
// The desktop's next-step card with a question hides the band while it shows,
// so she moves under the last reply meanwhile. The card is the app's own
// `wrap_up` tool asked with a question; the next turn, or the band drawn again
// (the card dismissed), ends it.
let isCardUp = false
let turnEndTick = 0
const seenReplies = new Set<string>()
let lastReplyId: string | null = null

// What Claude's tools look like on her. A subagent's own calls are left out.
const TOOL_MOODS: Record<string, Mood> = {
  Read: 'reading',
  NotebookRead: 'reading',
  Grep: 'searching',
  Glob: 'searching',
  LS: 'searching',
  ToolSearch: 'searching',
  Edit: 'writing',
  MultiEdit: 'writing',
  Write: 'writing',
  NotebookEdit: 'writing',
  Bash: 'terminal',
  PowerShell: 'terminal',
  Monitor: 'terminal',
  WebSearch: 'web',
  WebFetch: 'web',
  Agent: 'agent',
  Task: 'agent',
}
// After a turn, five minutes of nothing puts her to sleep (600 ms ticks).
const SLEEP_TICKS = 500
// Moods she drifts through between turns, and how long each lasts.
const FIDGETS: [Mood, number][] = [['yawn', 4], ['stretch', 4], ['sip', 8], ['look', 6]]
// Calm moods: the nightcap stays on through these.
const CALM: Mood[] = ['idle', 'sleep', 'wake', 'yawn', 'stretch', 'sip', 'look']
// Moods that animate at half speed.
const SLOW: Mood[] = ['sleep', 'sip', 'look']

function toolMood(tool: string): Mood | undefined {
  if (TOOL_MOODS[tool]) return TOOL_MOODS[tool]
  if (/browser|chrome/i.test(tool)) return 'web'
  return undefined
}

function setMood(next: Mood, holdTicks = 0, after: Mood = 'idle') {
  mood = next
  variant = 0
  hold = holdTicks
  then = after
}

// Anything that happened: she wakes up, and fidgets start over.
function stir() {
  idleTicks = 0
  nextFidget = 20 + Math.floor(Math.random() * 25)
}

function captionOf(skin: Skin): string {
  const words = LABELS[lang]
  let text: string = words[mood]
  if (mood === 'sip' && skin === 'sonnet') text = words.coffee
  if (mood === 'idle' && isNight) text = words.late
  return SKIN_NAMES[skin] + ' · ' + text
}

function savePrefs($: any) {
  return $.store.set('prefs', { skin: skinPin, size, lang, isHidden, bg: backdrop ?? 'off' })
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
  const { Box, Text, Button } = $.ui.resolve(e)
  // Raster exists on the terminal only, Svg everywhere else.
  const { Raster, Svg } = $.ui.resolve(e) as Record<string, any>
  const skin = skinPin ?? skinAuto
  const caption = captionOf(skin)
  const want = SIZES[size]!
  const night = isNight && CALM.includes(mood)

  let picture
  if (e.surface === 'terminal' && Raster) {
    const px = fit(want.cells, columns, rows)
    picture = Raster({ key: 'buddy', columns: px, rows: px / 2, cells: cellsFor(skin, mood, variant, px, night) })
  } else if (Svg) {
    picture = Svg({ source: svgFor(skin, mood, variant, want.svg, night), alt: caption, width: want.svg, height: want.svg })
  } else {
    picture = Text({ children: ['(' + caption + ')'] })
  }

  // A gear beside the caption opens a row to pick the backdrop: one per theme
  // of the app, or none.
  const words = LABELS[lang]
  const setBackdrop = (bg: string | null) => {
    backdrop = bg
    void savePrefs($)
    $.ui.invalidate('ui.render')
  }
  const choice = (key: string, label: string, bg: string | null) =>
    Button({
      key: 'bg-' + key,
      label: (backdrop === bg ? '• ' : '') + label,
      plain: true,
      dimColor: backdrop !== bg,
      onPress: () => setBackdrop(bg),
    })
  const gear = Button({
    key: 'settings',
    label: '⚙',
    plain: true,
    dimColor: !isSettingsOpen,
    onPress: () => {
      isSettingsOpen = !isSettingsOpen
      $.ui.invalidate('ui.render')
    },
  })
  const lines = [
    Box({
      flexDirection: 'row',
      alignItems: 'center',
      gap: 1,
      children: [Text({ dimColor: true, children: [' ' + caption] }), gear],
    }),
  ]
  if (isSettingsOpen) {
    lines.push(
      Box({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
        children: [
          Text({ dimColor: true, children: [' ' + words.theme] }),
          choice('dark', words.dark, THEMES.dark),
          choice('light', words.light, THEMES.light),
          choice('off', words.off, null),
        ],
      }),
    )
  }
  const content = [picture, Box({ flexDirection: 'column', children: lines })]
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

// Her at the left of a survey, small and waving, the survey as the engine drew
// it taking the rest of the row. No backdrop: the survey's own card shows.
// Her under the last reply, waving at the question card below it.
function underReply($: any, e: any, reply: unknown) {
  const { Box, Text, Svg } = $.ui.resolve(e) as Record<string, any>
  if (!Svg) return reply
  const skin = skinPin ?? skinAuto
  const px = SIZES[size]!.svg
  return Box({
    flexDirection: 'column',
    children: [
      reply,
      Box({
        flexDirection: 'row',
        alignItems: 'center',
        children: [
          Svg({ source: svgFor(skin, 'attention', ticks % 2, px), alt: SKIN_NAMES[skin], width: px, height: px }),
          Text({ dimColor: true, children: [' ' + SKIN_NAMES[skin] + ' · ' + LABELS[lang].attention] }),
        ],
      }),
    ],
  })
}

function besideSurvey($: any, e: any, survey: unknown) {
  const { Box, Svg } = $.ui.resolve(e) as Record<string, any>
  if (!Svg) return survey
  const skin = skinPin ?? skinAuto
  const px = SIZES.s!.svg
  return Box({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    children: [
      Box({
        flexShrink: 0,
        children: [Svg({ source: svgFor(skin, 'attention', variant, px), alt: SKIN_NAMES[skin], width: px, height: px })],
      }),
      Box({ flexGrow: 1, flexShrink: 1, children: [survey] }),
    ],
  })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'buddy',
      description: 'Show, hide or tune the mascot above the prompt',
      argumentHint: '[close | skin <name|auto> | size <s|m|l> | bg <dark|light|#rrggbb|off> | lang <ru|en>]',
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

    // Night is midnight to six, by the clock where she runs; asked now and
    // once a minute.
    const checkNight = () =>
      $.clock
        .now()
        .then(ms => {
          const night = new Date(ms).getHours() < 6
          if (night === isNight) return
          isNight = night
          $.ui.invalidate('ui.render')
        })
        .catch(() => {
          // keep what it was
        })
    await checkNight()
    $.clock.every(60_000, () => void checkNight())

    // One tick every 600 ms: wave, type, blink, fall back to idle, and between
    // turns fidget now and then, and doze off after a while.
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
      if (!isTurnRunning && CALM.includes(mood)) {
        idleTicks += 1
        if (mood !== 'sleep' && idleTicks >= SLEEP_TICKS) {
          setMood('sleep')
          changed = true
        } else if (mood === 'idle' && idleTicks >= nextFidget) {
          // late at night she mostly yawns
          const [fidget, length] = isNight && Math.random() < 0.6 ? FIDGETS[0]! : FIDGETS[Math.floor(Math.random() * FIDGETS.length)]!
          setMood(fidget, length, 'idle')
          nextFidget = idleTicks + length + 20 + Math.floor(Math.random() * 30)
          changed = true
        }
      }
      if (mood === 'idle') {
        const blink = ticks % 7 === 0 ? 1 : 0
        if (blink !== variant) {
          variant = blink
          changed = true
        }
      } else if (!SLOW.includes(mood) || ticks % 2 === 0) {
        variant = variant ? 0 : 1
        changed = true
      }
      // under the reply she waves on every tick
      if (isCardUp && !isTurnRunning) changed = true
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
    const save = () => savePrefs($)

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
      else if (arg === 'dark' || arg === 'light') backdrop = THEMES[arg]
      else if (HEX.test(arg)) backdrop = arg
      else return { text: 'Background: dark, light, #rrggbb to match the app, or off.' }
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
      // asleep, she startles awake first
      if (mood === 'sleep') setMood('wake', 3, 'typing')
      else setMood('typing')
      isTurnRunning = true
      turnHadError = false
      isCardUp = false
      stir()
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // The turn ends: cheer, shrug or settle down. Opus is smug after a long
  // one; Sonnet dances when nothing failed along the way.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const skin = skinPin ?? skinAuto
      if (e.reason === 'answer') {
        if (skin === 'opus' && e.durationMs >= 60_000) setMood('smug', 8, 'idle')
        else if (skin === 'sonnet' && !turnHadError) setMood('dance', 8, 'idle')
        else setMood('happy', 6, 'idle')
      } else if (e.reason === 'aborted') setMood('idle')
      else setMood('oops', 8, 'idle')
      isTurnRunning = false
      turnEndTick = ticks
      stir()
      $.ui.invalidate('ui.render')
    }
    return next(e)
  })

  // Each tool shows on her: reading, searching, writing, the terminal, the
  // web, a helper. Claude asks you a question: she waves until it is answered.
  on('tool.call', async ($, e, next) => {
    if (e.agentId === undefined && /(^|__)wrap_up$/.test(e.tool)) {
      const input = e.input as { ask?: string; actions?: unknown[] } | undefined
      if (input?.ask || input?.actions?.length) isCardUp = true
    }
    const busy = e.agentId === undefined ? toolMood(e.tool) : undefined
    if (e.tool === 'AskUserQuestion') {
      setMood('attention')
      $.ui.invalidate('ui.render')
    } else if (busy && mood !== 'attention') {
      setMood(busy)
      $.ui.invalidate('ui.render')
    }
    const ran = await next(e)
    if (mood === 'attention' || (busy && mood === busy)) {
      setMood(isTurnRunning ? 'typing' : 'idle')
      $.ui.invalidate('ui.render')
    }
    return ran
  }).catch(($, e, next) => next(e))

  // The context gets compacted: she squashes the pages down.
  on('session.compact', async ($, e, next) => {
    setMood('compact')
    $.ui.invalidate('ui.render')
    try {
      return await next(e)
    } finally {
      setMood(isTurnRunning ? 'typing' : 'idle')
      $.ui.invalidate('ui.render')
    }
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
    turnHadError = true
    setMood('oops', 3, 'typing')
    $.ui.invalidate('ui.render')
    return next(e)
  }).catch(($, e, next) => next(e))

  // The band right above the prompt, in the chat column. While a survey holds
  // it, the desktop keeps her small at its side, waving at the question; the
  // terminal, short of room, leaves the band to the survey. Should the surface
  // refuse the pair, the engine draws its survey alone.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    // The band drawn again a while after the turn: the card was dismissed.
    if (isCardUp && !isTurnRunning && ticks - turnEndTick > 3) {
      isCardUp = false
      $.ui.invalidate('ui.render')
    }
    if (isHidden) return next(e)
    if (e.props.hasSurvey) {
      const survey = await next(e)
      if (!survey || e.surface !== 'desktop') return survey
      return besideSurvey($, e, survey)
    }
    return draw($, e, e.props.maxRows, e.props.bodyColumns)
  })

  // Each block of a reply: the newest one first seen is the last reply, and
  // while the question card is up she stands under it.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!seenReplies.has(e.requestId)) {
      seenReplies.add(e.requestId)
      lastReplyId = e.requestId
    }
    const reply = await next(e)
    if (isHidden || !isCardUp || isTurnRunning || e.requestId !== lastReplyId || e.surface !== 'desktop') return reply
    return underReply($, e, reply)
  })
}
