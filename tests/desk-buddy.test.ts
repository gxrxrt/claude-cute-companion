import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'desk-buddy',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 12,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 11 },
    view: {},
  },
} as const

// Nothing sits beneath the plugin: these hooks stand for the engine.
function engine(on: any, model: string | (() => string)) {
  on('command.register', () => ({ value: { command: 'buddy' } }))
  on('ui.close', () => ({ value: undefined }))
  on('session.model', () => ({ value: typeof model === 'function' ? model() : model }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('turn.start', (_: unknown, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
}

test('the mascot takes the skin of the model and cheers when a turn ends', async ($, on) => {
  engine(on, 'claude-sonnet-5-5')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  await $.turn.start({ text: 'hi', turnId: 't1' })
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Sonnet · печатаю/ })).toBeDefined()
  await ui.unmount()

  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // Sonnet dances when nothing failed
  expect(await ui.find({ type: 'Text', text: /Sonnet · с первого раза/ })).toBeDefined()
  await ui.unmount()
})

test('each tool shows on her, and she goes back to typing after it', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  const seen: string[] = []
  // The tool itself: look at her while it runs.
  on('tool.call', async () => {
    const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
    if (await ui.find({ type: 'Text', text: /читаю/ })) seen.push('reading')
    if (await ui.find({ type: 'Text', text: /терминал/ })) seen.push('terminal')
    await ui.unmount()
    return { result: 'ok', text: 'ok' }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })

  await $.tool.call({ tool: 'Read', input: { file_path: '/a' } } as any)
  await $.tool.call({ tool: 'Bash', input: { command: 'ls' } } as any)
  expect(seen).toEqual(['reading', 'terminal'])

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Opus · печатаю/ })).toBeDefined()
  await ui.unmount()
})

test('a long turn leaves Opus smug, a short one just happy', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete({ answer: 'ok', durationMs: 120_000, isAborted: false, turnId: 't1', reason: 'answer' })
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Opus · хе, изи/ })).toBeDefined()
  await ui.unmount()

  await $.turn.start({ text: 'hi', turnId: 't2' })
  await $.turn.complete({ answer: 'ok', durationMs: 5_000, isAborted: false, turnId: 't2', reason: 'answer' })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Opus · готово/ })).toBeDefined()
  await ui.unmount()
})

test('five quiet minutes put her to sleep, a new turn wakes her', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await clock.advance(600 * 510)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /z z z/ })).toBeDefined()
  await ui.unmount()

  await $.turn.start({ text: 'hi', turnId: 't1' })
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /не сплю/ })).toBeDefined()
  await ui.unmount()
})

test('a model switch changes her look before the next prompt', async ($, on) => {
  let model = 'claude-opus-5-5'
  engine(on, () => model)
  const clock = mock.clock(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Opus · / })).toBeDefined()
  await ui.unmount()

  model = 'claude-haiku-5-5'
  await clock.advance(700)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Haiku · / })).toBeDefined()
  await ui.unmount()
})

test('a terminal gets a Raster, the desktop and VS Code get an Svg', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await terminal.find({ type: 'Raster' })).toBeDefined()
  await terminal.unmount()

  for (const surface of ['desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect(await ui.find({ type: 'Svg' })).toBeDefined()
    await ui.unmount()
  }
})

test('/buddy skin pins a skin and rejects a wrong name', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const wrong = await $.command.run({ command: 'buddy', args: 'skin nobody' } as any)
  expect(wrong.text).toMatch(/Skins:/)

  const ok = await $.command.run({ command: 'buddy', args: 'skin mythos' } as any)
  expect(ok.text).toBe('Skin: Mythos')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Mythos · / })).toBeDefined()
  await ui.unmount()
})

test('/buddy bg paints the band on the desktop only, and rejects a wrong color', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Box' }))?.props?.backgroundColor).toBe('#151515')
  await ui.unmount()

  ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Box' }))?.props?.backgroundColor).toBeUndefined()
  await ui.unmount()

  expect((await $.command.run({ command: 'buddy', args: 'bg blue' } as any)).text).toMatch(/#rrggbb/)
  expect((await $.command.run({ command: 'buddy', args: 'bg #101010' } as any)).text).toBe('Background: #101010')
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Box' }))?.props?.backgroundColor).toBe('#101010')
  await ui.unmount()

  await $.command.run({ command: 'buddy', args: 'bg off' } as any)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Box' }))?.props?.backgroundColor).toBeUndefined()
  await ui.unmount()
})

test('the gear opens a row that switches the backdrop to the light theme and back', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Button', key: 'bg-light' } as any)).toBeUndefined()
  await ui.press({ key: 'settings' })
  await ui.press({ key: 'bg-light' })
  await ui.unmount()

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Box' }))?.props?.backgroundColor).toBe('#faf9f5')
  await ui.press({ key: 'bg-dark' })
  await ui.unmount()

  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Box' }))?.props?.backgroundColor).toBe('#151515')
  await ui.unmount()
})

test('with the question card up she stands under the last reply, until the next turn', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: ['reply'] }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const reply = (requestId: string) =>
    $.ui.mount({ plugin: 'desk-buddy', component: 'AssistantMessage', requestId, props: { text: 'hi', isFirstOfReply: true }, surface: 'desktop' } as any)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  let old = await reply('m1')
  await old.unmount()
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', input: { recap: 'done', ask: 'Ship it?' } } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })

  let ui = await reply('m2')
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /reply/ })).toBeDefined()
  await ui.unmount()
  // an older reply stays as it was
  old = await reply('m1')
  expect(await old.find({ type: 'Svg' })).toBeUndefined()
  await old.unmount()

  await $.turn.start({ text: 'yes', turnId: 't2' })
  ui = await reply('m2')
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('a recap without a question leaves the reply alone', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: ['reply'] }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.tool.call({ tool: 'mcp__ccd_turn__wrap_up', input: { recap: 'done' } } as any)
  await $.turn.complete({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 't1', reason: 'answer' })
  const ui = await $.ui.mount({ plugin: 'desk-buddy', component: 'AssistantMessage', requestId: 'm1', props: { text: 'hi', isFirstOfReply: true }, surface: 'desktop' } as any)
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})

test('/buddy close hides her, /buddy shows her again, the desktop keeps her beside a survey', async ($, on) => {
  engine(on, 'claude-opus-5-5')
  // What the engine draws in the band when the mod passes.
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: ['engine'] }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.command.run({ command: 'buddy', args: 'close' } as any)
  let ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await ui.unmount()

  await $.command.run({ command: 'buddy', args: '' } as any)
  ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  await ui.unmount()

  // the desktop keeps her beside the survey, the terminal leaves it the band
  ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, hasSurvey: true }, surface: 'desktop' })
  expect(await ui.find({ type: 'Svg' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await ui.unmount()

  ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, hasSurvey: true }, surface: 'terminal' })
  expect(await ui.find({ type: 'Raster' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /engine/ })).toBeDefined()
  await ui.unmount()
})
