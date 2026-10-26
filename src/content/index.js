// Runs on frameo.ai. Drives Frameo's Quick Actions "Generate Video" / "Generate Image" panels, one job at a time.

const norm = s => (s || '').toLowerCase().replace(/[\s▾]/g, '');
const TYPE_RE = { video: /generate\s*video/i, image: /generate\s*image/i };
const typeOf = text => Object.keys(TYPE_RE).find(t => TYPE_RE[t].test(text || '')) || null;

// DOM lookups, taken from Frameo's markup. An open panel is an overlay:
// <div><button back/><p>Generate Video</p></div> … editor … <button>Generate video <credit-amount/></button>
const FIND = {
  // Visible panels only: a closed panel can linger hidden in the page.
  title: () => [...document.querySelectorAll('p')].find(p =>
    /^generate\s+(video|image)$/i.test(p.textContent.trim()) && p.previousElementSibling?.tagName === 'BUTTON' && p.getClientRects().length),
  panel: () => {
    let el = FIND.title();
    while (el && !el.querySelector?.(EDITOR)) el = el.parentElement;
    return el;
  },
  editor: () => FIND.panel()?.querySelector(EDITOR),
  menu: re => [...(FIND.panel()?.querySelectorAll('button[data-slot="popover-trigger"]') || [])].find(b => re.test(norm(b.textContent))),
  popover: () => document.querySelector('[data-slot="popover-content"], [data-radix-popper-content-wrapper]'),
  // Video: "Generate video280~9m 15s"; Image: "Generate6" (no space before the cost, so no \b).
  // Not the video panel's "Generate audio" checkbox, which sits just above the real button.
  generate: () => {
    const all = [...(FIND.panel()?.querySelectorAll('button, [role=button]') || [])].filter(b =>
      /^\s*generate(?![a-z])/i.test(b.textContent) && b.getAttribute('role') !== 'checkbox' && !/^\s*generate\s*audio/i.test(b.textContent));
    return all.find(b => b.querySelector('[data-slot="credit-amount"]')) || all.at(-1);
  },
  cards: () => [...document.querySelectorAll('button[class*="group/card"]')], // Quick Actions "Create" cards
  balance: () => {
    const m = /([\d,]+)\s*credits/i.exec(document.querySelector('button[aria-label$="Credits"]')?.getAttribute('aria-label'));
    return m ? Number(m[1].replace(/,/g, '')) : NaN;
  },
};
// Video panel: rich tiptap editor; Image panel: a plainer text box.
const EDITOR = '.tiptap[contenteditable="true"], [contenteditable="true"][role="textbox"], textarea';
const MENUS = {
  video: { aspect: /^\d+:\d+/, duration: /^(auto|\d+s)/, resolution: /^\d+p/ },
  image: { aspect: /^(\d+:\d+|auto)/ }, // the image panel's "Auto ▾" chip is its aspect ratio
};
let menus = MENUS.video;
// Create cards turn grey with a "NO VIDEO" / "NO BULK" badge when the canvas selection doesn't fit them.
const unavailable = card => card.disabled || card.getAttribute('aria-disabled') === 'true' || /\bno\s*(video|image|bulk)\b/i.test(card.textContent);
const textOf = el => ('value' in el ? el.value : el.textContent);
const editorEmpty = () => { const ed = FIND.editor(); return ed && (!textOf(ed).trim() || ed.querySelector('.is-editor-empty')); };

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 10000) {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) {
    const v = fn();
    if (v) return v;
  }
  return null;
}
const step = name => chrome.runtime.sendMessage({ type: 'step', step: name }).catch(() => {});

// Radix listens to pointer events as well as click.
function press(el) {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Ev = type.startsWith('pointer') ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ev(type, { bubbles: true, cancelable: true }));
  }
}
const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

// "16:9" matches "16:9" or "16:9 Landscape", but "1" never matches "10s".
const matcher = value => {
  const want = norm(value);
  return text => { const t = norm(text); return t.startsWith(want) && !/\d/.test(t[want.length] || ''); };
};
const cost = btn => Number((btn.querySelector('[data-slot="credit-amount"]')?.textContent || btn.textContent).replace(/\D/g, ''));

