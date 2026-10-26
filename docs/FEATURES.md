# Features

Status: ✅ shipped · 🚧 in progress · 💡 planned

| Feature | Status | Where |
|---|---|---|
| Prompt cards (add, reorder, delete, clear sent) | ✅ | `src/sidepanel/sidepanel.js` |
| Paste a list: `prompt \| image \| 16:9 \| 5s \| 1080p \| model=… \| ref=a.png \| el=b.png,c.png` | ✅ | `src/utils/parse.js` |
| Video / Image switch per prompt and in header | ✅ | sidepanel |
| Per-prompt settings, hidden when a model lacks that control | ✅ | sidepanel |
| Models loaded from Frameo's own menu ("Load from Frameo") | ✅ | sidepanel → content |
| Image slots: First, End, Reference, Element (Elements: canvas images only) | ✅ | sidepanel |
| `@tags` in prompt text resolve to attached images (`@Ned`, `@Image2`) | ✅ | sidepanel |
| Canvas scan: Characters / Locations / Props by label | ✅ | `src/content/bridge.js` |
| Shot placement: new shot, auto empty frame, or existing shot as a take | ✅ | bridge + content |
| Price check: reads cost off Frameo's Generate button per model/settings | ✅ | content |
| Cost summary: total credits, ETA, balance after | ✅ | sidepanel footer |
| Concurrency limit (wait for free slot) | ✅ | `waitForSlot` in sidepanel |
| Low-credit stop, stop-after-current, retry failed | ✅ | `run` in sidepanel |
| Safe retry (only errors before Generate was clicked) | ✅ | sidepanel |
| History across sessions | ✅ | sidepanel |
| Migration from older textarea format | ✅ | `migrate` in sidepanel |
| Script tab: paste an episode shot list (Sheets/Docs/Excel/Word table), saved per Frameo project | ✅ | `parseShotList` in `src/utils/parse.js`, sidepanel |
| Upload an episode file: .xlsx / .csv / .docx table / text table read directly; a written script (.docx/.txt) split into shots by Groq, then reviewed before saving | ✅ | `src/utils/files.js`, `readEpisodeFile` in sidepanel |
| Prompt documents ("SHOT 01 — …" blocks with @TAG asset lists): read directly, no AI; card text = Subject + Camera + Continuity + Negative; supplementals (01A…) as optional extra cards; "memory/reference only" tags optional | ✅ | `parsePromptDoc` in parse.js |
| Shot-list names linked to canvas images once, remembered for every episode (`S.aliases`) | ✅ | sidepanel |
| Make cards from the shot list: assets in their slots, `@tags` in text, aimed at `Shot N` | ✅ | `fillFromShot` in sidepanel |
| Script check: missing/misplaced/untagged assets and unknown tags hold a card back (Fix, Send anyway) | ✅ | `scriptIssues` in sidepanel |
| Continuity line (wardrobe, time of day…) carried down the shot list and added to each prompt | ✅ | `stateFor` in parse.js |
| Frame chaining: a chained shot waits for the previous shot's render and starts from its last frame | ✅ | `nextJob` in sidepanel, `lastFrame` in content, `shotVideo` in bridge |
| Optional Groq story check (warnings only, user's own key) | ✅ | `storyCheck` in sidepanel |
| Finish detection from Frameo's in-progress list (instead of ETA +15%) | 💡 | see `ponytail:` note in sidepanel.js |
| Export / import queue as file | 💡 | |
