# Frameo page snapshots

Saved HTML of frameo.ai, used as the reference for the DOM lookups in `src/content/index.js` (`FIND`)
and the canvas bridge in `src/content/bridge.js`. When Frameo changes its markup, save a new snapshot
and diff it against the last one to see what moved.

## Saving a new one
1. Open the project on frameo.ai, open the panel you care about (e.g. Quick Actions → Generate Video).
2. DevTools → Elements → right-click `<html>` → Copy → **Copy outerHTML**.
3. `NAME=generate-video npm run snapshot` → `docs/frameo-snapshots/<date>-generate-video.html`

## Comparing
```bash
diff <(grep -o 'data-slot="[^"]*"' OLD.html | sort -u) <(grep -o 'data-slot="[^"]*"' NEW.html | sort -u)
```

| File | What's open |
|---|---|
| `2026-10-23-project-canvas.html` | Project "MAHAGATHA 54-55" canvas |

Note: snapshots include Frameo's public client config (analytics IDs, Firebase web keys). They're Frameo's,
not ours. Keep this folder out of any public repo.
