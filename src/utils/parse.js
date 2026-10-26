// "prompt | image | 16:9 | 5s | 1080p | model=Veo 3.1 Fast | ref=a.png | el=b.png,c.png" — all optional after the prompt, any order.
const KINDS = { type: /^(video|image)$/i, aspect: /^\d+:\d+$/, duration: /^(auto|\d+s)$/i, resolution: /^\d+p$/i };
const IMAGE_TOKEN = /^(first|end|ref|el)\s*=\s*(.+)$/i; // parse.js shares the side panel's global scope

function parseLines(text, defaults = {}) {
  return text.split('\n').map(s => s.trim()).filter(Boolean).map(line => {
    const [prompt, ...tokens] = line.split('|').map(s => s.trim());
    if (!prompt) return { line, error: 'empty prompt' };
    const job = { line, prompt, ...defaults };
    for (const t of tokens.filter(Boolean)) {
      const model = /^model\s*=\s*(.+)$/i.exec(t);
      if (model) { job.model = model[1].trim(); continue; }
      const shot = /^shot\s*[=:]?\s*(\d+)$/i.exec(t);
      if (shot) { job.shot = `Shot ${shot[1]}`; continue; }
      const img = IMAGE_TOKEN.exec(t);
      if (img) {
        (job.images ||= {})[img[1].toLowerCase()] = img[2].split(',').map(s => s.trim()).filter(Boolean);
        continue;
      }
      const kind = Object.keys(KINDS).find(k => KINDS[k].test(t));
      if (!kind) return { line, error: `unknown setting "${t}"` };
      job[kind] = kind === 'type' ? t.toLowerCase() : t;
    }
    return job;
  });
}

// Canvas asset group from its name's words first (a character sheet is one wide image, so shape
// alone misleads), then from shape for unnamed images. Shared by content script and side panel.
// ponytail: keyword lists, add words as real canvases need them.
const PERSON = /\b(elder|king|queen|prince|princess|guard|soldier|man|woman|boy|girl|master|lord|lady|priest|servant|child|merchant|warrior|general|captain|crowd|onlookers|villagers|people)\b/i;
const PROP = /\b(weapon|saber|sabre|sword|blade|dagger|spear|axe|bow|shield|ring|coins?|stones?|gem|crystal|scroll|book|map|key|crown|amulet|necklace|potion|cup|goblet|bag|box|chest|letter)\b/i;
const PLACE = /\b(arena|street|road|house|room|interior|exterior|hall|market|palace|temple|city|village|town|forest|castle|courtyard|camp|shore|beach|harbou?r|throne|chamber|study|tavern|inn|gate|square|field|desert|mountain|cave|ship|bridge)\b/i;
function groupOf(name, count = 1, w = 1, h = 1) {
  if (name) return PERSON.test(name) ? 'character' : PROP.test(name) ? 'prop' : PLACE.test(name) ? 'location' : 'character';
  return count > 1 || h > w * 1.2 ? 'character' : w > h * 1.3 ? 'location' : 'prop';
}

