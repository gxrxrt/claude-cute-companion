# desk-buddy

A small animated mascot for Claude Code. She types while Claude works, waves when it needs you, cheers when it is done, and has her own look for each model (Opus, Sonnet, Haiku, Fable, Mythos).

All art is original and drawn in code (`hooks/art.ts`): no image files, no third-party characters.

Requires Claude Code 2.1.287 or later (mods). Tested against 2.1.304.

## Install

At the prompt of a terminal session:

```
/plugin install desk-buddy --marketplace gxrxrt/claude-cute-companion
```

From a shell:

```bash
claude plugin install desk-buddy --marketplace gxrxrt/claude-cute-companion
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `gxrxrt/claude-cute-companion`, then Add plugin.

You will be asked `Add marketplace?` (answer `y`), then for a scope. To run it from a checkout instead, while changing it:

```bash
claude --plugin-dir ./desk-buddy
```

She sits in the band right above the prompt, at its left edge, in the chat column; while a survey is on screen she steps aside. The desktop app draws that band inside a card of its own; she paints her band with the dark theme's background (`#151515`) so the card melts away. On another theme, set the color with `/buddy bg <#rrggbb>`, or `/buddy bg off`. If you hid her, run `/buddy`.

## What she does

| When | She |
| --- | --- |
| A turn starts | types (2 frames) |
| A permission prompt shows, or Claude asks you a question | waves with a "!" bubble (2 frames) |
| A tool fails | gasps for a moment, then goes back to typing (2 frames) |
| A turn ends | cheers with sparkles (2 frames); or gasps if it ended in an error |
| Nothing is happening | sits and blinks (2 frames) |

The skin follows the current model, and changes as soon as you switch it (`/model` or the app's picker), before the next prompt. Pin one with `/buddy skin fable`, go back with `/buddy skin auto`.

## Commands

```
/buddy                 show her above the prompt
/buddy close           hide her
/buddy skin <name>     opus, sonnet, haiku, fable, mythos, or auto
/buddy size <s|m|l>    small, medium or large (she shrinks to fit the band)/buddy bg <#rrggbb>    band background on desktop and VS Code (default #151515), or off
/buddy lang <ru|en>    caption language
```

Preferences are saved between sessions.

## How it draws

- Terminal: a `Raster` of half-block pixel art (needs 24-bit color, which most terminals have).
- Desktop app and VS Code: an `Svg`, same character with the detail a smooth drawing can carry: colored irises with glints and lashes, hair strands and a curl, gradients, a thin outline and a soft shadow.

## Change her

Everything about her look is in `hooks/art.ts`: palettes are in `SKINS`, poses are in `buildShapes`. `tools/preview.mjs` renders every pose: terminal frames as PPM files and the SVGs in `sheet.html`:

```bash
node --experimental-strip-types tools/preview.mjs ./frames 48
```

## Test

```bash
claude plugin validate ./desk-buddy
claude plugin test ./desk-buddy
```

## Security

Mods run with the same access as Claude Code itself. This one reads the model name, keeps three preferences in `$.store`, and does nothing else: no files, no network, no processes.
