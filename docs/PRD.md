# PRD: ELEVIQUE

## Problem
Frameo.ai generates one video or image per prompt. Producing an episode means typing a prompt,
setting aspect/duration/quality, attaching references, clicking Generate, waiting, and repeating
dozens of times. It is slow, error-prone, and easy to overspend credits.

## Users
Creators producing episodic or multi-shot content on Frameo (Starter, Pro, Studio plans) who
already have characters, locations and props laid out on their Frameo canvas.

## Goal
Turn Frameo into a batch tool: line up a whole episode of shots, see the cost up front, and let
the extension submit them while the user keeps working.

## Requirements

| # | Requirement | Priority |
|---|---|---|
| R1 | Queue many prompts as cards, or paste a list (one per line, `prompt \| setting \| …`) | Must |
| R2 | Video and image prompts in one queue, switchable per prompt | Must |
| R3 | Default settings (aspect, duration, quality, model) overridable per prompt | Must |
| R4 | Reference images (first / end / reference / element), shared or per prompt, upload once | Must |
| R5 | Scan the Frameo canvas and attach labelled characters / locations / props by name | Must |
| R6 | Show total credits, time estimate and balance-after before running | Must |
| R7 | Stop when credits run low; respect plan concurrency (2 Starter/Pro, 5 Studio) | Must |
| R8 | Live progress, stop after current item, retry failures with the reason shown | Must |
| R9 | History of sent/failed jobs across sessions | Should |
| R10 | Quick prompt: character + location + action → card with both images attached | Should |
| R11 | Shot-list memory: cards made from an episode's shot list and held back when they drift from it | Must |
| R12 | Continuity across shots: state carried down the shot list; chained shots start from the previous shot's last frame | Must |
| R13 | Optional LLM story check (Groq, user's own key), warnings only | Could |

## Non-goals
- No servers, accounts, analytics or remote code. Data stays in `chrome.storage`; it goes only to frameo.ai, plus api.groq.com when the user adds their own Groq key for the optional story check.
- No use of Frameo's private API: everything happens through Frameo's own UI in the user's session.
- No support for sites other than frameo.ai.

## Success metrics
- A 20-shot batch runs unattended with zero manual clicks after **Generate**.
- No double charges: a job that failed after Generate was clicked is never auto-retried.
- Cost shown before run matches Frameo's charge.

## Constraints & risks
- Frameo markup changes can break DOM lookups (`FIND` in `src/content/index.js`). Keep lookups in one place.
- Canvas access depends on Frameo exposing `window.editor` (tldraw) in the page.
- Chrome ≥ 116 (side panel API).