// --- Panels ------------------------------------------------------------------
async function openPanel(type) {
  const open = () => typeOf(FIND.title()?.textContent);
  if (open() === type && FIND.editor()) return;
  step('Opening panel');
  if (open()) {
    press(FIND.title().previousElementSibling); // back to the Quick Actions list
    await waitFor(() => !FIND.title(), 3000);
  }
  let card = FIND.cards().find(c => TYPE_RE[type].test(c.textContent));
  if (card && unavailable(card)) { // a canvas selection greys out tools ("NO VIDEO"); Esc deselects
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    await sleep(500);
    card = FIND.cards().find(c => TYPE_RE[type].test(c.textContent));
    if (card && unavailable(card)) throw new Error(`Frameo has "Generate ${type}" greyed out because something is selected on the canvas. Click an empty spot on the canvas, then retry.`);
  }
  if (!card) { // Quick Actions shows one of its Image / Video / Audio tabs at a time
    const label = type[0].toUpperCase() + type.slice(1);
    const tab = [...document.querySelectorAll('button, [role=tab]')].find(b => b.textContent.trim() === label && !b.closest('.tl-shape'));
    if (tab) { press(tab); card = await waitFor(() => FIND.cards().find(c => TYPE_RE[type].test(c.textContent)), 3000); }
  }
  if (!card) throw new Error(`Open Quick Actions in Frameo ("Generate ${type}" not visible)`);
  press(card);
  if (!await waitFor(() => open() === type && FIND.editor(), 5000)) throw new Error(`Generate ${type} panel did not open`);
}

// A settings menu's choices differ per model (e.g. Veo 3.1 Fast offers different durations).
const choicesIn = (pop, kind) => !pop ? [] : [...new Set(
  [...pop.querySelectorAll('button, [role=option], [role=radio], [role=menuitemradio], [role=menuitem]')]
    .map(o => leafTexts(o)[0] || '').filter(t => menus[kind].test(norm(t))))];
async function menuChoices(kind) {
  const btn = FIND.menu(menus[kind]);
  if (!btn) return null;
  press(btn);
  const list = choicesIn(await waitFor(() => FIND.popover(), 2000), kind);
  escape();
  await waitFor(() => !FIND.popover(), 1000);
  return list.length ? list : null;
}

async function setMenu(kind, value) {
  const matches = matcher(value);
  const btn = FIND.menu(menus[kind]);
  if (!btn) throw new Error(`${kind} menu not found`);
  if (matches(btn.textContent)) return;
  press(btn);
  const opt = await waitFor(() => {
    const pop = FIND.popover();
    if (!pop) return null;
    const pick = sel => [...pop.querySelectorAll(sel)].find(el => matches(el.textContent));
    return pick('button, [role=option], [role=radio], [role=menuitemradio], [role=menuitem]')
      || [...pop.querySelectorAll('*')].find(el => !el.children.length && matches(el.textContent));
  }, 3000);
  if (!opt) {
    const have = choicesIn(FIND.popover(), kind);
    escape();
    throw new Error(`${kind} option "${value}" not found${have.length ? `. Choose ${have.join(', ')}` : ''}`);
  }
  press(opt);
  const applied = await waitFor(() => matches(FIND.menu(menus[kind])?.textContent), 3000);
  if (FIND.popover()) escape();
  if (!applied) throw new Error(`${kind} "${value}" did not apply`);
}

// --- Model -------------------------------------------------------------------
// Panel markup: <p>Model</p><button><span>Seedance 2.5</span><span>DEFAULT</span>…</button>.
// Names are compared against whole text pieces, so "Nano Banana 2" never matches "Nano Banana 2 Lite".
const clean = s => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const leafTexts = el => [el, ...el.querySelectorAll('*')].filter(x => !x.children.length).map(x => x.textContent.trim()).filter(Boolean);
const hasName = (el, name) => !!el && leafTexts(el).some(t => clean(t) === clean(name));
const modelButton = () => {
  const label = [...(FIND.panel()?.querySelectorAll('p') || [])].find(p => clean(p.textContent) === 'model');
  return label && (label.nextElementSibling?.tagName === 'BUTTON' ? label.nextElementSibling : label.parentElement.querySelector('button'));
};
// Options of the menu this button opened (Radix links them via aria-controls), else the first
// visible open menu. Frameo can keep other menus in the page, hidden.
const modelOptions = (btn = modelButton()) => {
  const visible = el => el && el.getClientRects().length;
  const linked = document.getElementById(btn?.getAttribute('aria-controls') || '');
  const pop = visible(linked) ? linked
    : [...document.querySelectorAll('[role=listbox], [role=menu], [data-slot="popover-content"], [data-radix-popper-content-wrapper]')].find(visible);
  return pop ? [...pop.querySelectorAll('[role=option], [role=menuitem], [role=menuitemradio], button')].filter(o => visible(o) && /\p{L}/u.test(o.textContent)) : [];
};
const optionName = o => leafTexts(o).find(t => /\p{L}/u.test(t) && !/^(default|new|beta|pro only)$/i.test(t)) || '';

