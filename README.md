# ELEVIQUE

Bulk video & image queue for [Frameo.ai](https://frameo.ai), as a Chrome side-panel extension (Manifest V3).
Write or paste many prompts, attach reference images, and send them through Frameo one after another.

> Independent tool. Not affiliated with Frameo.AI or Dashverse.

## Quick start

```bash
npm test          # parser self-check
npm run build     # → dist/extension/
npm run zip       # → dist/elevique-<version>.zip (Chrome Web Store upload)
```

Load it: `chrome://extensions` → Developer mode → **Load unpacked** → pick `dist/extension/`.
No dependencies and no bundler: the build just copies `src/` and `public/` together.

## Structure

```text
frameo-automator/
├── .gitignore
├── package.json            # build / test / zip scripts (no deps)
├── README.md
├── docs/
│   ├── PRD.md              # what & why
│   ├── FEATURES.md         # feature list + status
│   ├── PHASES.md           # roadmap
│   ├── UI.md               # side panel screens & design tokens
│   └── frameo-snapshots/   # saved frameo.ai HTML, reference for content-script selectors
├── public/                 # static assets copied as-is into the build
│   └── icons/              # icon16/32/48/128.png
├── store/                  # Chrome Web Store listing, privacy policy, promo tile
└── src/
    ├── manifest.json       # extension metadata & permissions
    ├── background/
    │   └── index.js        # service worker: opens side panel on toolbar click
    ├── content/            # scripts injected into frameo.ai
    │   ├── index.js        # drives Frameo's Generate Video/Image panels
    │   └── bridge.js       # MAIN world: talks to Frameo's canvas editor (tldraw)
    ├── sidepanel/          # the whole UI
    │   ├── sidepanel.html
    │   ├── sidepanel.css
    │   └── sidepanel.js
    └── utils/
        ├── parse.js        # "prompt | 16:9 | 5s | ref=a.png" line parser, shot-list parser (shared)
        ├── files.js        # .xlsx / .docx reader for shot-list uploads (side panel)
        └── parse.test.js
```

## How it fits together

```text
side panel ──chrome.tabs.sendMessage──▶ content/index.js ──DOM──▶ Frameo Generate panel
                                              │
                                              └─postMessage─▶ content/bridge.js ──▶ window.editor (canvas)
```

See `docs/` for product, feature and UI details.