// Episode shot list pasted from a sheet (tab-separated, header row first) → shots the side panel
// checks cards against. Location and state cells left blank take the shot above's value; "-" clears.
// ponytail: header keyword lists, add words as real sheets need them.
const SHOT_COLS = [
  ['shot', /^(shot\b|#|no\b)/i], ['action', /prompt|action|description|visual/i], ['cast', /character|cast/i],
  ['location', /location|^set\b/i], ['props', /^props?\b/i], ['chain', /chain|from prev/i],
  ['state', /wardrobe|costume|outfit|time of day|weather|lighting|continuity/i],
];
function parseShotList(text) {
  const rows = text.split(/\r?\n/).filter(l => l.trim()).map(l => l.split('\t').map(s => s.trim()));
  if (rows.length < 2) return { shots: [], errors: rows.length ? ['Only a header row so far'] : [], columns: [] };
  const [head, ...body] = rows;
  const columns = head.map(name => ({ name, role: (SHOT_COLS.find(([, re]) => re.test(name)) || ['note'])[0] }));
  // Prompt wins over Action/Description when a sheet has both.
  const texts = columns.filter(c => c.role === 'action');
  if (texts.length > 1) { const keep = texts.find(c => /prompt/i.test(c.name)) || texts[0]; texts.forEach(c => { if (c !== keep) c.role = 'note'; }); }
  if (!columns.some(c => c.role === 'shot')) return { shots: [], errors: ['No "Shot" column in the header row'], columns };
  const list = s => s.split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
  const shots = [], errors = [];
  let carry = { location: '', state: {} };
  body.forEach((r, k) => {
    const sh = { n: null, action: '', cast: [], location: '', props: [], state: {}, notes: {}, chain: false };
    columns.forEach((c, i) => {
      const v = r[i] || '';
      if (c.role === 'shot') sh.n = +(/\d+/.exec(v) || [])[0] || null;
      else if (c.role === 'action') sh.action = v;
      else if (c.role === 'cast') sh.cast = list(v);
      else if (c.role === 'props') sh.props = list(v);
      else if (c.role === 'chain') sh.chain = /^(y|yes|x|✓|✔|true|1)$/i.test(v);
      else if (c.role === 'location') sh.location = v === '-' ? '' : v || carry.location;
      else if (c.role === 'state') { const val = v === '-' ? '' : v || carry.state[c.name] || ''; if (val) sh.state[c.name] = val; }
      else if (v) sh.notes[c.name] = v;
    });
    carry = { location: sh.location, state: { ...sh.state } };
    if (!sh.n) errors.push(`Row ${k + 2}: no shot number`);
    else if (shots.some(s => s.n === sh.n)) errors.push(`Row ${k + 2}: Shot ${sh.n} appears twice`);
    else shots.push(sh);
  });
  return { shots, errors, columns };
}

// An episode prompt document: "SHOT 01 — title" and "SUPPLEMENTAL 01A — kind" blocks, each with
// labelled sections (CHARACTERS:, LOCATION / ENVIRONMENT:, PROPS / OBJECTS:, SUBJECT + BLOCKING /
// GENERATION PROMPT:, …) and @TAGS. Main shots get key n; supplementals key "1A". null when the
// text has no SHOT headings, so tables and plain scripts fall through.
// ponytail: section labels as the team's template writes them; add patterns if the template changes.
const DOC_SECTIONS = [
  ['audio', /^AUDIO WINDOW\b/], ['vo', /^VO (\/ SCRIPT LINES|BEAT SUPPORTED)\b/], ['skip', /^ASSET TAGGING\b/],
  ['cast', /^CHARACTERS?$/], ['location', /^LOCATION\b/], ['props', /^PROPS\b/], ['crowd', /^CROWD\b/],
  ['wardrobe', /^WARDROBE\b/], ['vfx', /^VFX\b/], ['subject', /^(SUBJECT\b|SUPPLEMENTAL GENERATION PROMPT$)/],
  ['camera', /^CAMERA\b/], ['dialogue', /^DIALOGUE\b/], ['continuity', /^CONTINUITY\b/], ['negative', /^NEGATIVE$/],
  ['use', /^EDIT USE$/],
];
function parsePromptDoc(text) {
  const blocks = [];
  let block = null, role = null;
  for (const line of text.replace(/\*\*/g, '').split(/\r?\n/).map(l => l.trim())) {
    const head = /^(SHOT|SUPPLEMENTAL)\s+(\d+)([A-Z])?\b\s*(?:[—–:-]+\s*(.*))?$/i.exec(line);
    if (head) {
      const supp = /^supp/i.test(head[1]);
      block = { n: +head[2], sub: head[3]?.toUpperCase() || (supp ? 'S' : null), title: (head[4] || '').trim(), s: {} };
      blocks.push(block);
      role = null;
      continue;
    }
    if (!block || !line) continue;
    const m = /^([^:]{2,60}):\s*(.*)$/.exec(line), label = m?.[1].trim();
    const r = label && label === label.toUpperCase() && DOC_SECTIONS.find(([, re]) => re.test(label));
    if (r) { role = r[0]; if (m[2]) (block.s[role] ||= []).push(m[2]); continue; }
    if (role) (block.s[role] ||= []).push(line);
  }
  if (!blocks.length) return null;
  const tags = ls => (ls || []).flatMap(l => [...l.matchAll(/@([\p{L}\d_]+)/gu)]
    .map(t => ({ name: t[1], optional: /memory|reference only|if approved/i.test(l) })));
  const uniq = list => [...new Set(list.map(t => t.name))];
  const join = ls => (ls || []).join('\n').trim();
  const shots = [], errors = [];
  for (const b of blocks) {
    const people = [...tags(b.s.cast), ...tags(b.s.crowd)], props = tags(b.s.props), places = tags(b.s.location);
    const need = list => uniq(list.filter(t => !t.optional));
    const key = b.sub ? `${b.n}${b.sub}` : b.n;
    const sh = {
      n: b.n, key, sub: b.sub, title: b.title, action: join(b.s.vo).replace(/\s*\n\s*/g, ' '),
      prompt: (b.sub ? [b.s.subject] : [b.s.subject, b.s.camera, b.s.continuity, b.s.negative]).map(join).filter(Boolean).join('\n\n'),
      cast: need(people), location: need(places)[0] || '', props: need(props),
      optional: uniq([...people, ...props, ...places].filter(t => t.optional)), state: {}, notes: {}, chain: false,
    };
    for (const [k, r] of [['Audio', 'audio'], ['Wardrobe', 'wardrobe'], ['VFX', 'vfx'], ['Edit use', 'use']]) {
      const v = join(b.s[r]);
      if (v && !/^NONE\b/i.test(v)) sh.notes[k] = v.replace(/\s*\n\s*/g, ' ');
    }
    if (!sh.prompt) errors.push(`${b.sub ? 'Supplemental' : 'Shot'} ${key}: no generation prompt found`);
    else if (shots.some(s => s.key === key)) errors.push(`Shot ${key} appears twice`);
    else shots.push(sh);
  }
  return { shots, errors, columns: [], format: 'doc' };
}
// Whatever was pasted or uploaded: a prompt document, else a shot-list table.
const parseEpisode = text => parsePromptDoc(text) || parseShotList(text);

// Uploaded or pasted tables → rows. CSV keeps quoted commas and line breaks inside a cell.
function parseCsv(text, sep = ',') {
  const rows = [[]];
  let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { rows.at(-1).push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      rows.at(-1).push(cell); cell = ''; rows.push([]);
    } else cell += ch;
  }
  rows.at(-1).push(cell);
  return rows.filter(r => r.some(c => c.trim()));
}
// A text file's table: tab-separated, a Markdown "| a | b |" table, or CSV (comma, or semicolon from European Excel).
function rowsFromText(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.some(l => l.includes('\t'))) return lines.map(l => l.split('\t'));
  const md = lines.filter(l => /^\s*\|.*\|\s*$/.test(l));
  if (md.length > 1) return md.filter(l => !/^\s*\|[\s:|-]+\|\s*$/.test(l)).map(l => l.trim().slice(1, -1).split('|').map(c => c.trim()));
  const head = lines[0] || '';
  return parseCsv(text, head.includes(';') && !head.includes(',') ? ';' : ',');
}
// Rows from the shot list's header row on (title rows above it are dropped); null when there's no
// header row naming a Shot column plus one other shot-list column.
function fromHeader(rows) {
  const roleOf = c => (SHOT_COLS.find(([, re]) => re.test(String(c).trim())) || [])[0];
  const i = rows.findIndex(r => r.some(c => roleOf(c) === 'shot') && r.some(c => ['action', 'cast', 'location', 'props'].includes(roleOf(c))));
  return i < 0 ? null : rows.slice(i);
}
const rowsToTsv = rows => rows.map(r => Array.from(r, c => String(c ?? '').trim().replace(/\s*[\r\n\t]+\s*/g, '; ')).join('\t')).join('\n');

// The shot's state as one line for the prompt. A part naming someone from the shot list goes in
// only when that person is in this shot ("Lucius wears a white toga" stays out of a Maximus close-up).
function stateFor(shot, shots) {
  if (!shot) return '';
  const low = s => s.toLowerCase(), cast = [...new Set(shots.flatMap(s => s.cast))];
  const parts = Object.values(shot.state).flatMap(v => v.split(/[;\n]/)).map(p => p.trim()).filter(Boolean).filter(p => {
    const named = cast.filter(n => low(p).includes(low(n)));
    return !named.length || named.some(n => shot.cast.includes(n));
  });
  return parts.length ? `${parts.join('. ').replace(/\.?$/, '.')}` : '';
}

if (typeof module !== 'undefined') module.exports = { parseLines, groupOf, parseShotList, stateFor, parseCsv, rowsFromText, fromHeader, rowsToTsv, parsePromptDoc, parseEpisode };