// After picking, Frameo's button may split the name across pieces ("Veo 3.1" + "Fast"), so accept
// any change that contains every word of the name. Not used for the "already set" check, where
// "Nano Banana 2 Lite" would wrongly pass for "Nano Banana 2".
const showsModel = (btn, name, before) => !!btn && (hasName(btn, name)
  || (clean(btn.textContent) !== before && clean(name).split(' ').every(w => clean(btn.textContent).includes(w))));

async function setModel(name) {
  const btn = modelButton();
  if (!btn) throw new Error("Couldn't find the Model menu in Frameo's Generate panel");
  if (hasName(btn, name)) return;
  const before = clean(btn.textContent);
  press(btn);
  const opt = await waitFor(() => modelOptions().find(o => hasName(o, name)), 3000);
  if (!opt) {
    const seen = [...new Set(modelOptions().map(optionName))].join(', ');
    escape();
    throw new Error(`model "${name}" not found${seen ? `. Frameo has: ${seen}` : ''}`);
  }
  // Some menus react to the inner name element or to Enter rather than the outer option.
  const applied = () => showsModel(modelButton(), name, before);
  press(opt);
  let ok = await waitFor(applied, 1500);
  if (!ok) {
    const leaf = [opt, ...opt.querySelectorAll('*')].find(x => !x.children.length && clean(x.textContent) === clean(name));
    if (leaf?.isConnected) { press(leaf); ok = await waitFor(applied, 1500); }
  }
  if (!ok && opt.isConnected) {
    opt.focus();
    for (const type of ['keydown', 'keyup']) opt.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true }));
    ok = await waitFor(applied, 1500);
  }
  if (modelOptions().length) escape();
  if (!ok) throw new Error(`model "${name}" did not apply`);
}

// Read the model list from Frameo's own menu (opens the panel and its Model menu, then closes it).
async function listModels(type) {
  await openPanel(type);
  const btn = modelButton();
  if (!btn) throw new Error('Model menu not found');
  press(btn);
  const opts = await waitFor(() => (modelOptions().length ? modelOptions() : null), 3000);
  const names = [...new Set((opts || []).map(optionName).filter(Boolean))];
  escape();
  if (!names.length) throw new Error("Couldn't read Frameo's model list");
  return { models: names };
}

async function setPrompt(text) {
  const ed = FIND.editor();
  ed.focus();
  // ProseMirror/React ignore direct DOM edits; insertText goes through their input handling.
  if ('value' in ed) ed.select(); else document.execCommand('selectAll');
  document.execCommand('insertText', false, text);
  if (!await waitFor(() => norm(textOf(ed)) === norm(text), 3000)) throw new Error('prompt did not fill');
}

// --- Image slots -----------------------------------------------------------
const SLOT_LABEL = { first: 'First Frame', end: 'End Frame', ref: 'Reference', el: 'Images' };
const uploaded = {}; // "type:slot" -> file names this script put there last job

// First/End/Reference: <div><p>Label</p>…<input type=file></div>.
// Elements → Images: header row, then an "Add image element" menu button.
function slotBox(slot) {
  for (const p of FIND.panel()?.querySelectorAll('p') || []) {
    if (p.textContent.trim() !== SLOT_LABEL[slot]) continue;
    const box = slot === 'el' ? p.parentElement?.parentElement?.parentElement : p.parentElement;
    if (box?.querySelector(slot === 'el' ? '[title="Add image element"]' : 'input[type=file]')) return box;
  }
  return null;
}
// The image panel adds each reference as its own "Ref 1", "Ref 2" tile beside the empty
// "Reference" add-box, so a slot's images live in the row around it, not inside the box.
function slotRegion(slot) {
  let box = slotBox(slot);
  if (!box || slot !== 'ref') return box;
  const refs = [...FIND.panel().querySelectorAll('p')].filter(p => /^ref\s*\d+$/i.test(p.textContent.trim()));
  while (box && !refs.every(p => box.contains(p))) box = box.parentElement;
  return box;
}
const media = box => [...(box?.querySelectorAll('img, video, [style*="background-image"]') || [])].map(m => m.currentSrc || m.src || mediaUrl(m) || '').join('|');
const isRemove = b => /remove|delete|clear/i.test(`${b.getAttribute('aria-label') || ''} ${b.title || ''}`);

