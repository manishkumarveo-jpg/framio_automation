// ELEVIQUE side panel: compose prompt cards, then send them through Frameo one by one.
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const cap = s => s[0].toUpperCase() + s.slice(1);
const MOD = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';

const svg = (d, w = 2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  video: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>'),
  image: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>'),
  coin: svg('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>', 2.4),
  refresh: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2.2),
  paste: svg('<rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/>'),
  chevron: svg('<path d="m6 15 6-6 6 6"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>', 2.2),
  check: svg('<path d="m5 12 5 5 9-10"/>', 3),
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  copy: svg('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  upload: svg('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  alert: svg('<path d="M12 7v6M12 17h.01"/>', 2.6),
  bolt: svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>'),
  stack: svg('<rect x="3" y="4" width="14" height="10" rx="2"/><path d="M7 18h10a2 2 0 0 0 2-2V8"/><path d="M11 22h10V12"/>', 1.8),
  spin: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="12" r="9" stroke="#ffffff1f"/><path d="M21 12a9 9 0 0 0-9-9" stroke="#8b8bf0"/></svg>',
};

// Tiny DOM builder. Strings become text nodes; `html` is only ever static icon markup.
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false || k === 'value') continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  el.append(...kids.flat(Infinity).filter(x => x != null && x !== false));
  if (props && 'value' in props) el.value = props.value;
  return el;
}
const icon = name => h('span', { class: 'i', 'aria-hidden': 'true', html: ICONS[name] });
document.querySelectorAll('[data-icon]').forEach(el => el.append(icon(el.dataset.icon)));

// --- Model -------------------------------------------------------------------
const OPTIONS = {
  aspect: ['Auto', '16:9', '9:16', '1:1', '4:3', '3:4', '21:9'],
  duration: ['Auto', '5s', '10s', '15s'],
  resolution: ['480p', '720p', '1080p'],
};
const LABEL = { model: 'Model', aspect: 'Aspect', duration: 'Duration', resolution: 'Quality' };
const SETTINGS = { video: ['model', 'aspect', 'duration', 'resolution'], image: ['model', 'aspect'] };
// Until "Load from Frameo" reads the real menu: the models Frameo lists on its pricing page.
const MODELS = {
  video: ['Seedance 2.5', 'Veo 3.1 Fast', 'Kling O3', 'Kling 3.0 Turbo', 'Grok Imagine Video 1.5', 'Gemini Omni 1.1 Flash', 'MiniMax H3', 'Happy Horse 1.1'],
  image: ['Nano Banana 2', 'Nano Banana 2 Lite', 'Seedream 5.0 Pro', 'Seedream 5 Lite', 'GPT Image 2.5', 'GPT Image 2', 'Grok Imagine Image 2.0'],
};
const CURRENT_MODEL = 'Current model'; // '' = leave whatever Frameo has selected
const SLOTS = { video: ['first', 'end', 'ref', 'el'], image: ['ref', 'el'] };
const SLOT = {
  first: { short: 'First', tab: 'First', name: 'first frame', hint: 'The video starts from this image.' },
  end: { short: 'End', tab: 'End', name: 'end frame', hint: 'The video ends on this image.' },
  ref: { short: 'Ref', tab: 'Reference', name: 'reference', hint: "Guides the look, style or character. It won't appear as a frame.", multi: true },
  el: { short: 'Element', tab: 'Element', name: 'element', hint: 'Characters or props to include.', multi: true },
};
const STEPS = ['Images', 'Settings', 'Prompt', 'Send'];
const plural = (n, type) => `${n} ${type}${n === 1 ? '' : 's'}`;

let S = {
  mode: 'video',
  defaults: { video: { aspect: '9:16', duration: 'Auto', resolution: '720p' }, image: { aspect: 'Auto' } },
  shared: { video: {}, image: {} }, // slot -> [image id], used by every card of that type
  cards: [],                        // { id, type, prompt, overrides, images, status, error }
  defaultsOpen: true,
  maxParallel: 2,                   // Frameo runs 2 at once on Starter/Pro, 5 on Studio
  inflight: [],                     // { type, done } for jobs Frameo may still be rendering
  view: 'queue',                    // queue | canvas
  canvas: { assets: [], shots: [], scannedAt: null }, // from the last canvas scan; images stay as URLs
  groupFix: {},                     // canvas asset id -> group the user picked
  names: {},                        // canvas image address (no query) -> name the user typed
  models: { ...MODELS },            // per type; replaced by "Load from Frameo"
  prices: {},                       // priceKey -> credits Frameo showed/charged for that model + settings
  menuOptions: {},                  // "type|model" -> { aspect, duration, resolution: [choices Frameo offers] }
  modelSlots: {},                   // "type|model" -> image slots its panel has, e.g. ['end']
  menuAbsent: {},                   // "type|model" -> settings it has no control for, e.g. ['aspect']
  aliases: {},                      // tagKey(shot-list name) -> canvas asset name; shared by every episode
};
let pricing = null;                 // "2 of 3" while Check exact cost runs
let loadingModels = false, modelsError = null;
const GROUPS = { character: 'Characters', location: 'Locations', prop: 'Props' };
let scanning = false, scanError = null, tpl = { char: '', loc: '', action: '' };
let waiting = false, skipWait = false;
let library = [];                   // { id, name, type, dataUrl }
let history = [];                   // every job sent or failed, newest first (see record())
let scripts = {};                   // Frameo project name -> { importedAt, columns, shots } (see parseEpisode)
let groq = { key: '', model: '' };  // optional story check; off while key is empty
let phase = 'compose';              // compose | running | done
let frameo = null, stopRequested = false, currentStep = null, runStart = null, focusCard = null, saveTimer;

const save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ state: S }), 300);
  scheduleAutoPrice();
};
const saveLibrary = () => chrome.storage.local.set({ library });
const newCard = (o = {}) => ({ id: crypto.randomUUID(), type: S.mode, prompt: '', overrides: {}, images: {}, ...o });
const img = id => library.find(i => i.id === id) || S.canvas.assets.find(a => a.id === id);
const thumb = a => a.dataUrl || a.views[0];
const nameOf = a => a.name || 'Unnamed';
const byName = n => library.find(i => i.name === n)?.id
  || S.canvas.assets.find(a => a.name && a.name.toLowerCase() === n.toLowerCase())?.id;
