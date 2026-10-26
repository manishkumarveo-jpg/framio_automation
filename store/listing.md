# ELEVIQUE: Chrome Web Store listing

Copy each field into the Developer Dashboard.

## Store listing tab

**Name**
ELEVIQUE

**Summary** (max 132 characters)
Bulk video & image queue for Frameo.ai. Write or paste many prompts, attach references, and send them one after another.

**Category**
Productivity (Tools also works)

**Language**
English

**Description**
ELEVIQUE turns Frameo.ai into a batch production tool. Instead of typing one prompt, waiting, and typing the next, you line up a whole episode's worth of shots and let ELEVIQUE send them for you while you keep working.

WHAT IT DOES
• Queue many prompts at once. Write them as cards or paste a list from a doc or spreadsheet.
• Videos and images in one queue. Switch any prompt between video and image.
• Settings per prompt. Aspect ratio, duration and quality as defaults, changeable for a single prompt.
• Reference images. Add first frame, end frame, reference and element images, shared across all prompts or per prompt. Upload once, reuse anywhere.
• Use what's already on your canvas. Scan your Frameo canvas and your labelled characters, props and locations appear by name, ready to attach.
• Quick prompt. Pick a character and a location, type what happens, and add it to the queue with both images attached.
• Cost before you spend. See the total credits, time estimate and balance after, before you start. The queue stops when credits run low.
• Respects Frameo's limits. Set how many generations run at once (2 on Starter/Pro, 5 on Studio) and ELEVIQUE waits for a free slot.
• Live progress. See each step as it happens, stop after the current item, and retry anything that failed with the reason shown.
• Shot-list memory. Paste an episode's shot list and get one card per shot, with the right characters, props and location attached and tagged. Any card that drifts from its shot is held back before it spends credits, continuity like wardrobe and time of day carries from shot to shot, and a shot can start from the previous shot's last frame.

HOW TO USE
1. Open your project on frameo.ai and open Quick Actions.
2. Click the ELEVIQUE icon to open the side panel.
3. Add prompts, set defaults and images, then click Generate.

PRIVACY
ELEVIQUE has no servers and collects no data. Your prompts and images are stored only in your browser and are sent only to frameo.ai, through your own logged-in session, when you click Generate. The optional story check sends the prompts you check to Groq, using your own Groq API key; it is off until you add one.

ELEVIQUE is an independent tool and is not affiliated with, endorsed by, or sponsored by Frameo.AI or Dashverse. Frameo is a trademark of its owner. You need your own Frameo account; generations use your Frameo credits.

**Graphic assets**
- Store icon 128×128: `public/icons/icon128.png`
- Small promo tile 440×280: `store/promo-small-440x280.png`
- Screenshots 1280×800 (at least 1, up to 5): take these yourself; see "Screenshots" below

## Privacy practices tab

**Single purpose**
Queue and submit prompts to the user's own Frameo.ai workspace, one after another, from a side panel.

**Permission justifications**
- `storage`: Saves the user's prompt queue, default settings and canvas scan results in the browser so they survive closing the panel.
- `unlimitedStorage`: Reference images the user uploads are stored locally so they can be reused; images can exceed the default 10 MB storage quota.
- `sidePanel`: The extension's whole interface is a side panel shown next to Frameo.
- Host permission `frameo.ai`: The content script runs only on frameo.ai to fill in the user's prompts, settings and reference images in Frameo's own Generate panels, click Generate, and read the credit balance and canvas images.
- Optional host permission `api.groq.com`: Requested only when the user saves their own Groq API key for the optional story check. It sends one shot's shot-list rows and prompts to Groq to warn about continuity problems, and, when the user uploads a written script, that script's text once to split it into shots. It is never requested otherwise.

**Remote code**
No, I am not using remote code. All JavaScript is included in the package.

**Data usage** (tick these)
- Collected data: none of the categories. (Prompts and images stay in local browser storage and go only to frameo.ai at the user's request. If the user adds their own Groq key, the prompts they story-check also go to Groq under that key; the developer receives nothing.)
- ☑ I do not sell or transfer user data to third parties, outside of the approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
Host `store/privacy-policy.html` publicly (GitHub Pages, Google Sites, Notion public page, or your website) and paste its URL.

## Distribution tab
- Visibility: Public
- Pricing: Free
- Regions: All regions

## Screenshots (1280×800, PNG or JPG)
Take these in Chrome with the side panel open next to Frameo, window sized so the capture is 1280×800:
1. Queue with 3–4 prompt cards, the Video | Image switch and the footer cost summary.
2. The image picker sheet with First / End / Reference / Element tabs.
3. The Canvas tab after a scan (Characters, Locations, Props).
4. The Running screen with progress steps.
5. The Done screen with the summary.