// Uploads come in as data URLs; canvas images as URLs (re-scanned if a signed URL has expired).
async function toFile({ name, type, dataUrl, url, canvasId, view = 0 }) {
  if (dataUrl) {
    const bin = atob(dataUrl.split(',')[1]);
    return new File([Uint8Array.from(bin, c => c.charCodeAt(0))], name, { type });
  }
  const get = async u => { const r = await fetch(u).catch(() => null); return r?.ok ? r.blob() : null; };
  let blob = await get(url);
  if (!blob && canvasId) {
    const fresh = scanCanvas().assets.find(a => a.id === canvasId)?.views[view];
    if (fresh) blob = await get(fresh);
  }
  if (!blob) throw new Error(`Couldn't read canvas image "${name}" (${new URL(url).host}). Zoom out in Frameo and re-scan.`);
  return new File([blob], name, { type: blob.type || 'image/png' });
}
function putFiles(input, files) {
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

// Fallback for upload areas that only react to drag-and-drop.
function dropFiles(target, files) {
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  for (const type of ['dragenter', 'dragover', 'drop']) {
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }
}

// Elements take no uploads: Frameo's "+" offers "From library" / "From canvas". "From canvas"
// waits for an image click; the bridge completes that pick with the tagged image's canvas shape.
const elementCount = () => +(/(\d+)\s*\/\s*\d+/.exec(slotBox('el')?.textContent || '')?.[1] || 0);
async function addElementsFromCanvas(list) {
  for (const f of list) {
    if (!f.url) throw new Error(`"${f.name}" is an uploaded file. Frameo Elements only take images from the canvas: put it on the canvas, re-scan, then tag that. Nothing was generated.`);
    const plus = slotBox('el')?.querySelector('[title="Add image element"]');
    if (!plus) throw new Error('Frameo won\'t take more image Elements here (model doesn\'t support them, or the cap is reached). Nothing was generated.');
    const before = elementCount();
    press(plus);
    const item = await waitFor(() => [...document.querySelectorAll('[role=menuitem]')].find(m => /from canvas/i.test(m.textContent)), 3000);
    if (!item) { escape(); throw new Error('The Elements "+" menu didn\'t open. Nothing was generated.'); }
    press(item);
    await sleep(300); // let Frameo switch into its pick mode
    await bridge('pickForElement', { shapeId: f.shapeId, url: f.url });
    if (!await waitFor(() => elementCount() > before, 30000)) { // Frameo saves the image to its library first
      throw new Error(`Frameo didn't add "${f.name}" as an Element. Nothing was generated.`);
    }
  }
}

async function clearSlot(slot) {
  for (let i = 0; i < 40 && media(slotRegion(slot)); i++) {
    const b = [...slotRegion(slot).querySelectorAll('button')].find(isRemove);
    if (!b) break;
    press(b);
    await sleep(300);
  }
  if (media(slotRegion(slot))) throw new Error(`Clear the ${SLOT_LABEL[slot]} slot by hand (no remove button found)`);
}

async function setSlot(type, slot, list = []) {
  const id = `${type}:${slot}`;
  let box = slotBox(slot);
  if (!box && slot !== 'el') { // "Source" section may be collapsed
    const toggle = [...FIND.panel().querySelectorAll('button')].find(b => /^source\b/i.test(b.textContent.trim()));
    if (toggle) { press(toggle); box = await waitFor(() => slotBox(slot), 2000); }
  }
  if (!box) { if (list.length) throw new Error(`${SLOT_LABEL[slot]} slot not found in Generate ${type}`); return; }

  const key = list.map(f => f.name).join('|');
  const region = slotRegion(slot);
  if (uploaded[id] === key && (!key || media(region))) return; // already in place
  if (uploaded[id] && media(region)) await clearSlot(slot);    // only clear what we added
  uploaded[id] = '';
  if (!list.length) return;
  if (slot === 'el') { await addElementsFromCanvas(list); uploaded[id] = key; return; }

  const before = media(slotRegion(slot));
  const files = await Promise.all(list.map(toFile));
  const picked = slot === 'first' ? files.slice(0, 1) : files;
  // New tiles may appear outside the old region (a new "Ref N" sibling), so re-find it each check.
  const shown = () => { const r = slotRegion(slot); return r && media(r) && media(r) !== before && !r.querySelector('[aria-busy="true"]'); };
  // Frameo re-draws the panel after selections and removals: look the slot up again, don't reuse it.
  const b = slotBox(slot), input = b?.querySelector('input[type=file]');
  if (!b || !input) throw new Error(`${SLOT_LABEL[slot]} slot isn't available in Frameo's panel right now. Nothing was generated.`);
  putFiles(input, picked);
  if (!await waitFor(shown, 5000)) dropFiles(b.querySelector('button, [role=button]') || b, picked);
  if (!await waitFor(shown, 60000)) throw new Error(`${SLOT_LABEL[slot]}: upload did not appear`);
  uploaded[id] = key;
}

// --- Target shot -------------------------------------------------------------
// Frameo puts a generation into the shot selected on the canvas; its panel names it
// ("Shot New" = Frameo picks an empty frame, "Shot V2V" = a selected video would be remixed).
const panelShot = () => [...(FIND.panel()?.querySelectorAll('p') || [])].map(p => p.textContent.trim()).find(t => /^shot\b/i.test(t)) || '';
const sameShot = (a, b) => clean(a) === clean(b);

// "Shot N" labels are role=button chips in the canvas overlay layer (each opens a shot menu).
const shotLabels = () => [...document.querySelectorAll('[role=button]')]
  .filter(el => /^shot\s*\d+$/i.test(el.textContent.trim()) && el.getClientRects().length);
const shotNum = s => +String(s).replace(/\D/g, '');

// Add a shot after the last one, the same way Frameo's "Add Shot" strip does, but through the
// canvas editor: it works wherever the canvas is scrolled (the strip only exists on screen).
async function newShotAtEnd() {
  const { number } = await bridge('addShot');
  return `Shot ${number}`;
}

// Talk to bridge.js, which runs in the page and can use Frameo's canvas editor.
let bridgeSeq = 0;
function bridge(cmd, args = {}) {
  return new Promise((resolve, reject) => {
    const id = `elq${++bridgeSeq}`;
    const done = () => { window.removeEventListener('message', onMsg); clearTimeout(timer); };
    const onMsg = e => {
      if (e.source !== window || e.data?.source !== 'elevique-bridge' || e.data.id !== id) return;
      done();
      if (e.data.ok) resolve(e.data); else reject(new Error(e.data.error));
    };
    const timer = setTimeout(() => {
      done();
      reject(new Error(document.documentElement.dataset.eleviqueBridge
        ? "Frameo's canvas is busy and didn't answer in time. Wait a moment, then retry. Nothing was generated."
        : "ELEVIQUE's canvas helper isn't running in this tab. Close and reopen the ELEVIQUE panel, then retry. Nothing was generated."));
    }, 8000);
    window.addEventListener('message', onMsg);
    window.postMessage({ source: 'elevique-content', id, cmd, args }, location.origin);
  });
}

// Frameo generates into the selected storyboard frame (its panel then names that shot instead of
// "Shot New"). So: find the shot's empty frame and select it through the canvas editor.
let targetFrame = null;
async function targetShot(name) {
  const { rows } = await bridge('shots');
  const row = rows.find(r => r.number === shotNum(name)) || rows.find(r => sameShot(r.name, name));
  if (!row) throw new Error(`${name} isn't on the canvas. Nothing was generated.`);
  const frame = row.frames.find(f => f.empty);
  if (!frame) throw new Error(`${name} has no empty frame to fill. Choose "new at end" for this prompt. Nothing was generated.`);
  await bridge('select', { id: frame.id });
  targetFrame = frame.id;
  if (!await waitFor(() => !/^shot\s*new$/i.test(panelShot()) && panelShot(), 3000)) {
    throw new Error(`Selected ${name}, but Frameo's panel still says "${panelShot() || 'no shot'}". Nothing was generated.`);
  }
}
const stillTargeted = async () => !targetFrame || (await bridge('selected')).ids.includes(targetFrame);

// --- Jobs --------------------------------------------------------------------
// Frameo prints the exact price on the Generate button once the model and settings are set
// (it differs per model, quality, duration and iterations). Read it without generating.
// Also reports which aspect/duration/quality choices this model offers, so the panel can show
// only those and flag a choice the model doesn't have before anything is spent.
// Image slots the open panel has right now (they change per model: Veo 3.1 Fast shows only End Frame).
async function availableSlots() {
  const frames = ['first', 'end', 'ref'];
  if (!frames.some(s => slotBox(s))) { // the "Source" section may be collapsed
    const toggle = [...FIND.panel().querySelectorAll('button')].find(b => /^source\b/i.test(b.textContent.trim()));
    if (toggle) { press(toggle); await waitFor(() => frames.some(s => slotBox(s)), 1500); }
  }
  return Object.keys(SLOT_LABEL).filter(s => slotBox(s));
}

async function priceOf(job) {
  const type = job.type || 'video';
  await openPanel(type);
  if (job.model) await setModel(job.model);
  // Learn the model's slots only in the clean "Shot New" state: with a filled frame selected,
  // Frameo hides or locks slots (e.g. references next to a first frame), which would mislead.
  const slots = /^shot\s*new$/i.test(panelShot()) ? await availableSlots() : undefined;
  menus = MENUS[type];
  const options = {}, absent = Object.keys(menus).filter(kind => !FIND.menu(menus[kind])); // controls this model lacks
  for (const kind of Object.keys(menus)) {
    if (absent.includes(kind)) continue;
    const list = await menuChoices(kind);
    if (list) options[kind] = list;
  }
  for (const kind of Object.keys(menus)) {
    if (!job[kind] || absent.includes(kind)) continue;
    if (options[kind] && !options[kind].some(matcher(job[kind]))) {
      return { cost: null, options, slots, absent, error: `${job.model || 'This model'} has no ${kind} "${job[kind]}". Choose ${options[kind].join(', ')}` };
    }
    await setMenu(kind, job[kind]);
  }
  const btn = await waitFor(() => FIND.generate(), 3000);
  if (!btn) throw new Error(`Generate ${type} button not found`);
  return { cost: cost(btn), options, slots, absent };
}

// The last frame of a rendered shot, as a PNG for the next shot's First Frame.
async function lastFrame(url, shot) {
  const r = await fetch(url).catch(() => null);
  if (!r?.ok) throw new Error(`Couldn't download ${shot}'s video (${new URL(url).host}). Nothing was generated.`);
  const src = URL.createObjectURL(await r.blob());
  try {
    const v = Object.assign(document.createElement('video'), { muted: true, preload: 'auto', src });
    await new Promise((ok, fail) => { v.onloadedmetadata = ok; v.onerror = () => fail(new Error(`${shot}'s video wouldn't load. Nothing was generated.`)); });
    if (!Number.isFinite(v.duration)) { v.currentTime = 1e9; await new Promise(ok => { v.ondurationchange = ok; setTimeout(ok, 3000); }); }
    v.currentTime = Math.max(0, v.duration - 0.05);
    await new Promise(ok => { v.onseeked = ok; });
    const canvas = Object.assign(document.createElement('canvas'), { width: v.videoWidth, height: v.videoHeight });
    canvas.getContext('2d').drawImage(v, 0, 0);
    return { name: `${shot.toLowerCase().replace(/\s+/g, '-')}-last-frame.png`, type: 'image/png', dataUrl: canvas.toDataURL('image/png') };
  } finally {
    URL.revokeObjectURL(src);
  }
}

async function runJob(job) {
  const type = job.type || 'video';
  targetFrame = null;
  if (job.chainFrom) { // before anything else, so a shot that hasn't rendered fails with nothing made
    step(`Last frame of ${job.chainFrom}`);
    const { url } = await bridge('shotVideo', { shot: job.chainFrom });
    job.images = { ...job.images, first: [await lastFrame(url, job.chainFrom)] };
  }
  if (job.newShot) { // append after the last shot; the panel remembers it so a retry reuses it
    job.shot = await newShotAtEnd();
    chrome.runtime.sendMessage({ type: 'step', step: `Created ${job.shot}`, shot: job.shot }).catch(() => {});
  }
  await openPanel(type);
  if (job.shot) {
    step(`Targeting ${job.shot}`);
    await targetShot(job.shot);
    if (!FIND.editor()) { await openPanel(type); await targetShot(job.shot); } // selecting can swap the panel
  }
  // Model first: switching it can reset the panel's images and settings.
  if (job.model) { step('Settings'); await setModel(job.model); }

  step('Images');
  for (const slot of Object.keys(SLOT_LABEL)) {
    if (job.images?.[slot]?.length || uploaded[`${type}:${slot}`]) await setSlot(type, slot, job.images?.[slot]);
  }
  step('Settings');
  menus = MENUS[type];
  // Some models have no control for a setting (no aspect menu: the image decides). Skip those.
  for (const kind of Object.keys(menus)) if (job[kind] && FIND.menu(menus[kind])) await setMenu(kind, job[kind]);
  step('Prompt');
  await setPrompt(job.prompt);

  step('Send');
  const btn = await waitFor(() => { const b = FIND.generate(); return b?.getAttribute('aria-disabled') !== 'true' && b; });
  if (!btn) throw new Error(`Generate ${type} button stayed disabled`);
  const before = FIND.balance(), price = cost(btn);
  if (Number.isNaN(before)) throw new Error('credits balance not found');
  if (before < price) throw new Error(`low credits: ${before} < ${price}`);
  // Last checks before spending: never remix a selected video, and land in the chosen shot.
  if (/v2v/i.test(panelShot())) throw new Error('A video is selected on the canvas, so Frameo would remix it (V2V). Click an empty spot, then retry. Nothing was generated.');
  // Picking Elements from the canvas can move the selection: put the target shot back (its Elements are kept per shot).
  if (job.shot && targetFrame && !await stillTargeted()) {
    await bridge('select', { id: targetFrame });
    await waitFor(() => !/^shot\s*new$/i.test(panelShot()), 3000);
  }
  if (job.shot && (/^shot\s*new$/i.test(panelShot()) || !await stillTargeted())) {
    throw new Error(`Frameo is no longer targeting ${job.shot} ("${panelShot() || 'no shot'}"). Nothing was generated.`);
  }

  const shapesBefore = document.querySelectorAll('.tl-shape').length, toastsBefore = toastTexts();
  const frameBefore = targetFrame ? await bridge('frameState', { id: targetFrame }).catch(() => null) : null;
  press(btn);

  // Accepted when Frameo charges credits, or the targeted shot's frame changes. Without a target
  // (Frameo decides) also accept a cleared prompt box or a new canvas item.
  let accepted = false, charged = false, failure = null;
  for (const end = Date.now() + 60000; Date.now() < end && !accepted && !failure; await sleep(500)) {
    failure = newErrorToast(toastsBefore);
    charged = FIND.balance() < before;
    if (charged) accepted = true;
    else if (frameBefore) {
      const now = await bridge('frameState', { id: targetFrame }).catch(() => null);
      accepted = !!now && now.signature !== frameBefore.signature;
    } else if (!targetFrame) {
      accepted = editorEmpty() || document.querySelectorAll('.tl-shape').length > shapesBefore;
    }
  }
  if (failure) throw new Error(`Frameo refused it: ${failure}`);
  if (!accepted) throw new Error('no confirmation from Frameo in 60s; check the canvas before re-running');

  // Frameo can accept, then fail and refund: watch briefly before calling it sent.
  for (const end = Date.now() + 15000; Date.now() < end; await sleep(500)) {
    const err = newErrorToast(toastsBefore);
    if (err) throw new Error(`Frameo reported a problem after sending: ${err}`);
    if (charged && FIND.balance() >= before) throw new Error("Frameo refunded the credits after sending, so it didn't generate. Check Frameo's notifications for the reason.");
  }
  return { balance: FIND.balance(), cost: price, shot: job.shot };
}

// Frameo's toast messages (e.g. "Failed to …"): error ones that appeared after we clicked Generate.
const toastTexts = () => [...document.querySelectorAll('[data-sonner-toast], [role="status"], [role="alert"], .Toastify__toast')]
  .map(t => t.textContent.trim()).filter(Boolean);
const newErrorToast = before => toastTexts().find(t => !before.includes(t)
  && /fail|error|couldn.?t|can.?t|cannot|reject|not allowed|insufficient|invalid|unable|blocked|moderat/i.test(t));

// --- Canvas reader -------------------------------------------------------------
// Works from what is drawn on screen: every image inside a canvas shape, every short
// text shape, and every shape whose text starts "Shot N". Shapes scrolled out of view
// aren't drawn, so the user zooms to fit first.
// ponytail: geometry heuristics (rows, label-below), switch to Frameo's shape data if they misfire.
const box = r => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
const union = (a, b) => ({ left: Math.min(a.left, b.left), top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) });
const inside = (r, f) => { const x = (r.left + r.right) / 2, y = (r.top + r.bottom) / 2; return x > f.left && x < f.right && y > f.top && y < f.bottom; };
function mediaUrl(el) {
  if (el.tagName === 'IMG') return el.currentSrc || el.src;
  return /url\(["']?(.*?)["']?\)/.exec(getComputedStyle(el).backgroundImage)?.[1] || null;
}

// groupOf() lives in parse.js, shared with the side panel (it regroups when the user renames).
function scanCanvas() {
  const shapes = [...document.querySelectorAll('.tl-shape')];
  if (!shapes.length) throw new Error('No canvas found. Switch Frameo to the Canvas view.');
  const images = [], texts = [], shots = [], seen = new Set();
  for (const shape of shapes) {
    const r = shape.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue; // culled or hidden
    const text = shape.innerText.trim();
    const shot = /^shot\s*\d+/i.exec(text);
    if (shot) shots.push({ name: shot[0].replace(/\s+/, ' '), r: box(r) });
    const media = [...shape.querySelectorAll('img, [style*="background-image"]')]
      .map(el => ({ url: mediaUrl(el), r: box(el.getBoundingClientRect()) }))
      .filter(m => m.url && !m.url.startsWith('data:image/svg') && m.r.right - m.r.left >= 16 && m.r.bottom - m.r.top >= 16);
    for (const m of media) {
      const key = `${m.url}|${Math.round(m.r.left)}|${Math.round(m.r.top)}`;
      if (!seen.has(key)) { seen.add(key); images.push({ ...m, shapeId: shape.getAttribute('data-shape-id'), caption: text.length < 60 ? text : '' }); }
    }
    if (!media.length && !shot && text && text.length < 80) texts.push({ text: text.replace(/\s*\n\s*/g, ' '), r: box(r) });
  }

  // Side-by-side images on one baseline (a character turnaround) become one asset.
  images.sort((a, b) => a.r.left - b.r.left);
  const rows = [];
  for (const im of images) {
    const h = im.r.bottom - im.r.top;
    const row = rows.find(c => Math.abs(c.r.top - im.r.top) < Math.max(6, h * 0.15)
      && im.r.left - c.r.right < Math.max(8, h * 0.15) && im.r.left >= c.r.left
      && (!im.caption || !c.caption || im.caption === c.caption));
    if (row) { row.items.push(im); row.r = union(row.r, im.r); row.caption ||= im.caption; }
    else rows.push({ items: [im], r: im.r, caption: im.caption });
  }

  // A label sits to the right of its image or just below it; each label goes to its nearest row.
  const gapTo = (t, r) => {
    const h = r.bottom - r.top;
    const besideY = t.top < r.bottom && t.bottom > r.top, besideX = t.left < r.right && t.right > r.left;
    if (besideY && t.left >= r.right - 4 && t.left - r.right <= Math.max(80, h * 1.2)) return t.left - r.right;
    if (besideX && t.top >= r.bottom - 4 && t.top - r.bottom <= Math.max(40, h * 0.5)) return t.top - r.bottom;
    return Infinity;
  };
  for (const t of texts) {
    let best = null, gap = Infinity;
    for (const row of rows) { const g = gapTo(t, row.r); if (g < gap) { gap = g; best = row; } }
    if (best && !(best.labelGap <= gap)) { best.label = t.text; best.labelGap = gap; }
  }

  const assets = new Map();
  for (const row of rows) {
    const w = row.r.right - row.r.left, h = row.r.bottom - row.r.top;
    const shot = shots.find(s => inside(row.r, s.r));
    if (shot) { shot.filled = (shot.filled || 0) + row.items.length; continue; } // generated output, not an asset
    let name = row.caption || row.label || '';
    if (!/\p{L}/u.test(name)) name = '';
    const group = groupOf(name, row.items.length, w, h);
    const id = `canvas:${name || row.items[0].url}`;
    const views = row.items.map(i => i.url), shapeIds = row.items.map(i => i.shapeId); // shape ids: for Elements
    if (assets.has(id)) { assets.get(id).views.push(...views); assets.get(id).shapeIds.push(...shapeIds); } // same name in two places
    else assets.set(id, { id, name, group, views, shapeIds });
  }
  const list = [...assets.values()].map(a => ({ ...a, views: [...new Set(a.views)].slice(0, 8) }));
  // Shot names come from the overlay labels too (they aren't canvas shapes).
  for (const l of shotLabels()) {
    const name = `Shot ${shotNum(l.textContent)}`;
    if (!shots.some(s => sameShot(s.name, name))) shots.push({ name });
  }
  return {
    assets: list,
    shots: shots.sort((a, b) => shotNum(a.name) - shotNum(b.name)).map(s => ({ name: s.name, filled: s.filled })),
    found: images.length,
  };
}

// Balance, project name, open panel, and per-type cost/ETA from the Create cards.
async function status() {
  const costs = {};
  for (const card of FIND.cards()) {
    const type = typeOf(card.textContent);
    if (!type) continue;
    const credit = /([\d,]+)/.exec(card.querySelector('[data-testid="credit-cost"]')?.getAttribute('aria-label') || '');
    const eta = [...card.querySelectorAll('span')].map(s => s.textContent.trim()).find(s => s.startsWith('~'));
    costs[type] = { cost: credit ? Number(credit[1].replace(/,/g, '')) : null, eta: eta || null };
  }
  const panel = typeOf(FIND.title()?.textContent);
  const gen = FIND.generate();
  if (panel && gen) costs[panel] = { ...costs[panel], cost: cost(gen) }; // live cost for current settings
  return {
    balance: FIND.balance(),
    project: document.title.replace(/\s*\|\s*Frameo\s*$/i, '').trim(),
    panel,
    costs,
    blocked: FIND.cards().some(c => typeOf(c.textContent) && unavailable(c)), // canvas selection greys out Generate
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const scan = async () => {
    const result = scanCanvas();
    try { // exact shot list (and which are empty) from the canvas editor
      const { rows } = await bridge('shots');
      if (rows.length) result.shots = rows.map(r => ({ name: r.name, filled: r.frames.some(f => !f.empty) }));
    } catch { /* keep the on-screen labels */ }
    return result;
  };
  const handlers = { status, job: () => runJob(msg.job), scan, models: () => listModels(msg.panel), price: () => priceOf(msg.job),
    shotVideo: () => bridge('shotVideo', { shot: msg.shot }) };
  if (!handlers[msg.type]) return;
  handlers[msg.type]()
    .then(r => reply({ ok: true, ...r }), e => reply({ ok: false, error: e.message }));
  return true;
});
