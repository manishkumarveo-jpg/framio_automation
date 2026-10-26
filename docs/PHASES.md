# Phases

## Phase 1: Core queue ✅
- Side panel, prompt cards, paste-a-list parser
- Drive Frameo's Generate Video / Generate Image panels one job at a time
- Default settings + per-prompt overrides

## Phase 2: Images & canvas ✅
- Uploads stored locally (`unlimitedStorage`), reusable across prompts
- First / End / Reference / Element slots
- Canvas scan via MAIN-world bridge; labelled assets by name; `@tags`
- Shot placement (new / auto / existing shot)

## Phase 3: Cost & safety ✅
- Live price checks from Frameo's Generate button
- Credit total, ETA, balance-after; stop on low credits
- Plan concurrency limit; stop-after-current; safe retry
- History

## Phase 4: Store release 🚧
- [x] Icons, promo tile, listing copy, privacy policy (`store/`)
- [x] `npm run zip` packaging
- [ ] Screenshots 1280×800 (see `store/listing.md`)
- [ ] Host privacy policy publicly, submit to Chrome Web Store

## Phase 6: Script memory ✅
- Shot list pasted per Frameo project; names linked to canvas images once for the whole series
- Cards made from the shot list; every linked card checked against its shot before Generate
- Continuity columns carry forward and go into each prompt
- Frame chaining from the previous shot's last frame; chained shots wait for the render
- Optional Groq story check (warnings only)
- [ ] Probe a rendered `customVideo` shape on a real canvas to confirm the video URL lookup in `bridge.js`

## Phase 5: Hardening 💡
- Detect finished generations from Frameo's in-progress list instead of ETA +15%
- Selector smoke test against a saved Frameo page snapshot, to catch markup changes early
- Queue export / import
