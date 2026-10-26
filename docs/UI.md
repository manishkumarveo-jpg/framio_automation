# UI

The whole interface is the Chrome side panel: `src/sidepanel/sidepanel.{html,css,js}`.
Markup is a static shell; `sidepanel.js` renders everything with a tiny `h()` DOM builder
(`render()` → `renderHeader()`, `renderMain()`, `renderFooter()`).

## Screens

| Screen | What's on it |
|---|---|
| **Queue** | Header Video \| Image switch, prompt cards (text, settings, attached images, slot notes), add card |
| **Paste a list** | Sheet: textarea for `prompt \| settings` lines, inline per-line errors, syntax tip |
| **Image picker** | Sheet: First / End / Reference / Element tabs, uploads + canvas assets |
| **Script** | Shot list for this Frameo project: unmatched names to link, "Make cards for N unsent shots", one row per shot (assets, continuity, chain, status), optional Groq story check settings |
| **Paste shot list** | Sheet: upload a file or paste a table, preview of what each column was read as, row errors |
| **Canvas** | Scan results grouped into Characters, Locations, Props |
| **Running** | Progress steps per job, stop after current |
| **Done** | Summary: sent, failed (with reasons), retry |
| **History** | Every job sent or failed, across sessions |
| **Footer** | Total credits, time estimate, balance after, Generate button, connection status |

## Design tokens
Defined on `:root` in `sidepanel.css`, taken from Frameo's own stylesheet so the panel looks native
next to it. Dark theme. Muted greys raised to pass WCAG 4.5:1.

```
--bg #18181b   --raised #202023   --floating #27272a   --control #333338   --thumb #3f3f46
```

## Rules
- Keyboard reachable: visible focus outlines on every control (incl. upload labels).
- Strings go in as text nodes; `innerHTML` is only used for static icon markup.
- Settings a model doesn't offer are hidden, not disabled.