// One file per upload, one per view of a canvas asset (all views of a turnaround go in).
const filesOf = id => {
  const a = img(id);
  if (!a) return [];
  if (a.dataUrl) return [{ name: a.name, type: a.type, dataUrl: a.dataUrl }];
  const base = nameOf(a).replace(/[^\w -]+/g, '').trim() || 'canvas';
  return a.views.map((url, view) => ({ name: `${base}${a.views.length > 1 ? `-${view + 1}` : ''}.png`, url, canvasId: a.id, view, shapeId: a.shapeIds?.[view] }));
};
// Video and image prompts are separate sections; the header switch picks which one is shown and run.
const section = (type = S.mode) => S.cards.filter(c => c.type === type);
const ready = (type = S.mode) => section(type).filter(c => c.prompt.trim());
const settingsOf = c => Object.fromEntries(SETTINGS[c.type].map(k => [k, c.overrides[k] ?? S.defaults[c.type][k]]));
// @tags are per prompt: attach images to the card first, then "@Image2" / "@Ned" in the text
// refers to one of them. Each attached image's tag is the label set on this card, else its
// name, else ImageN by position.
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tagName = a => (a.dataUrl ? a.name.replace(/\.[a-z0-9]{2,4}$/i, '') : a.name);
const tagKey = s => s.toLowerCase().replace(/_/g, ' '); // "@AMBER_CHAPTER" matches "Amber Chapter"
function attached(c) {
  const list = SLOTS[c.type].flatMap(slot => (c.images[slot] || []).map(id => ({ id, slot, asset: img(id) }))).filter(x => x.asset);
  const used = new Set();
  return list.map((x, k) => {
    let label = c.labels?.[x.id] || (x.asset.name ? tagName(x.asset) : `Image${k + 1}`);
    if (used.has(tagKey(label))) label = `${label}${k + 1}`;
    used.add(tagKey(label));
    return { ...x, label };
  });
}
// One pass over a card's prompt: tags of its attached images, and "@words" that match none of them.
function scanTags(c) {
  const found = [], unknown = [], text = c.prompt, low = tagKey(text);
  const all = attached(c).sort((x, y) => y.label.length - x.label.length); // "@Image12" beats "@Image1"
  for (let i = low.indexOf('@'); i >= 0; i = low.indexOf('@', i + 1)) {
    if (i > 0 && !/[\s([{"'“]/.test(low[i - 1])) continue; // "me@lucius.com" isn't a tag
    const x = all.find(t => { const n = tagKey(t.label); return low.startsWith(n, i + 1) && !/[\p{L}\d]/u.test(low[i + 1 + n.length] || ''); });
    if (x) { if (!found.some(f => f.id === x.id)) found.push(x); continue; }
    const word = /^[\p{L}\d][\p{L}\d_-]*/u.exec(text.slice(i + 1))?.[0];
    if (word && !unknown.includes(word)) unknown.push(word);
  }
  return { found, unknown };
}
// Frameo gets readable text: "@Ned walks in" → "Ned walks in".
const plainPrompt = c => scanTags(c).found.reduce((t, x) =>
  t.replace(new RegExp(`@${escapeRe(x.label).replace(/[ _]/g, '[ _]')}`, 'gi'), x.label), c.prompt.trim());
const imageIds = (c, slot) => c.images[slot] ?? S.shared[c.type][slot] ?? [];
const costOf = type => frameo?.costs?.[type]?.cost ?? null;
// Each model offers its own aspect/duration/quality choices; learned from Frameo during price checks.
const optionKey = (type, model) => `${type}|${model || ''}`;
const learned = (k, type, model) => (k === 'model' ? null : S.menuOptions[optionKey(type, model)]?.[k]);
const sameChoice = (a, b) => a.toLowerCase() === b.toLowerCase();
const optionsFor = (k, cur, type, model) => {
  const list = k === 'model' ? S.models[type] : learned(k, type, model) || OPTIONS[k];
  return cur && !list.some(v => sameChoice(v, cur)) ? [cur, ...list] : list;
};
// Settings on this prompt that its model doesn't offer (known once Frameo's menus were read).
const unsupported = c => {
  const s = settingsOf(c);
  return SETTINGS[c.type].filter(k => { const l = learned(k, c.type, s.model); return l && s[k] && !l.some(v => sameChoice(v, s[k])); });
};
const unsupportedNote = c => unsupported(c).map(k => {
  const s = settingsOf(c);
  return `${s.model || 'This model'} has no ${LABEL[k].toLowerCase()} ${s[k]}. Choose ${learned(k, c.type, s.model).join(', ')}.`;
}).join(' ') + ' Skipped until fixed.';

// Settings a model has no control for (e.g. no aspect menu): hidden on the card, not sent.
const absentFor = (type, model) => S.menuAbsent?.[optionKey(type, model)] || [];

// Image slots each model accepts, learned with the price check (Veo 3.1 Fast: End Frame only).
const slotsOf = (type, model) => S.modelSlots[optionKey(type, model)];
const missingSlots = c => {
  const have = slotsOf(c.type, settingsOf(c).model);
  return have ? SLOTS[c.type].filter(s => imageIds(c, s).length && !have.includes(s)) : [];
};
// Frameo Elements only take canvas (or library) images, never uploaded files.
const uploadsInElements = c => imageIds(c, 'el').map(img).filter(a => a?.dataUrl);
// A prompt that can't run as set up: skipped in a batch until fixed.
const blocked = c => missingSlots(c).length > 0 || unsupported(c).length > 0 || uploadsInElements(c).length > 0
  || (!c.sendAnyway && scriptIssues(c)?.block.length > 0);
function slotNote(c) {
  const miss = missingSlots(c), model = settingsOf(c).model;
  const fits = Object.entries(S.modelSlots)
    .filter(([k, have]) => k.startsWith(`${c.type}|`) && k !== optionKey(c.type, model) && miss.every(s => have.includes(s)))
    .map(([k]) => k.split('|')[1]).filter(Boolean);
  return `${model || 'This model'} doesn't take ${miss.map(s => SLOT[s].tab).join(' or ')} images. `
    + `Remove them${fits.length ? ` or switch to ${fits.slice(0, 2).join(' or ')}` : ' or pick another model'}. Skipped until fixed.`;
}

// Price depends on type + model + quality/duration/aspect (Frameo shows it on the Generate
// button). Exact once checked or charged; otherwise the mode's default price as an estimate.
const priceKey = c => JSON.stringify({ type: c.type, ...settingsOf(c) });
function costFor(c) {
  const known = S.prices[priceKey(c)];
  return known != null ? { cost: known, exact: true } : { cost: costOf(c.type), exact: false };
}
const priceFailed = {}; // priceKey -> error; not retried automatically (manual "Check exact cost" still can)
const unpriced = (auto) => [...new Map(ready().map(c => [priceKey(c), c])).values()]
  .filter(c => !costFor(c).exact && !(auto && priceFailed[priceKey(c)])); // slots are learned along the way when possible

async function checkPrices(auto = false) {
  const todo = unpriced(auto);
  let k = 0;
  for (const c of todo) {
    if (phase !== 'compose') break;
    pricing = `${++k} of ${todo.length}`;
    renderFooter();
    const r = await send({ type: 'price', job: { type: c.type, ...settingsOf(c) } }).catch(e => ({ ok: false, error: e.message }));
    if (r.ok && r.options) S.menuOptions[optionKey(c.type, settingsOf(c).model)] = r.options;
    if (r.ok && r.slots) S.modelSlots[optionKey(c.type, settingsOf(c).model)] = r.slots;
    if (r.ok && r.absent) S.menuAbsent[optionKey(c.type, settingsOf(c).model)] = r.absent;
    if (r.ok && r.cost != null) { S.prices[priceKey(c)] = r.cost; continue; }
    if (r.ok) { priceFailed[priceKey(c)] = r.error; continue; } // a choice this model lacks: the card shows it in red
    // Selection / connection problems clear up on their own: retry automatically once they do.
    if (FATAL.test(r.error) || /greyed out/i.test(r.error)) break;
    priceFailed[priceKey(c)] = r.error;
    c.error = `Couldn't read the price: ${r.error}`;
  }
  pricing = null;
  chrome.storage.local.set({ state: S });
  render();
}

// Auto-check: a short pause after the queue or connection changes, then read any missing prices.
// It sets Frameo's panel to each model/settings combo to read the button, like a run would.
let priceTimer;
function scheduleAutoPrice() {
  clearTimeout(priceTimer);
  priceTimer = setTimeout(() => {
    if (phase === 'compose' && !pricing && connected() && unpriced(true).length) checkPrices(true);
  }, 1500);
}

async function loadModels(type) {
  loadingModels = true;
  modelsError = null;
  render();
  try {
    const r = await send({ type: 'models', panel: type });
    if (!r.ok) throw new Error(r.error);
    S.models[type] = r.models;
    save();
  } catch (e) {
    modelsError = e.message;
  }
  loadingModels = false;
  render();
}
function etaMin(type) {
  const m = /(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?/.exec((frameo?.costs?.[type]?.eta || '').replace('~', ''));
  return m ? (+m[1] || 0) * 60 + (+m[2] || 0) + (+m[3] || 0) / 60 : 0;
}
// Where a prompt lands. Default 'new': a new shot after the last one (Shot 70 → Shot 71).
// 'auto': Frameo picks an empty frame. 'Shot 40': that existing shot, as another take.
const lastShot = () => S.canvas.shots.at(-1)?.name;
function shotJob(c) {
  const mode = c.shot || 'new';
  if (mode === 'auto') return {};
  if (mode !== 'new') return { shot: mode };
  if (c.createdShot) return { shot: c.createdShot }; // retry: reuse the empty shot it already made
  return { newShot: true, lastShot: lastShot() };
}
function rememberShot(name) {
  if (!name || S.canvas.shots.some(s => s.name === name)) return;
  S.canvas.shots.push({ name });
  S.canvas.shots.sort((a, b) => +a.name.replace(/\D/g, '') - +b.name.replace(/\D/g, ''));
}

const jobOf = c => ({
  type: c.type, prompt: finalPrompt(c), ...settingsOf(c), ...shotJob(c),
  images: Object.fromEntries(SLOTS[c.type].map(s => [s, imageIds(c, s).flatMap(filesOf)])),
  ...(chainsFrom(c) && { chainFrom: canvasShotOf(c, shotOf(c).n - 1) }), // content script grabs its last frame
});

// "prompt | image | 16:9 | ref=a.png" lines → cards (or per-line errors), via parse.js.
function fromText(text) {
  return parseLines(text).map(j => {
    if (j.error) return { line: j.line, error: j.error };
    const type = j.type || S.mode;
    const overrides = {}, images = {};
    for (const k of SETTINGS[type]) if (j[k]) overrides[k] = j[k];
    for (const [slot, names] of Object.entries(j.images || {})) {
      if (!SLOTS[type].includes(slot)) return { line: j.line, error: `${type}s have no ${SLOT[slot].name} slot` };
      const ids = names.map(byName);
      const missing = names.filter((_, k) => !ids[k]);
      if (missing.length) return { line: j.line, error: `no image named ${missing.join(', ')}` };
      images[slot] = ids;
    }
    return { card: newCard({ type, prompt: j.prompt, overrides, images, ...(j.shot && { shot: j.shot }) }) };
  });
}

// Earlier versions kept a textarea + image list; turn them into cards once.
function migrate(old) {
  library = (old.images || []).map(i => ({ id: crypto.randomUUID(), name: i.name, type: i.type, dataUrl: i.dataUrl }));
  (old.images || []).forEach((i, k) => { if (i.use) (S.shared.video[i.use] ||= []).push(library[k].id); });
  for (const f of ['aspect', 'duration', 'resolution']) if (old[f]) S.defaults.video[f] = old[f];
  S.cards = fromText(old.prompts || '').filter(r => r.card).map(r => r.card);
  saveLibrary();
  save();
}

chrome.storage.local.get(['state', 'library', 'history', 'scripts', 'groq', 'groqCache', 'prompts', 'images', 'aspect', 'duration', 'resolution']).then(s => {
  history = s.history || [];
  scripts = s.scripts || {};
  groq = s.groq || groq;
  groqCache = s.groqCache || {};
  if (s.state) S = { ...S, ...s.state };
  S.canvas.assets.forEach(a => { a.auto ??= a.name; a.autoGroup ??= a.group; });
  if (!S.slotsV2) { S.modelSlots = {}; S.slotsV2 = true; } // drop slot lists learned while a frame was selected
  // Tags used to go in as References; tagged images now belong in Elements.
  for (const c of S.cards) for (const id of Object.keys(c.labels || {})) {
    if (!c.images.ref?.includes(id)) continue;
    c.images.ref = c.images.ref.filter(x => x !== id);
    if (!c.images.ref.length) delete c.images.ref;
    if (!(c.images.el ||= []).includes(id)) c.images.el.push(id);
  }
  library = s.library || [];
  if (!s.state && (s.prompts || s.images)) migrate(s);
  S.cards.forEach(c => {
    if (c.status === 'running') c.status = 'pending';
    if (c.ai?.busy) delete c.ai; // panel closed mid story check
  });
  if (S.cards.some(c => c.status)) phase = 'done';
  render();
  refresh();
});

// --- Frameo tab --------------------------------------------------------------
async function send(msg) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!/^https:\/\/([^/]+\.)?frameo\.ai\//.test(tab?.url || '')) throw new Error('Open your Frameo project in this tab');
  // Jobs, scans and price checks use the canvas helper: make sure it's in the page (it runs once per page).
  if (msg.type !== 'status') {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/bridge.js'], world: 'MAIN' }).catch(() => {});
  }
  try { return await chrome.tabs.sendMessage(tab.id, msg); }
  catch { throw new Error('Reload the Frameo tab to connect'); }
}

async function refresh() {
  if (phase === 'running') return;
  let next;
  try { const r = await send({ type: 'status' }); next = r.ok ? r : { error: r.error }; }
  catch (e) { next = { error: e.message }; }
  if (JSON.stringify(next) === JSON.stringify(frameo)) return;
  frameo = next;
  renderHeader();
  renderFooter();
  scheduleAutoPrice();
}
chrome.tabs.onActivated.addListener(refresh);
chrome.tabs.onUpdated.addListener((_id, info) => { if (info.status === 'complete') refresh(); });
setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, 5000);
chrome.runtime.onMessage.addListener(msg => {
  if (msg.type !== 'step' || phase !== 'running') return;
  currentStep = msg.step;
  if (msg.shot) { // a new shot was made for the running prompt: remember it so a retry reuses it
    const c = S.cards.find(x => x.status === 'running');
    if (c) c.createdShot = msg.shot;
    rememberShot(msg.shot);
    save();
  }
  renderMain();
});

function connection() {
  if (!frameo) return ['warn', ['Checking Frameo…']];
  if (frameo.error) return [/reload|open your/i.test(frameo.error) ? 'err' : 'warn', [frameo.error]];
  if (!Number.isFinite(frameo.balance)) return ['warn', ["Can't read your credit balance"]];
  if (!frameo.panel && !Object.keys(frameo.costs).length) return ['warn', ['Open ', h('b', {}, 'Quick Actions'), ' in Frameo to connect']];
  if (frameo.blocked) return ['warn', ['Something is selected on the canvas, so Frameo greys out Generate. ', h('b', {}, 'Click an empty spot'), '.']];
  return ['ok', ['Connected to ', h('b', {}, frameo.project || 'Frameo')]];
}
const connected = () => connection()[0] === 'ok';

// --- Actions -----------------------------------------------------------------
function addCard(after) {
  const c = newCard();
  S.cards.splice(after ? S.cards.indexOf(after) + 1 : S.cards.length, 0, c);
  focusCard = c.id;
  save();
  render();
}

function setType(c, type) {
  c.type = type;
  for (const k of Object.keys(c.overrides)) if (!SETTINGS[type].includes(k)) delete c.overrides[k];
  for (const s of Object.keys(c.images)) if (!SLOTS[type].includes(s)) delete c.images[s];
  save();
  render();
}

function clearSent() {
  S.cards = S.cards.filter(c => c.status !== 'sent');
  S.cards.forEach(c => { c.status = null; });
  phase = 'compose';
  save();
  render();
}

// Frameo caps how many generations render at once. Each sent job holds a slot until
// Frameo's own time estimate (+15%) has passed.
// ponytail: estimated finish times, read Frameo's in-progress list once its markup is known.
const etaMs = type => (etaMin(type) || (type === 'video' ? 10 : 2)) * 60000 * 1.15;
const clock = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
async function waitForSlot() {
  for (;;) {
    S.inflight = S.inflight.filter(j => j.done > Date.now());
    if (S.inflight.length < S.maxParallel || stopRequested || skipWait) break;
    waiting = true;
    currentStep = `Waiting for a free slot · ${clock(Math.min(...S.inflight.map(j => j.done)) - Date.now())}`;
    renderMain();
    renderFooter();
    await sleep(1000);
  }
  if (waiting) { waiting = false; renderFooter(); }
  skipWait = false;
}

// Errors that would break every remaining item stop the batch; anything else fails just that item.
const FATAL = /credits|quick actions|reload|open your frameo|panel did not open|greyed out/i;
// Errors before Generate was clicked are safe to retry; after it, a retry could pay twice.
const AFTER_SUBMIT = /no confirmation|refused it|after sending|refunded/i;

// Next card to send, in queue order, except that a chained shot waits until the shot before it has
// a rendered video on the canvas (its last frame becomes this shot's First Frame). Other cards
// go ahead meanwhile. Fails the card if the shot before it was never sent and isn't in this batch.
async function nextJob(list) {
  for (;;) {
    const todo = list.filter(c => c.status === 'pending');
    if (!todo.length || stopRequested) return null;
    let waitingOn = null;
    for (const c of todo) {
      if (!chainsFrom(c)) return c;
      const n = shotOf(c).n - 1, prev = canvasShotOf(c, n);
      const pendingPrev = list.some(x => x !== c && shotOf(x) && keyOf(shotOf(x)) === n && (x.status === 'pending' || x.status === 'running'));
      if (!pendingPrev) {
        const r = await send({ type: 'shotVideo', shot: prev }).catch(e => ({ ok: false, error: e.message }));
        if (r.ok) return c;
        if (!sentBefore(c, n)) {
          c.status = 'failed';
          c.error = `${prev} wasn't sent and has no video, so there's no last frame to start from. Nothing was generated.`;
          record(c, { ok: false, error: c.error });
          save();
          render();
          continue;
        }
      }
      waitingOn ||= { c, prev };
    }
    if (!waitingOn) continue; // every chained card just failed; look again
    const { c, prev } = waitingOn;
    c.status = 'running';
    for (let s = 15; s > 0 && !stopRequested && !skipWait; s--) {
      currentStep = `Waiting for ${prev} to finish rendering · checks again in ${s}s`;
      renderMain();
      await sleep(1000);
    }
    skipWait = false;
    c.status = 'pending';
  }
}

async function run(list) {
  if (!S.cards.some(c => c.status === 'sent')) runStart = frameo?.balance; // keep the start of a retried batch
  phase = 'running';
  S.view = 'queue';
  stopRequested = false;
  list.forEach(c => { c.status = 'pending'; c.error = null; });
  render();
  for (let c; !stopRequested && (c = await nextJob(list));) {
    c.status = 'running';
    currentStep = null;
    renderMain();
    await waitForSlot();
    if (stopRequested) { c.status = 'pending'; break; }
    currentStep = null;
    const attempt = () => send({ type: 'job', job: jobOf(c) }).catch(e => ({ ok: false, error: e.message }));
    let r = await attempt();
    if (!r.ok && !FATAL.test(r.error) && !AFTER_SUBMIT.test(r.error) && !stopRequested) {
      currentStep = 'Retrying';
      renderMain();
      await sleep(1500);
      r = await attempt();
    }
    c.status = r.ok ? 'sent' : 'failed';
    c.error = r.ok ? null : r.error;
    record(c, r);
    if (r.ok) S.inflight.push({ type: c.type, done: Date.now() + etaMs(c.type) });
    if (r.ok && Number.isFinite(r.cost)) S.prices[priceKey(c)] = r.cost; // what Frameo actually charged
    if (r.ok) { rememberShot(r.shot); delete c.createdShot; } // filled now; only failed runs reuse their shot
    if (r.ok && frameo) frameo.balance = r.balance;
    save();
    render();
    if (!r.ok && FATAL.test(r.error)) break;
    await sleep(r.ok ? 2000 : 500);
  }
  phase = 'done';
  currentStep = null;
  save();
  render();
  refresh();
}

async function addImages(files) {
  const ids = [];
  for (const file of files) {
    const dataUrl = await new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(r.result);
      r.onerror = fail;
      r.readAsDataURL(file);
    });
    let entry = library.find(i => i.name === file.name); // same name replaces
    if (entry) Object.assign(entry, { type: file.type, dataUrl });
    else library.push(entry = { id: crypto.randomUUID(), name: file.name, type: file.type, dataUrl });
    ids.push(entry.id);
  }
  saveLibrary();
  return ids;
}

function deleteImage(id) {
  library = library.filter(i => i.id !== id);
  const strip = map => { for (const s in map) { map[s] = map[s].filter(x => x !== id); if (!map[s].length) delete map[s]; } };
  strip(S.shared.video);
  strip(S.shared.image);
  S.cards.forEach(c => strip(c.images));
  if (pick) pick.selected = pick.selected.filter(x => x !== id);
  saveLibrary();
  save();
  render();
  if (pick) renderPicker();
}

// --- Rendering ---------------------------------------------------------------
function render() { renderHeader(); renderMain(); renderFooter(); }

function renderHeader() {
  $('logo').replaceChildren(icon(S.mode));
  $('modes').replaceChildren(...['video', 'image'].map(t => h('button', {
    role: 'radio', 'aria-checked': String(S.mode === t), disabled: phase === 'running',
    onclick: () => { S.mode = t; save(); render(); },
  }, icon(t), cap(t), costOf(t) != null && h('small', {}, String(costOf(t))),
    ready(t).length ? h('span', { class: 'badge', 'aria-label': `${ready(t).length} queued` }, String(ready(t).length)) : null)));
  const bal = frameo?.balance;
  $('credits').replaceChildren(icon('coin'), Number.isFinite(bal) ? bal.toLocaleString() : '—');
  const [cls, text] = connection();
  $('conn').className = `conn ${cls}`;
  $('conn').replaceChildren(h('span', { class: 'dot' }), h('span', { class: 'txt' }, text),
    h('button', { class: 'icon-btn', 'aria-label': 'Re-check Frameo tab', title: 'Re-check', onclick: refresh }, icon('refresh')));
  const tab = (view, label, count) => h('button', {
    role: 'tab', 'aria-selected': String(S.view === view), disabled: phase === 'running' && view !== 'queue',
    onclick: () => { S.view = view; save(); render(); },
  }, label, count ? h('span', { class: 'badge' }, String(count)) : null);
  $('tabs').setAttribute('role', 'tablist');
  $('tabs').replaceChildren(tab('queue', 'Queue', ready().length), tab('script', 'Script', scriptOf()?.shots.length),
    tab('canvas', 'Canvas', S.canvas.assets.length),
    tab('history', 'History', history.length));
}

// --- History -----------------------------------------------------------------
// Every job ELEVIQUE sends or fails, kept in this browser across sessions.
const HISTORY_MAX = 1000; // ponytail: newest 1,000 kept; Export CSV keeps the rest if needed
const saveHistory = () => chrome.storage.local.set({ history });
function record(c, r) {
  const s = settingsOf(c);
  history.unshift({
    id: crypto.randomUUID(), at: Date.now(), project: frameo?.project || '', type: c.type, prompt: c.prompt.trim(),
    model: s.model || '', aspect: s.aspect || '', duration: s.duration || '', resolution: s.resolution || '',
    shot: (r.ok && r.shot) || c.createdShot || (c.shot && c.shot !== 'new' && c.shot !== 'auto' ? c.shot : ''),
    scriptShot: shotOf(c) ? keyOf(shotOf(c)) : null, // which shot-list row this was, whatever canvas shot it landed in
    images: SLOTS[c.type].flatMap(slot => imageIds(c, slot).map(id => ({ slot, id, name: img(id) ? nameOf(img(id)) : 'removed image' }))),
    card: { overrides: { ...c.overrides }, images: structuredClone(c.images), labels: { ...c.labels } }, // for Reuse
    cost: r.ok && Number.isFinite(r.cost) ? r.cost : null,
    status: r.ok ? 'sent' : 'failed', error: r.ok ? null : r.error,
  });
  if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
  saveHistory();
}

let histFilter = { q: '', status: 'all', type: 'all' }, clearArmed = false;
const histMatches = e => (histFilter.status === 'all' || e.status === histFilter.status)
  && (histFilter.type === 'all' || e.type === histFilter.type)
  && (!histFilter.q || `${e.prompt} ${e.model} ${e.shot} ${e.project}`.toLowerCase().includes(histFilter.q.toLowerCase()));

function reuse(e) {
  const keep = ids => ids.filter(id => img(id)); // drop images deleted since
  const images = Object.fromEntries(Object.entries(e.card.images || {}).map(([s, ids]) => [s, keep(ids)]).filter(([, ids]) => ids.length));
  const c = newCard({ type: e.type, prompt: e.prompt, overrides: { ...e.card.overrides }, images, labels: { ...e.card.labels } });
  S.cards.push(c);
  S.mode = e.type;
  S.view = 'queue';
  focusCard = c.id;
  save();
  render();
}

function exportCsv() {
  const cols = ['date', 'project', 'type', 'status', 'model', 'aspect', 'duration', 'quality', 'shot', 'credits', 'prompt', 'images', 'error'];
  const cell = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = history.filter(histMatches).map(e => [new Date(e.at).toISOString(), e.project, e.type, e.status, e.model, e.aspect,
    e.duration, e.resolution, e.shot, e.cost, e.prompt, e.images.map(i => `${SLOT[i.slot].tab}: ${i.name}`).join('; '), e.error].map(cell).join(','));
  const url = URL.createObjectURL(new Blob([[cols.join(','), ...rows].join('\n')], { type: 'text/csv' }));
  h('a', { href: url, download: `elevique-history-${new Date().toISOString().slice(0, 10)}.csv` }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dayLabel = t => {
  const d = new Date(t).toDateString(), today = new Date();
  if (d === today.toDateString()) return 'Today';
  if (d === new Date(today - 864e5).toDateString()) return 'Yesterday';
  return new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

function histRow(e) {
  const meta = [new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), e.model,
    [e.aspect, e.duration, e.resolution].filter(Boolean).join(' · '), e.shot, e.cost != null && `${e.cost} credits`,
    e.images.length && `${e.images.length} image${e.images.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  return h('div', { class: `hist-row ${e.status}` },
    h('span', { class: `st ${e.status === 'sent' ? 'ok' : 'err'}` }, icon(e.status === 'sent' ? 'check' : 'alert')),
    h('div', { class: 'hist-body' },
      h('div', { class: 'hist-prompt', title: e.prompt }, e.prompt),
      h('div', { class: 'hist-meta' }, h('span', { class: 'i', role: 'img', 'aria-label': e.type, html: ICONS[e.type] }), meta),
      e.error && h('div', { class: 'hist-err' }, e.error),
      h('div', { class: 'hist-actions' },
        h('button', { class: 'btn-xs', title: 'Add this prompt to the queue again', onclick: () => reuse(e) }, icon('plus'), 'Reuse'),
        h('button', {
          class: 'btn-xs ghost-xs', title: 'Copy the prompt',
          onclick: ev => { const b = ev.currentTarget; navigator.clipboard.writeText(e.prompt).then(() => { b.textContent = 'Copied'; }, () => {}); },
        }, icon('copy'), 'Copy'))));
}

function renderHistList() {
  const list = history.filter(histMatches), box = $('histList');
  if (!box) return;
  const sent = list.filter(e => e.status === 'sent'), credits = sent.reduce((n, e) => n + (e.cost || 0), 0);
  $('histTotals').textContent = list.length
    ? `${sent.length} sent · ${list.length - sent.length} failed · ${credits.toLocaleString()} credits`
    : history.length ? 'Nothing matches these filters.' : 'Jobs you send will appear here.';
  const out = [];
  let day = null;
  for (const e of list.slice(0, 300)) { // ponytail: first 300 matches drawn; search narrows the rest
    const d = dayLabel(e.at);
    if (d !== day) { day = d; out.push(h('h2', { class: 'label hist-day' }, d)); }
    out.push(histRow(e));
  }
  box.replaceChildren(...out);
}

function historyView() {
  const pick = (key, opts) => h('select', {
    class: 'mini-select', 'aria-label': key === 'status' ? 'Filter by result' : 'Filter by type', value: histFilter[key],
    onchange: e => { histFilter[key] = e.target.value; renderHistList(); },
  }, opts.map(([v, t]) => h('option', { value: v }, t)));
  const view = [
    h('div', { class: 'list-head' }, h('h2', { class: 'label' }, 'History'), h('span', { class: 'grow' }),
      h('button', { class: 'btn-sm', disabled: !history.length, onclick: exportCsv }, 'Export CSV'),
      h('button', {
        class: `btn-sm${clearArmed ? ' danger' : ''}`, disabled: !history.length,
        onclick: () => {
          if (!clearArmed) { clearArmed = true; render(); setTimeout(() => { clearArmed = false; if (S.view === 'history') render(); }, 4000); return; }
          history = []; clearArmed = false; saveHistory(); render();
        },
      }, clearArmed ? 'Click again to clear' : 'Clear')),
    h('div', { class: 'hist-filters' },
      h('input', {
        class: 'text-input', type: 'search', id: 'histSearch', placeholder: 'Search prompts, models, shots…', value: histFilter.q,
        'aria-label': 'Search history', oninput: e => { histFilter.q = e.target.value; renderHistList(); },
      }),
      pick('status', [['all', 'All results'], ['sent', 'Sent'], ['failed', 'Failed']]),
      pick('type', [['all', 'Videos + images'], ['video', 'Videos'], ['image', 'Images']])),
    h('p', { class: 'hint', id: 'histTotals' }),
    h('div', { class: 'hist-list', id: 'histList' }),
  ];
  queueMicrotask(renderHistList); // fill once the view is in the page
  return view;
}

// --- Canvas view -------------------------------------------------------------
async function scan() {
  scanning = true;
  scanError = null;
  renderMain();
  try {
    const r = await send({ type: 'scan' });
    if (!r.ok) throw new Error(r.error);
    r.assets.forEach(a => { a.auto = a.name; a.autoGroup = a.group; });
    S.canvas = { assets: applyNames(r.assets), shots: r.shots, scannedAt: Date.now() };
    if (!r.found) scanError = 'No images visible. In Frameo, press Shift+1 to fit the canvas, then scan again.';
    save();
  } catch (e) {
    scanError = e.message;
  }
  scanning = false;
  render();
}

// User-typed names win over scanned labels. They're keyed by image address without its query
// string (signed URLs change), and assets that end up with the same name merge into one.
const viewKey = url => url.split('?')[0];
function applyNames(assets) {
  const out = new Map();
  for (const a of assets) {
    a.auto ??= a.name;
    a.autoGroup ??= a.group;
    const typed = a.views.map(v => S.names[viewKey(v)]).find(n => n !== undefined);
    a.name = typed ?? a.auto;
    a.id = a.name ? `canvas:${a.name}` : `canvas:${a.views[0]}`;
    a.group = S.groupFix[a.id] || (typed ? groupOf(typed) : a.autoGroup);
    const twin = out.get(a.id);
    if (twin) twin.views = [...new Set([...twin.views, ...a.views])];
    else out.set(a.id, a);
  }
  return [...out.values()];
}

function renameAsset(a, name) {
  name = name.trim();
  if (name === a.name) return;
  for (const v of a.views) S.names[viewKey(v)] = name; // '' = deliberately unnamed
  const before = S.canvas.assets.map(x => [x.id, x.views[0]]);
  S.canvas.assets = applyNames(S.canvas.assets);
  // Keep prompts and shared slots pointing at the renamed asset.
  const idOf = v => S.canvas.assets.find(x => x.views.includes(v))?.id;
  const moved = Object.fromEntries(before.map(([id, v]) => [id, idOf(v)]).filter(([o, n]) => n && o !== n));
  const swap = map => { for (const s in map) map[s] = map[s].map(x => moved[x] || x); };
  swap(S.shared.video);
  swap(S.shared.image);
  S.cards.forEach(c => swap(c.images));
  save();
  render();
}

// Character/prop → Element, location → First frame (video) or Reference (image).
// Uploaded images have no group and go in as a Reference.
const slotFor = (a, type) => a.group === 'location' ? (type === 'video' ? 'first' : 'ref') : a.group ? 'el' : 'ref';

function promptFrom(assets, prompt) {
  const c = newCard({ prompt });
  for (const a of assets) (c.images[slotFor(a, c.type)] ||= []).push(a.id);
  S.cards.push(c);
  S.view = 'queue';
  focusCard = c.id;
  save();
  render();
}

function canvasView() {
  const C = S.canvas;
  const head = h('div', { class: 'list-head' }, h('h2', { class: 'label' }, 'From your canvas'),
    h('span', { class: 'grow' }),
    h('button', { class: 'btn-sm', onclick: scan, disabled: scanning }, icon('refresh'), scanning ? 'Scanning…' : C.scannedAt ? 'Re-scan' : 'Scan canvas'));
  const hint = h('p', { class: 'hint' }, 'In Frameo press ', h('kbd', {}, 'Shift+1'), ' to fit the whole canvas on screen, then scan. Names come from the text under each image.');
  const out = [head, hint];
  if (scanError) out.push(h('p', { class: 'hint err-line', style: 'padding-left: 0' }, scanError));
  if (!C.scannedAt) {
    out.push(h('div', { class: 'scan-empty' }, h('div', { class: 'empty-icon' }, icon('image')),
      h('p', {}, 'Read your characters, props and locations from the Frameo canvas, so you can use them as references without uploading.'),
      h('button', { class: 'cta', onclick: scan, disabled: scanning }, icon('refresh'), scanning ? 'Scanning…' : 'Scan canvas')));
    return out;
  }

  const named = g => C.assets.filter(a => a.group === g && a.name);
  const chars = named('character'), locs = named('location');
  if (chars.length || locs.length) {
    const pickSel = (label, key, list) => h('label', { class: 'field' }, label,
      h('select', { class: 'select', value: tpl[key], onchange: e => { tpl[key] = e.target.value; } },
        h('option', { value: '' }, '—'), list.map(a => h('option', { value: a.id }, a.name))));
    const action = h('input', { class: 'text-input', id: 'tplAction', placeholder: 'What happens, e.g. walks in and looks around', value: tpl.action, oninput: e => { tpl.action = e.target.value; } });
    out.push(h('section', { class: 'builder' }, h('h2', { class: 'label' }, 'Quick prompt'),
      h('div', { class: 'fields' }, pickSel('Character', 'char', chars), pickSel('Location', 'loc', locs)),
      action,
      h('button', {
        class: 'cta', onclick: () => {
          const ch = img(tpl.char), loc = img(tpl.loc);
          if (!ch && !loc) return action.focus();
          const text = [ch && `@${ch.name}`, loc && (ch ? `in @${loc.name}` : `@${loc.name}`)].filter(Boolean).join(' ') + (tpl.action.trim() ? `, ${tpl.action.trim()}` : '');
          promptFrom([ch, loc].filter(Boolean), text); // attach both, tagged in the text
          tpl = { char: '', loc: '', action: '' };
        },
      }, icon('plus'), `Add ${S.mode} prompt to queue`)));
  }

  const unnamed = C.assets.filter(a => !a.name);
  for (const [g, title] of [...Object.entries(GROUPS), ['unnamed', 'Unnamed']]) {
    const list = g === 'unnamed' ? unnamed : named(g);
    if (!list.length) continue;
    out.push(h('section', { class: 'stack' },
      h('div', { class: 'group-head' }, h('h2', { class: 'label' }, title), h('small', {}, g === 'unnamed' ? 'Click "Add name…" to name one' : String(list.length))),
      h('div', { class: 'assets' }, list.map(a => h('div', { class: 'asset' },
        h('div', { class: 'asset-thumb' }, h('img', { src: thumb(a), alt: '' }),
          a.views.length > 1 && h('span', { class: 'views', title: `${a.views.length} images` }, `×${a.views.length}`)),
        h('input', {
          class: 'asset-name', value: a.name, placeholder: 'Add name…', title: 'Click to rename',
          'aria-label': a.name ? `Rename ${a.name}` : 'Name this image',
          onkeydown: e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { e.target.value = a.name; e.target.blur(); } },
          onchange: e => renameAsset(a, e.target.value),
        }),
        h('div', { class: 'asset-actions' },
          h('select', {
            class: 'mini-select', 'aria-label': `Group for ${nameOf(a)}`, value: a.group,
            onchange: e => { a.group = S.groupFix[a.id] = e.target.value; save(); render(); },
          }, Object.entries(GROUPS).map(([v, t]) => h('option', { value: v }, t.slice(0, -1)))),
          h('button', { class: 'btn-xs', title: `New ${S.mode} prompt using ${nameOf(a)}`, onclick: () => promptFrom([a], a.name ? `@${a.name} ` : '') }, icon('plus'), 'Use')))))));
  }

  if (C.shots.length) {
    out.push(h('section', { class: 'stack' },
      h('div', { class: 'group-head' }, h('h2', { class: 'label' }, 'Shots'), h('small', {}, `${C.shots.filter(s => !s.filled).length} empty`)),
      h('div', { class: 'shot-list' }, C.shots.map(s => h('div', { class: 'shot-row' }, h('span', {}, s.name),
        h('span', { class: s.filled ? 's-filled' : 's-empty' }, s.filled ? `${s.filled} image${s.filled > 1 ? 's' : ''}` : 'empty'))))));
  }
  out.push(h('p', { class: 'hint' }, `Scanned ${new Date(C.scannedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${C.assets.length} assets`));
  return out;
}

function renderMain() {
  const main = $('main');
  if (S.view === 'history' && phase !== 'running') main.replaceChildren(...historyView());
  else if (S.view === 'script' && phase !== 'running') main.replaceChildren(...scriptView());
  else if (S.view === 'canvas' && phase !== 'running') main.replaceChildren(...canvasView());
  else if (phase !== 'compose') main.replaceChildren(...runView());
  else main.replaceChildren(...(section().length ? compose() : [empty()]));
  if (focusCard) {
    document.querySelector(`[data-card="${focusCard}"] textarea`)?.focus();
    focusCard = null;
  }
}

function empty() {
  const steps = [['Add prompts', 'One card per video or image'], ['Set defaults and images', 'Change any prompt on its own'], ['Generate', 'See the cost first; stops if credits run low']];
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-hero' }, h('div', { class: 'empty-icon' }, icon('stack')),
      h('h1', {}, `Queue up your ${S.mode}s`),
      h('p', {}, "Write prompts one by one or paste a whole list. They're sent to Frameo one after another while you keep working.")),
    h('div', { class: 'stack' },
      h('button', { class: 'cta', onclick: () => addCard() }, icon('plus'), 'Write a prompt'),
      h('button', { class: 'ghost', onclick: openPaste }, icon('paste'), 'Paste a list')),
    h('ol', { class: 'steps' }, steps.map(([b, s], k) => h('li', {}, h('span', {}, String(k + 1)), h('div', {}, h('b', {}, b), h('small', {}, s))))));
}

let clearCardsArmed = false;
function compose() {
  const type = S.mode;
  const defaults = h('details', { class: 'box', open: S.defaultsOpen, ontoggle: e => { S.defaultsOpen = e.target.open; save(); } },
    h('summary', {}, h('h2', { class: 'label' }, `${cap(type)} defaults`), icon('chevron')),
    h('div', { class: 'box-body' },
      h('div', { class: 'field' },
        h('div', { class: 'field-head' }, h('label', { for: 'defModel' }, 'Model'),
          h('button', { class: 'link-btn', disabled: loadingModels || phase === 'running', onclick: () => loadModels(type) },
            icon('refresh'), loadingModels ? 'Loading…' : 'Load from Frameo')),
        h('select', { class: 'select', id: 'defModel', value: S.defaults[type].model || '', onchange: e => { S.defaults[type].model = e.target.value; save(); render(); } },
          h('option', { value: '' }, `${CURRENT_MODEL} (whatever Frameo has selected)`),
          optionsFor('model', S.defaults[type].model, type).map(v => h('option', { value: v }, v))),
        modelsError && h('small', { class: 'err-small' }, modelsError)),
      h('div', { class: 'fields' }, SETTINGS[type].filter(k => k !== 'model' && !absentFor(type, S.defaults[type].model).includes(k)).map(k => h('label', { class: 'field' }, LABEL[k],
        h('select', {
          class: `select${learned(k, type, S.defaults[type].model)?.some(v => sameChoice(v, S.defaults[type][k] || '')) === false ? ' bad' : ''}`,
          value: S.defaults[type][k], onchange: e => { S.defaults[type][k] = e.target.value; save(); render(); },
        }, optionsFor(k, S.defaults[type][k], type, S.defaults[type].model).map(v => h('option', { value: v }, v)))))),
      h('div', { class: 'field' }, h('span', {}, 'Shared images ', h('span', { style: 'color: var(--faint)' }, `· used in every ${type}`)),
        h('div', { class: 'slots' }, SLOTS[type].map(slot => sharedSlot(type, slot)))),
      h('label', { class: 'field row-field' }, h('span', {}, 'Running at once ', h('span', { style: 'color: var(--faint)' }, '· Starter/Pro 2, Studio 5')),
        h('select', { class: 'select', value: String(S.maxParallel), onchange: e => { S.maxParallel = +e.target.value; save(); render(); } },
          [1, 2, 3, 4, 5].map(n => h('option', { value: String(n) }, String(n)))))));

  const prompts = h('section', { class: 'stack' },
    h('div', { class: 'list-head' }, h('h2', { class: 'label' }, `${cap(type)} prompts`), h('span', { class: 'badge', id: 'count' }, String(ready().length)),
      h('span', { class: 'grow' }),
      h('button', {
        class: `btn-sm${clearCardsArmed ? ' danger' : ''}`,
        onclick: () => { // two clicks, like History's Clear: removes every prompt in this section
          if (!clearCardsArmed) { clearCardsArmed = true; render(); setTimeout(() => { clearCardsArmed = false; if (phase === 'compose') render(); }, 4000); return; }
          S.cards = S.cards.filter(c => c.type !== type);
          clearCardsArmed = false;
          save();
          render();
        },
      }, icon('trash'), clearCardsArmed ? `Click again to delete ${section().length}` : 'Clear all'),
      h('button', { class: 'btn-sm', onclick: openPaste }, icon('paste'), 'Paste list')),
    h('p', { class: 'hint' }, 'Add images to a prompt with ', h('b', {}, '+ Image'), ', then type ', h('kbd', {}, '@'), ' to tag them in the text. Settings changed on one prompt turn ', h('em', {}, 'purple'), '.'),
    h('div', { class: 'cards' }, section().map(cardEl)),
    h('button', { class: 'add-prompt', onclick: () => addCard() }, icon('plus'), 'Add prompt'));
  return [defaults, prompts];
}

function sharedSlot(type, slot) {
  const ids = (S.shared[type][slot] || []).filter(img);
  const first = img(ids[0]);
  return h('button', {
    class: `slot${first ? ' filled' : ''}`,
    'aria-label': first ? `Shared ${SLOT[slot].name}: ${ids.length} image${ids.length > 1 ? 's' : ''}. Change` : `Add shared ${SLOT[slot].name}`,
    onclick: () => openPicker({ type, slot }),
  }, first
    ? [h('img', { src: thumb(first), alt: '' }), h('span', { class: 'cap' }, SLOT[slot].short), ids.length > 1 && h('span', { class: 'count' }, String(ids.length))]
    : [icon('plus'), SLOT[slot].short]);
}

// @tag menu: shown under the prompt being typed; arrow keys / Enter / Tab / click pick.
let menu = null; // { card, ta, start, end, items, active }
// The "@word" being typed right now (not flagged as unknown until the user moves on).
const typingTag = ta => /(?:^|[\s(])@([\p{L}\d_-]*)$/u.exec(ta.value.slice(0, ta.selectionStart))?.[1];
function updateMention(c, ta, article) {
  const before = ta.value.slice(0, ta.selectionStart), at = before.lastIndexOf('@');
  const q = at >= 0 && (at === 0 || /[\s(]/.test(before[at - 1])) ? tagKey(before.slice(at + 1)) : null;
  const open = q !== null && !q.includes('\n') && q.length <= 40;
  const items = open ? attached(c).filter(x => tagKey(x.label).includes(q)) : []; // only this card's images
  menu = open
    ? { card: c, ta, start: at, end: ta.selectionStart, items, active: menu?.card === c ? Math.max(0, Math.min(menu.active, items.length - 1)) : 0 }
    : null;
  renderMenu(article);
}
function renderMenu(article) {
  const box = article.querySelector('.mention-menu');
  box.hidden = !menu;
  if (!menu) return box.replaceChildren();
  const card = menu.card, none = !attached(card).length;
  box.replaceChildren(
    ...menu.items.map((x, k) => h('div', {
      class: `opt${k === menu.active ? ' on' : ''}`, role: 'option', 'aria-selected': String(k === menu.active),
      onmousedown: e => { e.preventDefault(); pickMention(x); },
    }, h('img', { src: thumb(x.asset), alt: '' }), h('span', { class: 'ell' }, `@${x.label}`), h('small', {}, SLOT[x.slot].short))),
    none && h('div', { class: 'menu-empty' }, 'No images on this prompt yet. Add them first, then tag them.'),
    !none && !menu.items.length && h('div', { class: 'menu-empty' }, "None of this prompt's images match."),
    h('div', { class: 'menu-hint', onmousedown: e => { e.preventDefault(); menu = null; openPicker({ card, slot: 'el', only: true }); } },
      icon('plus'), ' ', h('b', {}, 'Add image to this prompt')));
}
function pickMention(x) {
  const { ta, start, end } = menu, tag = `@${x.label} `;
  ta.value = ta.value.slice(0, start) + tag + ta.value.slice(end);
  ta.setSelectionRange(start + tag.length, start + tag.length);
  menu = null;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function chipsFor(c, n, typing) {
  const chips = [], model = settingsOf(c).model, bad = unsupported(c), absent = absentFor(c.type, model);
  for (const k of SETTINGS[c.type]) {
    if (absent.includes(k)) continue; // this model has no such control
    const def = S.defaults[c.type][k], val = c.overrides[k];
    chips.push(h('select', {
      class: `chip${val ? ' on' : ''}${k === 'model' ? ' model' : ''}${bad.includes(k) ? ' bad' : ''}`, 'aria-label': `${LABEL[k]} for prompt ${n}`, value: val || '',
      onchange: e => { if (e.target.value) c.overrides[k] = e.target.value; else delete c.overrides[k]; save(); render(); },
    }, h('option', { value: '' }, def || CURRENT_MODEL), optionsFor(k, val, c.type, model).filter(v => v !== def).map(v => h('option', { value: v }, v))));
  }
  const tags = scanTags(c), miss = missingSlots(c);
  for (const { id, slot, asset, label } of attached(c)) {
    const used = tags.found.some(f => f.id === id);
    chips.push(h('span', {
      class: `chip on img${used ? ' tagged' : ''}${miss.includes(slot) || (slot === 'el' && asset.dataUrl) ? ' bad' : ''}`,
      title: `${SLOT[slot].tab} · type @${label} in the prompt to refer to it${used ? ' (tagged)' : ''}`,
    }, h('img', { src: thumb(asset), alt: '' }), h('span', { class: 'ell' }, `${SLOT[slot].short} · @${label}`),
      h('button', {
        class: 'x', 'aria-label': `Remove ${label} from prompt ${n}`,
        onclick: () => {
          c.images[slot] = c.images[slot].filter(x => x !== id);
          if (!c.images[slot].length) delete c.images[slot];
          if (c.labels) delete c.labels[id];
          save(); render();
        },
      }, '×')));
  }
  for (const word of tags.unknown) {
    if (word === typing) continue;
    chips.push(h('button', {
      class: 'chip warn', title: `No image on this prompt is tagged "${word}". Click to choose which image it is.`,
      onclick: () => openLinker(c, word),
    }, h('span', { class: 'ell' }, `@${word}`), h('span', { class: 'q', 'aria-hidden': 'true' }, '?')));
  }
  chips.push(h('button', { class: 'chip add', onclick: () => openPicker({ card: c }) }, icon('plus'), 'Image'));
  // Where on the canvas it lands (default: a new shot after the last one).
  const shots = S.canvas.shots.map(s => s.name), mode = c.shot || 'new';
  const next = c.createdShot || (lastShot() ? `Shot ${+lastShot().replace(/\D/g, '') + 1}` : 'next shot');
  chips.push(h('select', {
    class: `chip shot${mode !== 'new' ? ' on' : ''}`, 'aria-label': `Canvas shot for prompt ${n}`, value: mode,
    title: mode === 'new' ? `Creates ${next} after the last shot` : mode === 'auto' ? 'Frameo picks an empty frame' : `Lands in ${mode} as another take`,
    onchange: e => { c.shot = e.target.value === 'new' ? undefined : e.target.value; delete c.createdShot; save(); render(); },
  }, h('option', { value: 'new' }, c.createdShot ? `Shot: ${c.createdShot} (made, empty)` : 'Shot: new at end'),
    h('option', { value: 'auto' }, 'Shot: Frameo decides'),
    (mode !== 'new' && mode !== 'auto' && !shots.includes(mode) ? [mode, ...shots] : shots).map(s => {
      const full = S.canvas.shots.find(x => x.name === s)?.filled;
      return h('option', { value: s }, `${s}${full === true ? ' · full' : full === false ? ' · empty' : ''}`);
    }),
    !shots.length && h('option', { value: '', disabled: true }, 'Scan the canvas to list shots')));
  return [...chips, h('span', { class: 'kbd' }, h('kbd', {}, `${MOD}↵`), ' next')];
}

// Long prompts collapse to a 2-line preview when not being edited (CSS), with a "show all" line.
const lineCount = text => text.split('\n').filter(l => l.trim()).length;
const isLong = text => lineCount(text) > 2 || text.length > 140;
const moreLabel = text => `Show full prompt · ${lineCount(text)} line${lineCount(text) === 1 ? '' : 's'}`;

function cardEl(c, i) {
  const n = i + 1, other = c.type === 'video' ? 'image' : 'video';
  let article, more;
  const prompt = h('textarea', {
    class: 'prompt', rows: '1', placeholder: `Describe the ${c.type}… add images, then type @ to tag them`, 'aria-label': `Prompt ${n}`, value: c.prompt,
    'aria-autocomplete': 'list',
    oninput: e => {
      c.prompt = e.target.value;
      c.error = null;
      save();
      $('count').textContent = ready().length;
      article.querySelector('.chips').replaceChildren(...chipsFor(c, n, typingTag(e.target)));
      article.querySelector('.script-box').replaceChildren(...scriptLines(c));
      article.toggleAttribute('data-long', isLong(c.prompt));
      more.textContent = moreLabel(c.prompt);
      updateMention(c, e.target, article);
      renderHeader();
      renderFooter();
    },
    onkeydown: e => {
      if (menu?.ta === e.target) {
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && menu.items.length) {
          e.preventDefault();
          menu.active = (menu.active + (e.key === 'ArrowDown' ? 1 : -1) + menu.items.length) % menu.items.length;
          return renderMenu(article);
        }
        if ((e.key === 'Enter' || e.key === 'Tab') && menu.items.length) { e.preventDefault(); return pickMention(menu.items[menu.active]); }
        if (e.key === 'Escape') { menu = null; return renderMenu(article); }
      }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addCard(c); }
    },
    onblur: e => { e.target.scrollTop = 0; if (menu?.card === c) { menu = null; renderMenu(article); } },
  });
  more = h('button', {
    class: 'more', type: 'button',
    onclick: () => { prompt.focus(); prompt.setSelectionRange(prompt.value.length, prompt.value.length); },
  }, moreLabel(c.prompt));
  return article = h('article', { class: 'card', 'data-card': c.id, 'data-long': isLong(c.prompt) },
    h('div', { class: 'card-top' }, h('span', { class: 'num' }, String(n)), prompt,
      h('div', { class: 'card-actions' },
        h('button', { class: 'icon-btn', title: `Move to ${other}s`, 'aria-label': `Move prompt ${n} to the ${other} section`, onclick: () => setType(c, other) }, icon(other)),
        h('button', {
          class: 'icon-btn', title: 'Duplicate', 'aria-label': `Duplicate prompt ${n}`,
          onclick: () => { const copy = { ...structuredClone(c), id: crypto.randomUUID(), status: null, error: null }; S.cards.splice(S.cards.indexOf(c) + 1, 0, copy); focusCard = copy.id; save(); render(); },
        }, icon('copy')),
        h('button', { class: 'icon-btn', title: 'Delete', 'aria-label': `Delete prompt ${n}`, onclick: () => { S.cards.splice(S.cards.indexOf(c), 1); save(); render(); } }, icon('trash')))),
    more,
    h('div', { class: 'mention-menu', role: 'listbox', 'aria-label': 'Tag suggestions', hidden: true }),
    h('div', { class: 'chips' }, chipsFor(c, n)),
    unsupported(c).length ? h('p', { class: 'hint warn-line' }, unsupportedNote(c)) : null,
    missingSlots(c).length ? h('p', { class: 'hint warn-line' }, slotNote(c)) : null,
    uploadsInElements(c).length ? h('p', { class: 'hint warn-line' },
      `${uploadsInElements(c).map(a => tagName(a)).join(', ')}: uploaded files can't be Frameo Elements. Use the image from the canvas instead (Canvas tab), or remove it. Skipped until fixed.`) : null,
    h('div', { class: 'stack script-box', style: 'gap: 6px' }, scriptLines(c)),
    c.error && !blocked(c) && h('p', { class: 'hint err-line' }, c.error));
}

function runView() {
  const list = S.cards.filter(c => c.status);
  const sent = list.filter(c => c.status === 'sent'), failed = list.filter(c => c.status === 'failed'), waiting = list.filter(c => c.status === 'pending');
  if (phase === 'running') {
    const at = list.findIndex(c => c.status === 'running');
    return [
      h('section', { class: 'progress', 'aria-live': 'polite' },
        h('div', { class: 'progress-head' }, h('b', {}, `Sending ${at + 1} of ${list.length}`), h('span', {}, `${sent.length} sent`)),
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': 'Items sent', 'aria-valuemin': '0', 'aria-valuemax': String(list.length), 'aria-valuenow': String(sent.length) },
          h('div', { style: `width: ${(sent.length / list.length) * 100}%` })),
        h('small', {}, 'Keep this panel and the Frameo tab open until everything is sent.')),
      h('h2', { class: 'label' }, 'Queue'),
      h('div', { class: 'rows' }, list.map(rowEl)),
    ];
  }
  const used = Number.isFinite(runStart) && Number.isFinite(frameo?.balance) ? runStart - frameo.balance : null;
  const count = t => String(sent.filter(c => c.type === t).length);
  const out = [h('section', { class: 'summary' },
    h('div', { class: 'summary-head' }, h('span', { class: `st ${failed.length ? 'err' : 'ok'}` }, icon(failed.length ? 'alert' : 'check')),
      h('div', {}, h('b', {}, `${sent.length} of ${list.length} sent`), h('small', {}, sent.length ? "They're rendering in Frameo now" : 'Nothing was sent'))),
    h('div', { class: 'tiles3' },
      h('div', {}, 'Videos', h('b', {}, count('video'))),
      h('div', {}, 'Images', h('b', {}, count('image'))),
      h('div', {}, 'Credits used', h('b', {}, used != null ? used.toLocaleString() : '—'))))];
  if (failed.length) out.push(h('h2', { class: 'label' }, 'Needs attention'), ...failed.map(failEl));
  if (waiting.length) out.push(h('h2', { class: 'label' }, 'Not sent'), h('div', { class: 'rows' }, waiting.map(rowEl)));
  if (sent.length) out.push(h('h2', { class: 'label' }, 'Sent'), h('div', { class: 'rows' }, sent.map(rowEl)));
  return out;
}

function rowEl(c) {
  const status = {
    sent: [h('span', { class: 'st ok' }, icon('check')), h('small', { class: 'ok' }, 'Sent · rendering in Frameo')],
    running: [h('span', { class: 'st run' }, icon('spin')), h('small', { class: 'run' }, waiting ? currentStep : `${currentStep || 'Starting'}…`)],
    pending: [h('span', { class: 'st wait' }), h('small', {}, phase === 'running' ? 'Waiting' : 'Not sent')],
    failed: [h('span', { class: 'st err' }, icon('alert')), h('small', {}, c.error)],
  }[c.status];
  const main = h('div', { class: 'row-main' }, status[0], h('div', { class: 'row-text' }, h('div', {}, c.prompt), status[1]),
    h('span', { class: 'meta' }, h('span', { class: 'i', role: 'img', 'aria-label': c.type, html: ICONS[c.type] }),
      costFor(c).cost != null ? `${costFor(c).exact ? '' : '≈'}${costFor(c).cost}` : ''));
  if (c.status !== 'running') return h('div', { class: 'row' }, main);
  const at = STEPS.indexOf(currentStep);
  return h('div', { class: 'row current' }, main,
    h('ol', { class: 'mini' }, STEPS.map((s, k) => h('li', { class: k < at ? 'done' : k === at ? 'now' : '' }, s))));
}

function failEl(c) {
  return h('div', { class: 'fail' },
    h('div', { class: 'fail-top' }, h('span', { class: 'st err' }, icon('alert')), h('div', {}, h('b', {}, c.prompt), h('small', {}, c.error))),
    h('div', { class: 'fail-actions' },
      h('button', { onclick: () => run([c]) }, 'Retry'),
      h('button', { onclick: () => { clearSent(); focusCard = c.id; renderMain(); } }, 'Edit prompt')));
}

function renderFooter() {
  const f = $('footer');
  if ((S.view === 'canvas' || S.view === 'history' || S.view === 'script') && phase !== 'running') return f.replaceChildren();
  if (phase === 'running') {
    const left = S.cards.filter(c => c.status === 'pending' || c.status === 'running').reduce((n, c) => n + (costFor(c).cost || 0), 0);
    return f.replaceChildren(
      h('div', { class: 'sum-2', style: 'margin: 0' }, h('span', {}, `Max ${S.maxParallel} running at once`), h('span', {}, left ? `~${left.toLocaleString()} credits to go` : '')),
      waiting && h('button', { class: 'ghost', onclick: () => { skipWait = true; } }, 'A slot is free in Frameo, send now'),
      h('button', { class: 'ghost danger', disabled: stopRequested, onclick: () => { stopRequested = true; renderFooter(); } },
        icon('stop'), stopRequested ? 'Stopping after this one…' : 'Stop after this one'));
  }
  if (phase === 'done') {
    const rest = S.cards.filter(c => (c.status === 'failed' || c.status === 'pending') && !blocked(c));
    if (!rest.length) return f.replaceChildren(h('button', { class: 'cta', onclick: clearSent }, icon('plus'), 'Start a new batch'));
    return f.replaceChildren(h('div', { class: 'pair' },
      h('button', { class: 'ghost', onclick: clearSent }, 'Clear sent'),
      h('button', { class: 'cta', onclick: () => run(rest) }, rest.every(c => c.status === 'failed') ? `Retry ${rest.length} failed` : `Send ${rest.length} remaining`)));
  }

  const all = ready();
  if (!all.length) return f.replaceChildren(h('button', { class: 'cta', disabled: true }, 'Add a prompt to start'));
  // Prompts whose settings or images don't fit their model are skipped until fixed.
  const items = all.filter(c => !blocked(c)), skipped = all.length - items.length;
  const skipBanner = skipped && h('div', { class: 'banner' }, icon('alert'), h('div', {},
    h('b', {}, `${skipped} prompt${skipped === 1 ? ' needs' : 's need'} fixing`),
    items.length ? 'It will be skipped; the rest still run. See the highlighted settings or images.' : 'See the highlighted settings or images.'));
  if (!items.length) return f.replaceChildren(skipBanner, h('button', { class: 'cta', disabled: true }, `Fix the highlighted prompt${skipped === 1 ? '' : 's'} first`));
  const n = { video: items.filter(c => c.type === 'video').length, image: items.filter(c => c.type === 'image').length };
  const what = ['video', 'image'].filter(t => n[t]).map(t => plural(n[t], t)).join(' + ');
  const prices = items.map(costFor);
  const known = prices.every(p => p.cost != null), exact = prices.every(p => p.exact);
  const total = prices.reduce((s, p) => s + (p.cost || 0), 0);
  const minutes = Math.round((n.video * etaMin('video') + n.image * etaMin('image')) / S.maxParallel);
  const bal = frameo?.balance;
  let covers = null;
  if (known && Number.isFinite(bal)) {
    let spent = 0;
    covers = prices.findIndex(p => (spent += p.cost) > bal);
    if (covers < 0) covers = items.length;
  }
  const els = [
    h('div', { class: 'sum' }, h('div', {}, h('b', {}, what), minutes ? ` · ~${minutes} min` : ''),
      h('div', { class: 'num-tab', title: exact ? 'Read from Frameo’s Generate button' : 'Estimate: other models and settings can cost more or less' },
        known ? `${exact ? '' : '≈ '}${total.toLocaleString()} credits` : '— credits')),
    h('div', { class: 'sum-2' },
      exact ? h('span', {}, `Exact cost · up to ${S.maxParallel} at once`)
        : h('button', { class: 'link-btn', disabled: !!pricing || !connected(), onclick: () => checkPrices() }, icon('refresh'), pricing ? `Checking exact cost ${pricing}…` : 'Check exact cost'),
      h('span', {}, covers === items.length ? `Balance after: ${exact ? '' : '≈ '}${(bal - total).toLocaleString()}` : '')),
  ];
  if (covers != null && covers < items.length) {
    els.push(h('div', { class: 'banner' }, icon('bolt'), h('div', {}, h('b', {}, 'Not enough credits'),
      covers ? `Your balance covers ${covers} of ${items.length}. The queue stops when credits run out.` : 'Ask a Frameo admin to add credits to the workspace.')));
  }
  if (skipBanner) els.push(skipBanner);
  const unchecked = groq.key ? items.filter(c => shotOf(c) && (!freshAi(c) || freshAi(c).error)) : []; // failed checks (rate limit) get retried
  if (unchecked.length) {
    els.push(h('button', { class: 'link-btn', disabled: storyChecking, onclick: () => storyCheckAll(unchecked) },
      icon('refresh'), storyChecking ? 'Story check running…' : `Story check ${plural(unchecked.length, 'prompt')} (Groq)`));
  }
  els.push(h('button', { class: 'cta', disabled: !connected() || covers === 0, onclick: () => run(items) }, icon('play'), `Generate ${what}`));
  f.replaceChildren(...els);
}

// --- Script memory -----------------------------------------------------------
// The episode's shot list, saved per Frameo project. Cards made from it (or aimed at "Shot N")
// are checked against their shot on every render; a card that drifts is held back via blocked().
const projectOf = c => c?.project || frameo?.project || '';
const scriptOf = c => scripts[projectOf(c)];
function shotOf(c) {
  const sc = scriptOf(c);
  if (!sc) return null;
  const key = c.scriptShot ?? (/^Shot \d+$/.test(c.shot || '') ? +c.shot.replace(/\D/g, '') : null);
  return sc.shots.find(s => keyOf(s) === key) || null;
}
const keyOf = sh => sh.key ?? sh.n; // main shots: their number; supplementals: 1A, 1B…
// A shot-list name → canvas asset, through the user's links ("Saber" → "Maximus Weapon/ Saber").
const assetFor = name => {
  const want = tagKey((S.aliases[tagKey(name.trim())] ?? name).trim());
  return S.canvas.assets.find(a => a.name && tagKey(a.name) === want);
};
const sentHistory = (c, n) => history.filter(e => e.project === projectOf(c) && e.scriptShot === n && e.status === 'sent');
const sentBefore = (c, n) => sentHistory(c, n).length > 0;
const canvasShotOf = (c, n) => sentHistory(c, n)[0]?.shot || `Shot ${n}`; // where shot n actually landed
// Chained video shot with no First Frame of its own: the content script grabs the shot before's last frame.
const chainsFrom = c => { const sh = shotOf(c); return !!(sh?.chain && sh.n > 1 && c.type === 'video' && !c.images.first?.length); };
// What Frameo receives: the artist's text, then the shot's continuity line from the shot list.
const finalPrompt = c => {
  const text = plainPrompt(c), st = stateFor(shotOf(c), scriptOf(c)?.shots || []);
  return st && text ? `${text.replace(/[\s.,;:!?]*$/, '')}. ${st}` : text || st;
};

// Make card and Fix: attach the shot's assets in their slots and tag them. Fix only adds.
function fillFromShot(c, sh) {
  const fresh = !c.prompt.trim(), chained = sh.chain && c.type === 'video';
  const locSlot = c.type === 'video' ? 'first' : 'ref';
  const want = [...sh.cast, ...sh.props, ...(sh.optional || []).filter(assetFor)].map(n => [n, 'el']);
  if (sh.location && !chained) want.push([sh.location, locSlot]); // a chained shot's first frame already shows the set
  for (const [name, slot] of want) {
    const a = assetFor(name);
    if (!a) continue; // stays a "doesn't match the canvas" issue until linked
    if (slot === 'el') for (const s of SLOTS[c.type]) { // characters and props must be Elements for their @tag
      if (s === 'el' || !c.images[s]?.includes(a.id)) continue;
      c.images[s] = c.images[s].filter(x => x !== a.id);
      if (!c.images[s].length) delete c.images[s];
    }
    if (!SLOTS[c.type].some(s => c.images[s]?.includes(a.id))) (c.images[slot] ||= []).push(a.id);
    if (a.name !== name) c.labels = { ...c.labels, [a.id]: name }; // the shot list's spelling: @Saber, @DRAVEN_VALERON
  }
  const found = scanTags(c).found.map(f => f.id);
  const untagged = attached(c).filter(x => x.slot === 'el' && !found.includes(x.id));
  if (!fresh) {
    if (untagged.length) c.prompt = `${untagged.map(x => `@${x.label}`).join(', ')}, ${c.prompt}`;
    return;
  }
  // Tag names where the text mentions them. Unmentioned characters lead ("@Lucius: he turns"),
  // unmentioned props and the location follow ("…, with @Saber, in @Seven Rivers arena"). A written
  // prompt from a prompt document keeps its text whole and gets the tags in front instead.
  let text = sh.prompt || sh.action;
  const who = [], what = [], isCast = x => sh.cast.some(n => tagKey(n) === tagKey(x.label) || assetFor(n)?.id === x.id);
  for (const x of untagged) {
    const re = new RegExp(`(^|[^\\p{L}\\d@])(${escapeRe(x.label)})(?![\\p{L}\\d])`, 'iu');
    if (re.test(text)) text = text.replace(re, `$1@${x.label}`); else (isCast(x) ? who : what).push(`@${x.label}`);
  }
  const locX = sh.location && attached(c).find(x => x.slot === locSlot && x.id === assetFor(sh.location)?.id);
  const loc = locX && !scanTags({ ...c, prompt: text }).found.some(f => f.id === locX.id) ? locX : null; // not tagged in the text already
  if (sh.prompt) {
    const lead = [who.join(', '), what.length && `with ${what.join(', ')}`, loc && `in @${loc.label}`].filter(Boolean).join(' ');
    c.prompt = lead ? `${lead}: ${text}` : text;
    return;
  }
  c.prompt = [who.length && `${who.join(', ')}:`, [text, what.length && `with ${what.join(', ')}`, loc && `in @${loc.label}`].filter(Boolean).join(', ')]
    .filter(Boolean).join(' ');
}

const unsentShots = () => scriptOf().shots.filter(sh => !sh.sub && !sentBefore(null, sh.n) // supplementals: their own button
  && !S.cards.some(c => c.scriptShot === sh.n && projectOf(c) === frameo?.project));
function makeCards(list) {
  for (const sh of list) {
    const row = !sh.sub && S.canvas.shots.find(s => s.name === `Shot ${sh.n}`); // its own storyboard row if it's still empty
    const c = newCard({ scriptShot: keyOf(sh), project: frameo.project, ...(row && !row.filled && { shot: row.name }) });
    fillFromShot(c, sh);
    S.cards.push(c);
  }
  S.view = 'queue';
  save();
  render();
}

// What's wrong with a card against its shot. block: held back from Generate until fixed or "Send anyway".
function scriptIssues(c) {
  const sh = shotOf(c);
  if (!sh) return null;
  const block = [], warn = [], on = attached(c), tags = scanTags(c), chained = sh.chain && c.type === 'video';
  const need = [...sh.cast, ...sh.props].map(n => [n, 'el']);
  if (sh.location && !chained) need.push([sh.location, null]);
  if (!S.canvas.scannedAt) block.push({ text: 'Scan the canvas (Canvas tab) so this prompt can be checked against the shot list.' });
  else {
    for (const [name, slot] of need) {
      const a = assetFor(name);
      if (!a) { block.push({ text: `"${name}" doesn't match any image on the canvas.`, link: name }); continue; }
      const x = on.find(x => x.id === a.id);
      if (!x) { block.push({ text: `${name} is in Shot ${keyOf(sh)} in the shot list but not on this prompt.` }); continue; }
      if (slot && x.slot !== slot) { block.push({ text: `${name} has to be an Element for its @tag to work.` }); continue; }
      if (slot && !tags.found.some(f => f.id === x.id)) block.push({ text: `@${x.label} isn't tagged in the prompt.` });
    }
    const listed = [...need.map(([n]) => n), ...(sh.optional || [])]; // optional "memory/reference only" assets never hold a card back
    const extra = on.filter(x => x.slot === 'el' && !listed.some(n => assetFor(n)?.id === x.id));
    if (extra.length) warn.push(`${extra.map(x => x.label).join(', ')} ${extra.length > 1 ? "aren't" : "isn't"} in Shot ${keyOf(sh)} in the shot list.`);
  }
  if (tags.unknown.length) block.push({ text: `No image on this prompt is called ${tags.unknown.map(w => `@${w}`).join(', ')}.` });
  const have = chained && sh.n > 1 && slotsOf(c.type, settingsOf(c).model);
  if (have && !have.includes('first')) {
    block.push({ text: `${settingsOf(c).model || 'This model'} can't start from a frame, and Shot ${sh.n} continues from the shot before. Pick a model with a First Frame.` });
  }
  const takes = c.status === 'sent' ? 0 : sentHistory(c, keyOf(sh)).length;
  if (takes) warn.push(`Shot ${keyOf(sh)} was already sent ${takes === 1 ? 'once' : `${takes} times`}. Sending this makes another take.`);
  return { block, warn };
}

// Lines under a card: its shot, what's held back, warnings, the story check, and the buttons.
function scriptLines(c) {
  const sh = shotOf(c);
  if (!sh) return [];
  const is = scriptIssues(c), st = stateFor(sh, scriptOf(c).shots), ai = freshAi(c), open = c.status !== 'sent';
  const out = [h('p', { class: 'hint script-line' }, `Script · Shot ${keyOf(sh)}${sh.title ? ` · ${sh.title}` : ''}`,
    chainsFrom(c) ? ` · starts from ${canvasShotOf(c, sh.n - 1)}'s last frame` : '', st ? ` · adds "${st}"` : '')];
  for (const b of is.block) {
    out.push(h('p', { class: `hint ${c.sendAnyway ? 'warn-line' : 'err-line'}` }, b.text,
      b.link && [' ', h('button', { class: 'link-btn', onclick: () => openAlias(b.link) }, 'Link')]));
  }
  for (const w of is.warn) out.push(h('p', { class: 'hint warn-line' }, w));
  if (ai?.issues) {
    out.push(...(ai.issues.length ? ai.issues.map(t => h('p', { class: 'hint warn-line' }, `Story check: ${t}`))
      : [h('p', { class: 'hint script-line' }, 'Story check: nothing found.')]));
  }
  if (ai?.error) out.push(h('p', { class: 'hint err-line' }, `Story check failed: ${ai.error}`));
  const acts = [];
  if (is.block.length && open) {
    acts.push(h('button', { class: 'btn-xs', onclick: () => { fillFromShot(c, sh); save(); render(); } }, 'Fix'),
      h('button', { class: 'btn-xs ghost-xs', onclick: () => { c.sendAnyway = !c.sendAnyway; save(); render(); } },
        c.sendAnyway ? 'Hold it back again' : 'Send anyway'));
  }
  if (groq.key && open) {
    acts.push(h('button', { class: 'btn-xs ghost-xs', disabled: !!ai?.busy, onclick: () => storyCheck(c) },
      ai?.busy ? 'Checking…' : ai ? 'Check again' : 'Story check'));
  }
  if (acts.length) out.push(h('div', { class: 'hint-actions' }, acts));
  return out;
}

function openAlias(name) {
  pick = { alias: name, type: S.mode, slot: null, selected: assetFor(name) ? [assetFor(name).id] : [] };
  renderPicker();
  $('picker').showModal();
}

function scriptView() {
  const project = frameo?.project, sc = scriptOf();
  const out = [h('div', { class: 'list-head' }, h('h2', { class: 'label' }, 'Shot list'),
    sc && h('span', { class: 'badge' }, [plural(sc.shots.filter(s => !s.sub).length, 'shot'),
      sc.shots.some(s => s.sub) && plural(sc.shots.filter(s => s.sub).length, 'supplemental')].filter(Boolean).join(' · ')), h('span', { class: 'grow' }),
    h('button', { class: 'btn-sm', disabled: !project, onclick: uploadScript }, icon('upload'), 'Upload file'),
    h('button', { class: 'btn-sm', disabled: !project, onclick: openScriptPaste }, icon('paste'), sc ? 'Paste again' : 'Paste'))];
  if (!project) return [...out, h('p', { class: 'hint' }, 'Connect to a Frameo project first: each shot list is saved under its project.')];
  if (!sc) {
    out.push(h('div', { class: 'scan-empty' }, h('div', { class: 'empty-icon' }, icon('stack')),
      h('p', {}, `Paste this episode's shot list. ELEVIQUE keeps it for ${project}, makes a card per shot, and holds back any card that drifts from its shot before it spends credits.`),
      h('button', { class: 'cta', onclick: uploadScript }, icon('upload'), 'Upload shot list or script'),
      h('button', { class: 'ghost', onclick: openScriptPaste }, icon('paste'), 'Paste a table'),
      h('p', { class: 'hint' }, '.xlsx, .csv, .docx or .txt. A table is read as-is; a written script is split into shots by Groq (add a key below).')));
    return [...out, groqBox()];
  }
  if (!S.canvas.scannedAt) {
    out.push(h('div', { class: 'banner' }, icon('alert'), h('div', { class: 'grow' }, h('b', {}, 'Scan the canvas first'),
      'So the names in the shot list can be matched to your canvas images.',
      h('div', { class: 'row' }, h('span', {}), h('button', { class: 'btn-xs', disabled: scanning, onclick: scan }, scanning ? 'Scanning…' : 'Scan canvas')))));
  }
  const miss = S.canvas.scannedAt ? [...new Set(sc.shots.flatMap(s => [...s.cast, ...s.props, s.location]).filter(Boolean))].filter(n => !assetFor(n)) : [];
  if (miss.length) {
    out.push(h('div', { class: 'banner' }, icon('alert'), h('div', { class: 'grow' },
      h('b', {}, `${plural(miss.length, 'name')} in the shot list ${miss.length === 1 ? "doesn't" : "don't"} match the canvas`),
      'Link each one to its canvas image once. ELEVIQUE remembers the link for every episode.',
      miss.map(n => h('div', { class: 'row' }, h('span', {}, `"${n}"`), h('button', { class: 'btn-xs', onclick: () => openAlias(n) }, 'Link…'))))));
  }
  const todo = unsentShots();
  out.push(h('button', { class: 'cta', disabled: !todo.length || !S.canvas.scannedAt, onclick: () => makeCards(todo) }, icon('plus'),
    todo.length ? `Make ${S.mode} cards for ${plural(todo.length, 'unsent shot')}` : 'Every shot has a card or was sent'));
  out.push(...sc.shots.map(shotRowEl), groqBox(),
    h('p', { class: 'hint' }, `Pasted ${new Date(sc.importedAt).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`));
  return out;
}

function shotRowEl(sh) {
  const key = keyOf(sh), card = S.cards.find(c => c.scriptShot === key && projectOf(c) === frameo?.project && c.status !== 'sent');
  const sent = sentHistory(null, key).length, last = history.find(e => e.project === frameo?.project && e.scriptShot === key);
  const [label, cls] = card?.status === 'failed' || (!card && last?.status === 'failed') ? ['Failed', 'err']
    : card ? ['Card in queue', 'q'] : sent ? [sent > 1 ? `Sent · ${sent} takes` : 'Sent', 'ok'] : ['Not started', ''];
  const nm = (n, extra = '') => {
    const a = assetFor(n);
    return h('span', { class: `nm${extra}${S.canvas.scannedAt && !a ? ' bad' : ''}`, title: a ? `Canvas: ${a.name}` : 'No canvas match yet' }, n);
  };
  const state = Object.entries(sh.state).map(([k, v]) => `${k}: ${v}`).join(' · ');
  const notes = [sh.chain && sh.n > 1 && `⛓ starts from Shot ${sh.n - 1}'s last frame`, ...Object.entries(sh.notes).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join(' · ');
  const head = [sh.title, sh.action].filter(Boolean).join(' · ');
  return h('div', { class: `hist-row${sh.sub ? ' supp' : ''}` }, h('span', { class: 'num' }, String(key)), h('div', { class: 'hist-body' },
    h('div', { class: 'hist-prompt', title: sh.prompt || sh.action }, head || '(no action text)'),
    h('div', { class: 'names' }, sh.cast.map(n => nm(n)), sh.props.map(n => nm(n)), sh.location && nm(sh.location, ' loc'),
      (sh.optional || []).map(n => h('span', { class: 'nm opt', title: 'Optional: memory/reference only. Attached when it is on the canvas; never holds a card back.' }, `${n}?`))),
    state && h('div', { class: 'hist-meta' }, state), notes && h('div', { class: 'hist-meta' }, notes),
    h('div', { class: 'hist-actions' }, h('span', { class: `pill ${cls}` }, label), h('span', { class: 'grow' }),
      h('button', { class: 'btn-xs', disabled: !S.canvas.scannedAt, onclick: () => makeCards([sh]) }, icon('plus'), 'Make card'))));
}

// Paste sheet for the shot list. Sheets, Docs, Excel and Word put an HTML table on the clipboard:
// its cells become tab-separated rows (line breaks inside a cell become "; "), then one parse path.
let scriptDraft = { shots: [], errors: [], columns: [] };
const ROLE_LABEL = { shot: 'shot number', action: 'prompt text', cast: 'characters', location: 'location · carries down', props: 'props',
  chain: 'chain flag', state: 'continuity · carries down', note: 'note, not sent' };
// Straight to the file picker; the file lands in the same sheet and preview as a paste.
function uploadScript() {
  openScriptPaste();
  $('scriptFile').click();
}
function openScriptPaste() {
  $('scriptText').value = '';
  scriptStatus(UPLOAD_HINT);
  $('scriptFor').textContent = `Saved under ${frameo?.project || 'this project'}`;
  updateScriptPaste();
  $('scriptSheet').showModal();
}
function updateScriptPaste() {
  scriptDraft = parseEpisode($('scriptText').value);
  const { shots, errors, columns } = scriptDraft;
  $('scriptFound').textContent = shots.length ? `${plural(shots.length, 'shot')} found${errors.length ? ` · ${errors.length} to fix` : ''}` : '';
  $('scriptPreview').replaceChildren(...[
    scriptDraft.format === 'doc' && h('div', { class: 'cols' }, h('span', { class: 'col' },
      `Prompt document · ${plural(shots.filter(s => !s.sub).length, 'shot')} · ${plural(shots.filter(s => s.sub).length, 'supplemental')}`)),
    columns.length && h('div', { class: 'cols' }, columns.map(c => h('span', { class: `col${c.role === 'note' ? ' dim' : ''}` }, `${c.name || '(blank)'} → ${ROLE_LABEL[c.role]}`))),
    ...errors.map(e => h('div', {}, h('span', { class: 'bad' }, e))),
    ...shots.map(s => h('div', {}, h('span', { class: 'n' }, String(keyOf(s))), h('span', { class: 't' }, [s.title, s.action].filter(Boolean).join(' · ') || '(no action text)'),
      s.chain && h('span', { class: 'tag' }, '⛓'))),
    !columns.length && !shots.length && !errors.length && h('div', {}, h('span', { class: 'dim' }, 'Nothing yet. Paste the table or prompt document above.')),
  ].filter(Boolean));
  $('scriptSave').disabled = !shots.length || errors.length > 0 || !frameo?.project;
}
$('scriptText').addEventListener('input', updateScriptPaste);
$('scriptText').addEventListener('paste', e => {
  const html = e.clipboardData?.getData('text/html');
  if (!html || !/<table/i.test(html) || parsePromptDoc(e.clipboardData.getData('text/plain'))) return; // a prompt doc pastes as text
  e.preventDefault();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  doc.querySelectorAll('p, div, li').forEach(b => b.append('\n'));
  e.target.value = rowsToTsv([...doc.querySelectorAll('tr')].map(tr => [...tr.cells].map(td => td.textContent)));
  updateScriptPaste();
});

// Upload: a table (.xlsx, .csv/.tsv/.md/.txt table, or a table inside a .docx) is read as-is; a written
// script (.docx/.txt/.md with no shot table) goes to Groq once to be split into shots. Either way it
// lands in the textarea and preview, to check before saving.
const UPLOAD_HINT = $('scriptStatus').textContent;
const scriptStatus = (text, cls = '') => { $('scriptStatus').textContent = text; $('scriptStatus').className = cls; };
async function readEpisodeFile(file) {
  const name = file.name.toLowerCase();
  let rows = null, text = '';
  if (/\.(xlsx|docx)$/.test(name)) {
    const read = unzip(await file.arrayBuffer());
    if (name.endsWith('.xlsx')) rows = fromHeader(await xlsxRows(read));
    else {
      const d = await docxContent(read);
      rows = d.tables.map(fromHeader).find(Boolean) || null;
      text = d.text;
    }
  } else if (/\.xls$|\.doc$|\.pages$|\.numbers$/.test(name)) {
    throw new Error(`${file.name}: save it as .xlsx, .csv, .docx or .txt first.`);
  } else {
    text = await file.text();
    rows = fromHeader(rowsFromText(text));
  }
  const doc = text && parsePromptDoc(text);
  if (doc) {
    return { text, note: `Read ${file.name} as a prompt document: ${plural(doc.shots.filter(s => !s.sub).length, 'shot')}, `
      + `${plural(doc.shots.filter(s => s.sub).length, 'supplemental')}. Check it, then save.` };
  }
  if (rows) return { text: rowsToTsv(rows), note: `Read the shot table from ${file.name}. Check it, then save.` };
  if (!text.trim()) throw new Error(`${file.name} has no shot table and no text.`);
  if (!groq.key) throw new Error(`${file.name} is a written script, not a shot table. Add a Groq key in the Script tab (Story check) so ELEVIQUE can split it into shots, or paste the table.`);
  if (text.length > 250000) throw new Error(`${file.name} is too long for one request. Upload one episode at a time.`);
  scriptStatus(`Splitting ${file.name} into shots with Groq…`);
  const shots = await breakdown(text);
  const head = ['Shot', 'Action', 'Characters', 'Location', 'Props', 'Wardrobe', 'Time of day', 'Chain'];
  const list = v => (Array.isArray(v) ? v : v ? [v] : []).map(String).join(', ');
  return {
    text: rowsToTsv([head, ...shots.map(s => [s.n, s.action, list(s.characters), s.location, list(s.props), s.wardrobe, s.time, s.chain ? 'yes' : ''])]),
    note: `Groq split ${file.name} into ${plural(shots.length, 'shot')}. Read them through and fix anything before saving: this becomes what every card is checked against.`,
  };
}
$('scriptFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = ''; // the same file can be picked again
  if (!file) return;
  scriptStatus(`Reading ${file.name}…`);
  try {
    const { text, note } = await readEpisodeFile(file);
    $('scriptText').value = text;
    updateScriptPaste();
    scriptStatus(note, 'ok');
  } catch (err) {
    scriptStatus(err.message, 'err');
  }
});
$('scriptCancel').onclick = () => $('scriptSheet').close();
$('scriptSave').onclick = () => {
  scripts[frameo.project] = { importedAt: Date.now(), columns: scriptDraft.columns, shots: scriptDraft.shots };
  chrome.storage.local.set({ scripts });
  $('scriptSheet').close();
  S.view = 'script';
  save();
  render();
};

// --- Story check (optional, Groq) -----------------------------------------------
// Warnings only: an LLM reads the prompt against its shot and the shot before. It never holds a card
// back. Sends the two shot-list rows, the shot before's sent prompt, and this prompt; nothing else.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions', GROQ_ORIGIN = 'https://api.groq.com/*';
const GROQ_MODEL = 'openai/gpt-oss-120b'; // Groq production model, 131k context (Oct 2026); changeable in the Script tab
const STORY_PROMPT = 'You check continuity for one shot of an AI-generated video series. You get the shot-list row for this shot, '
  + 'the row for the shot before it, the prompt that was sent for the shot before (if any), and the prompt about to be sent for this shot. '
  + "List only real problems in the prompt: it contradicts this shot's row (time of day, wardrobe, props, who is present, location, action), "
  + "or it breaks continuity with the shot before (positions, held props, injuries, lighting) where the row doesn't say that changed. "
  + 'Ignore style, wording and camera choices. Answer in JSON: {"issues": ["one short sentence per problem"]}, with an empty list when there is nothing.';
let storyChecking = false, groqDraft = null, groqMsg = '';
const freshAi = c => (c.ai && c.ai.prompt === finalPrompt(c) ? c.ai : null); // any edit makes the result stale
const rowFor = sh => sh && { shot: keyOf(sh), title: sh.title, action: sh.action, prompt: sh.prompt, characters: sh.cast, location: sh.location, props: sh.props,
  state: sh.state, continuesFromPreviousShot: sh.chain };
async function storyCheck(c) {
  const sh = shotOf(c), text = finalPrompt(c);
  if (!sh || !groq.key) return;
  c.ai = { prompt: text, busy: true };
  render();
  try {
    const prevKey = sh.sub ? sh.n : sh.n - 1; // a supplemental is read against its main shot
    const prev = scriptOf(c).shots.find(s => keyOf(s) === prevKey);
    const { issues } = await groqJson(STORY_PROMPT, {
      thisShot: rowFor(sh), previousShot: rowFor(prev) || null,
      previousShotSentPrompt: sentHistory(c, prevKey)[0]?.prompt || null, promptToSend: text,
    });
    c.ai = { prompt: text, issues: (Array.isArray(issues) ? issues : []).map(i => String(i?.text ?? i).trim()).filter(Boolean).slice(0, 5) };
  } catch (e) {
    c.ai = { prompt: text, error: e.message };
  }
  save();
  render();
}

// One JSON-mode chat request to Groq with the user's key. Answers are cached by request, so the
// same rows + prompt (or the same script upload) never cost a second call, even on a remade card.
const GROQ_GAP = 2100, GROQ_CACHE_MAX = 300; // ponytail: fixed gap ≈ Groq free tier's 30 requests/min; read x-ratelimit-* headers if a paid tier needs it faster
let groqNext = 0, groqCache = {};
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
  .map(b => b.toString(16).padStart(2, '0')).join('');
async function groqJson(system, user, extra = {}) {
  const body = JSON.stringify({
    model: groq.model || GROQ_MODEL, temperature: 0, response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(user) }], ...extra,
  });
  const id = await sha(body);
  if (groqCache[id]) return structuredClone(groqCache[id]);
  const out = await groqSend(body);
  groqCache[id] = out;
  const ids = Object.keys(groqCache); // insertion order: drop the oldest past the cap
  for (const old of ids.slice(0, ids.length - GROQ_CACHE_MAX)) delete groqCache[old];
  chrome.storage.local.set({ groqCache });
  return structuredClone(out);
}
// Requests go out one gap apart, whoever asks. A 429 or 5xx waits as long as Groq says and retries,
// up to 3 times; a wait over a minute (daily quota) fails with the time instead of hanging.
async function groqSend(body) {
  for (let attempt = 0; ; attempt++) {
    const at = Math.max(Date.now(), groqNext);
    groqNext = at + GROQ_GAP; // reserve the slot before waiting, so parallel clicks queue
    await sleep(at - Date.now());
    const r = await fetch(GROQ_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${groq.key}` }, body,
    }).catch(() => { throw new Error("Couldn't reach Groq. Check the connection, then retry."); });
    const res = await r.json().catch(() => ({}));
    if (r.status === 401) throw new Error('Groq rejected the API key. Check it in the Script tab.');
    if (r.status === 429 || r.status >= 500) {
      const wait = (Number(r.headers.get('retry-after')) || 5 * 2 ** attempt) * 1000;
      if (attempt === 3 || wait > 60000) throw new Error(r.status === 429
        ? `Groq's rate limit is reached${wait > 60000 ? `; try again in about ${Math.ceil(wait / 60000)} min` : ''}. Nothing was lost.`
        : `Groq is having trouble (${r.status}). Try again shortly.`);
      groqNext = Math.max(groqNext, Date.now() + wait);
      continue;
    }
    if (!r.ok) throw new Error(res.error?.message || `Groq answered ${r.status}.`);
    try { return JSON.parse(res.choices?.[0]?.message?.content || '{}'); } catch { throw new Error("Groq's answer wasn't valid JSON. Try again."); }
  }
}

// A written script → shot list rows, one Groq call per upload. Canvas names are passed so the
// shot list uses them where they clearly mean the same thing (fewer names to link afterwards).
const BREAKDOWN_PROMPT = 'You turn one episode of a series script into a shot list for AI video generation. '
  + 'Keep the shots exactly as the script numbers or separates them; never invent, merge or drop shots. If the script has no shot numbers, number its shots 1, 2, 3 in order. '
  + 'For each shot give: n (shot number), action (what we see as one or two full sentences that name who does what, close to the script\'s words), characters (who is on screen), '
  + 'location, props (objects that matter on screen), wardrobe and time (only when the script states or changes them; otherwise an empty string, which means "same as the shot before"), '
  + 'and chain (true only when the script says the shot continues directly from the previous one). '
  + 'Where a name in canvasAssets clearly refers to the same character, place or object, use that exact name. '
  + 'Answer in JSON: {"shots":[{"n":1,"action":"","characters":[],"location":"","props":[],"wardrobe":"","time":"","chain":false}]}';
async function breakdown(script) {
  const { shots } = await groqJson(BREAKDOWN_PROMPT, { canvasAssets: S.canvas.assets.map(a => a.name).filter(Boolean), script },
    { max_completion_tokens: 32000 });
  if (!Array.isArray(shots) || !shots.length) throw new Error("Groq didn't find any shots in that script. Check it's the episode text, or paste the table.");
  return shots;
}
async function storyCheckAll(list) {
  storyChecking = true;
  renderFooter();
  for (const c of list) await storyCheck(c);
  storyChecking = false;
  render();
}
function groqBox() {
  groqDraft ||= { ...groq };
  return h('details', { class: 'box', open: !groq.key || null },
    h('summary', {}, h('h2', { class: 'label' }, groq.key ? 'Story check · Groq on' : 'Story check · Groq (optional)'), icon('chevron')),
    h('div', { class: 'box-body groq' },
      h('p', { class: 'hint', style: 'margin: 0' }, 'Reads each prompt against its shot and the shot before, and warns about what rules can\'t see, like "sunlit" in a Night shot or a prop that jumps hands. '
        + 'Warnings only; it never holds a card back. With a key saved, the shot rows and prompts you check are sent to Groq.'),
      h('label', { class: 'field' }, 'Groq API key', h('input', {
        class: 'text-input', id: 'groqKey', type: 'password', autocomplete: 'off', placeholder: 'gsk_…', value: groqDraft.key,
        oninput: e => { groqDraft.key = e.target.value; },
      })),
      h('label', { class: 'field' }, 'Model', h('input', {
        class: 'text-input', id: 'groqModel', placeholder: GROQ_MODEL, value: groqDraft.model,
        oninput: e => { groqDraft.model = e.target.value; },
      })),
      groqMsg && h('small', { class: /^(Saved|Removed)/.test(groqMsg) ? 'found' : 'err-small' }, groqMsg),
      h('div', { class: 'pair' },
        h('button', { class: 'btn-sm', disabled: !groq.key, onclick: () => saveGroq(true) }, 'Remove key'),
        h('button', { class: 'btn-sm', onclick: () => saveGroq(false) }, 'Save'))));
}
async function saveGroq(remove) {
  const next = { key: remove ? '' : groqDraft.key.trim(), model: groqDraft.model.trim() };
  if (next.key) { // host access is asked for only now, from this click
    const ok = await chrome.permissions.request({ origins: [GROQ_ORIGIN] }).catch(() => false);
    if (!ok) { groqMsg = "Chrome didn't allow access to api.groq.com, so the key wasn't saved."; return renderMain(); }
  } else chrome.permissions.remove({ origins: [GROQ_ORIGIN] }).catch(() => {});
  groq = next;
  groqDraft = { ...groq };
  chrome.storage.local.set({ groq });
  groqMsg = next.key ? 'Saved. Script cards now have a Story check button.' : 'Removed. Nothing goes to Groq.';
  render();
}

// --- Paste sheet -------------------------------------------------------------
let pasteRows = [];
function openPaste() {
  $('bulk').value = '';
  updatePaste();
  $('paste').showModal();
}
function updatePaste() {
  pasteRows = fromText($('bulk').value);
  const good = pasteRows.filter(r => r.card), bad = pasteRows.length - good.length;
  $('found').textContent = pasteRows.length ? `${good.length} prompt${good.length === 1 ? '' : 's'} found${bad ? ` · ${bad} to fix` : ''}` : '';
  const tags = c => {
    const t = [c.type !== S.mode && `→ ${cap(c.type)}s`, ...Object.values(c.overrides), ...Object.entries(c.images).map(([s, ids]) => `${SLOT[s].short} ×${ids.length}`)].filter(Boolean);
    return t.length ? t.map(x => h('span', { class: 'tag' }, x)) : h('span', { class: 'dim' }, 'defaults');
  };
  $('preview').replaceChildren(...(pasteRows.length
    ? pasteRows.map((r, k) => h('div', {}, h('span', { class: 'n' }, String(k + 1)), h('span', { class: 't' }, r.card ? r.card.prompt : r.line),
      r.error ? h('span', { class: 'bad' }, r.error) : tags(r.card)))
    : [h('div', {}, h('span', { class: 'dim' }, 'Nothing yet. Paste or type above.'))]));
  $('pasteAdd').disabled = !good.length;
  $('pasteAdd').textContent = good.length ? `Add ${good.length} prompt${good.length === 1 ? '' : 's'}` : 'Add prompts';
}
$('bulk').addEventListener('input', updatePaste);
$('pasteCancel').onclick = () => $('paste').close();
$('pasteAdd').onclick = () => {
  S.cards.push(...pasteRows.filter(r => r.card).map(r => r.card));
  $('paste').close();
  save();
  render();
};

// --- Image picker sheet ------------------------------------------------------
let pick = null; // { card?, type, slot, selected: [id] }
const pickCurrent = () => (pick.card ? pick.card.images[pick.slot] : S.shared[pick.type][pick.slot]) || [];
// "@NED ?" chip → pick which image is NED; that image is named NED so the tag works everywhere.
function openLinker(card, word) {
  pick = { link: word, card, type: card.type, slot: null, selected: [] };
  renderPicker();
  $('picker').showModal();
}

// Only the slots this prompt's model (or the section's default model) accepts, once known.
const pickableSlots = () => {
  if (pick.only) return [pick.slot]; // from the @ tag menu: tagged images are Elements
  const have = slotsOf(pick.type, pick.card ? settingsOf(pick.card).model : S.defaults[pick.type].model);
  const list = SLOTS[pick.type].filter(s => !have || have.includes(s));
  return list.length ? list : SLOTS[pick.type];
};
function openPicker({ card, type = card.type, slot, only = false }) {
  pick = { card, type, slot, only };
  const avail = pickableSlots();
  pick.slot = slot && avail.includes(slot) ? slot : avail.includes('ref') ? 'ref' : avail[0];
  pick.selected = [...pickCurrent()];
  renderPicker();
  $('picker').showModal();
}
function renderPicker() {
  const info = SLOT[pick.slot] || { name: 'image', multi: false };
  $('pickTitle').textContent = pick.alias ? `Which canvas image is "${pick.alias}"?` : pick.link ? `Which image is @${pick.link}?` : 'Add image';
  $('pickFor').textContent = pick.alias
    ? 'That is what the shot list calls it. ELEVIQUE remembers the link for every episode.'
    : pick.link
      ? `Pick one of this prompt's images, or add one. @${pick.link} will refer to it in this prompt.`
      : pick.card
        ? `To ${pick.card.type} prompt ${section(pick.card.type).indexOf(pick.card) + 1}${pick.card.prompt ? ` · ${pick.card.prompt}` : ''}`
        : `Shared · used in every ${pick.type}`;
  for (const id of ['pickAsLabel', 'pickSlots', 'pickHintRow']) $(id).hidden = !!(pick.link || pick.alias);
  if (!pick.link && !pick.alias) {
    $('pickSlots').replaceChildren(...pickableSlots().map(s => h('button', {
      role: 'radio', 'aria-checked': String(s === pick.slot),
      onclick: () => { pick.slot = s; pick.selected = [...pickCurrent()]; renderPicker(); },
    }, SLOT[s].tab)));
    $('pickHint').textContent = info.hint + (info.multi ? ' You can pick several.' : '');
  }
  const upload = h('label', { class: 'upload' }, icon('upload'), 'Upload',
    h('input', {
      type: 'file', accept: 'image/*', multiple: true, class: 'sr',
      onchange: async e => {
        const ids = await addImages(e.target.files);
        pick.selected = info.multi ? [...new Set([...pick.selected, ...ids])] : ids.slice(-1);
        renderPicker();
      },
    }));
  const tile = im => {
    const on = pick.selected.includes(im.id);
    const label = nameOf(im) + (im.views?.length > 1 ? ` · ${im.views.length}` : '');
    return h('div', { class: 'tile-wrap' },
      h('button', {
        class: 'tile', 'aria-pressed': String(on), 'aria-label': label,
        onclick: () => { pick.selected = on ? pick.selected.filter(x => x !== im.id) : info.multi ? [...pick.selected, im.id] : [im.id]; renderPicker(); },
      }, h('img', { src: thumb(im), alt: '' }), h('span', { class: 'name' }, label), on && h('span', { class: 'check' }, icon('check'))),
      im.dataUrl && h('button', { class: 'del', 'aria-label': `Delete ${im.name} from your images`, title: 'Delete image', onclick: () => deleteImage(im.id) }, icon('x')));
  };
  const canvasTiles = Object.keys(GROUPS).flatMap(g => {
    const list = S.canvas.assets.filter(a => a.group === g);
    return list.length ? [h('div', { class: 'lib-sep' }, `Canvas · ${GROUPS[g]}`), ...list.map(tile)] : [];
  });
  if (pick.alias) { // named canvas images only: an alias points at a canvas label
    $('lib').replaceChildren(...Object.keys(GROUPS).flatMap(g => {
      const list = S.canvas.assets.filter(a => a.group === g && a.name);
      return list.length ? [h('div', { class: 'lib-sep' }, `Canvas · ${GROUPS[g]}`), ...list.map(tile)] : [];
    }));
    $('pickApply').textContent = `Link "${pick.alias}"`;
    $('pickApply').disabled = !pick.selected.length;
    return;
  }
  // Tagging: this prompt's own images come first.
  const onCard = pick.link ? attached(pick.card) : [];
  const cardTiles = onCard.length ? [h('div', { class: 'lib-sep' }, 'On this prompt'), ...onCard.map(x => tile(x.asset))] : [];
  const rest = im => !onCard.some(x => x.id === im.id);
  $('lib').replaceChildren(...cardTiles, ...(pick.link ? [h('div', { class: 'lib-sep' }, 'Add another image')] : []),
    upload, ...library.filter(rest).map(tile),
    ...(pick.link ? Object.keys(GROUPS).flatMap(g => {
      const list = S.canvas.assets.filter(a => a.group === g && rest(a));
      return list.length ? [h('div', { class: 'lib-sep' }, `Canvas · ${GROUPS[g]}`), ...list.map(tile)] : [];
    }) : canvasTiles));
  if (pick.link) {
    $('pickApply').textContent = `Tag it @${pick.link}`;
    $('pickApply').disabled = !pick.selected.length;
    return;
  }
  const n = pick.selected.length, had = pickCurrent().length;
  $('pickApply').textContent = n ? `Use as ${info.name}${n > 1 ? ` (${n})` : ''}` : had ? `Remove ${info.name}` : `Use as ${info.name}`;
  $('pickApply').disabled = !n && !had;
}
$('pickCancel').onclick = () => $('picker').close();
$('picker').addEventListener('close', () => { pick = null; });
$('pickApply').onclick = () => {
  if (pick.alias) {
    const a = img(pick.selected[0]);
    if (a?.name) S.aliases[tagKey(pick.alias.trim())] = a.name;
    $('picker').close();
    save();
    render();
    return;
  }
  if (pick.link) { // tag on this prompt only; tagged images go into Elements (what Frameo's @mentions use)
    const c = pick.card, a = img(pick.selected[0]), word = pick.link;
    if (a && !attached(c).some(x => x.id === a.id)) (c.images.el ||= []).push(a.id);
    if (a) c.labels = { ...c.labels, [a.id]: word };
    $('picker').close();
    save();
    render();
    return;
  }
  const target = pick.card ? pick.card.images : S.shared[pick.type];
  if (pick.selected.length) target[pick.slot] = [...pick.selected];
  else delete target[pick.slot];
  $('picker').close();
  save();
  render();
};
