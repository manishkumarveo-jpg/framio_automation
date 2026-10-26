const assert = require('assert');
const { parseLines, groupOf, parseShotList, stateFor, parseCsv, rowsFromText, fromHeader, rowsToTsv, parsePromptDoc, parseEpisode } = require('./parse.js');

// Shot list: header roles, lists, carry-forward, "-" clears, chain flag, bad rows.
const sheet = [
  ['Shot', 'Action', 'Characters', 'Location', 'Props', 'Wardrobe', 'Time of day', 'Chain', 'Camera'],
  ['1', 'Maximus strides in', 'Maximus', 'Arena', 'Saber', 'Maximus wears a torn red cloak; Lucius wears a white toga', 'Dusk', '', 'WIDE'],
  ['2', 'Lucius watches', 'Lucius', '', '', '', '', '', ''],
  ['3', 'Maximus raises his saber', 'Maximus, Lucius', '-', 'Saber', '', 'Night', 'yes', ''],
  ['', 'no number', '', '', '', '', '', '', ''],
  ['3', 'dup', '', '', '', '', '', '', ''],
].map(r => r.join('\t')).join('\n');
const sl = parseShotList(sheet);
assert.deepStrictEqual(sl.columns.map(c => c.role), ['shot', 'action', 'cast', 'location', 'props', 'state', 'state', 'chain', 'note']);
assert.strictEqual(sl.shots.length, 3);
const [r1, r2, r3] = sl.shots;
assert.deepStrictEqual([r1.n, r1.cast, r1.props, r1.notes], [1, ['Maximus'], ['Saber'], { Camera: 'WIDE' }]);
assert.deepStrictEqual([r2.location, r2.state['Time of day'], r2.props], ['Arena', 'Dusk', []], 'location and state carry, props do not');
assert.deepStrictEqual([r3.location, r3.state["Time of day"], r3.cast, r3.chain, r2.chain], ['', 'Night', ['Maximus', 'Lucius'], true, false]);
assert.deepStrictEqual(sl.errors, ['Row 5: no shot number', 'Row 6: Shot 3 appears twice']);
assert.match(parseShotList('Name\tAction\na\tb').errors[0], /No "Shot" column/);
assert.strictEqual(parseShotList('Shot\tAction\tPrompt\n1\tx\ty').shots[0].action, 'y', 'Prompt column wins');
assert.strictEqual(stateFor(r2, sl.shots), 'Lucius wears a white toga. Dusk.', "Maximus's wardrobe stays out of Lucius's shot");
assert.strictEqual(stateFor(r3, sl.shots), 'Maximus wears a torn red cloak. Lucius wears a white toga. Night.');

// Uploaded tables: CSV quoting, semicolon CSV, Markdown tables, title rows above the header.
assert.deepStrictEqual(parseCsv('Shot,Action\n1,"Maximus, sword drawn"\n2,"two\nlines"\n'), [['Shot', 'Action'], ['1', 'Maximus, sword drawn'], ['2', 'two\nlines']]);
assert.deepStrictEqual(rowsFromText('Shot;Action\n1;Ned runs'), [['Shot', 'Action'], ['1', 'Ned runs']]);
assert.deepStrictEqual(rowsFromText('| Shot | Action |\n|---|:---|\n| 1 | Ned runs |'), [['Shot', 'Action'], ['1', 'Ned runs']]);
const titled = [['MAHAGATHA Ep 54 shot list'], [], ['Shot', 'Action', 'Characters'], ['1', 'a', 'Ned']];
assert.deepStrictEqual(fromHeader(titled), titled.slice(2));
assert.strictEqual(fromHeader([['Shot list for episode 54'], ['some text']]), null, 'a title alone is not a header');
assert.strictEqual(rowsToTsv([['1', 'two\nlines', undefined]]), '1\ttwo; lines\t');
assert.strictEqual(parseShotList(rowsToTsv(fromHeader(titled))).shots[0].cast[0], 'Ned');

// The team's prompt document (excerpt of Episode 25): shots, supplementals, @TAGS, NONE, optional tags.
const DOC = `**MAHAGATHA / THE ASHBORN PRINCE
****EPISODE 25 — REFINED VISUAL PROMPTS (CINEMATIC FIX)
MASTER FIX NOTES
Supplemental prompts remain separate from the main shot.
REFINED PROMPTS
SHOT 01 — Draven Confrontation
AUDIO WINDOW (WORKING MAP): 00:00.00 -> 00:12.78 | ~12.8s
**VO / SCRIPT LINES REPRESENTED:**
When Ned Valeron came face to face with Draven Valeron.
Draven draws his steps back.
**ASSET TAGGING — MAIN SHOT:**
CHARACTERS:
@NEEL_NED
@DRAVEN_VALERON
@INNER_DISCIPLES_GROUP
LOCATION / ENVIRONMENT:
@SEVEN_RIVERS_GATEWAY_CONFRONTATION_AREA
PROPS / OBJECTS:
NONE
CROWD / GROUP ASSETS:
@INNER_DISCIPLES_GROUP
WARDROBE / LOOK LOCKS:
Use approved character costume continuity
VFX / POWER / SPECIAL EFFECTS:
NONE — practical/environmental effects only
**SUBJECT + BLOCKING / GENERATION PROMPT:**
Photorealistic live-action Mahagatha scene. Depict exactly this story beat: Draven draws his steps back.
**CAMERA / MULTI-CUT EDITORIAL:**
ACTION COVERAGE: begin inside the motion.
**DIALOGUE / LIP-SYNC:**
No on-camera lip-sync required.
**CONTINUITY / END STATE:**
Maintain @SEVEN_RIVERS_GATEWAY_CONFRONTATION_AREA geography.
**NEGATIVE:**
No anime/cartoon look.
SUPPLEMENTAL 01A — B-ROLL / CONTINUITY FILLER
VO BEAT SUPPORTED: Same audio window 00:00.00 -> 00:12.78.
ASSET TAGGING — SUPPLEMENTAL:
CHARACTERS:
@NEEL_NED
LOCATION / ENVIRONMENT:
@SEVEN_RIVERS_GATEWAY_CONFRONTATION_AREA
PROPS / OBJECTS:
NONE
SUPPLEMENTAL GENERATION PROMPT:
B-roll filler under the same VO: close physical details.
EDIT USE: Use for 1–4 second inserts.
SHOT 03 — That letter was very brief; it said only
**VO / SCRIPT LINES REPRESENTED:**
That letter was very brief.
**ASSET TAGGING — MAIN SHOT:**
CHARACTERS:
@NEEL_NED
@ALARIC — memory/reference only if approved asset exists
PROPS / OBJECTS:
@AETHELGARD_LETTER
@MESSENGER_BIRD
**SUBJECT + BLOCKING / GENERATION PROMPT:**
Start inside the interaction itself.
`;
const doc = parseEpisode(DOC);
assert.strictEqual(doc.format, 'doc');
assert.deepStrictEqual(doc.errors, []);
assert.deepStrictEqual(doc.shots.map(s => s.key), [1, '1A', 3]);
const [d1, d1a, d3] = doc.shots;
assert.deepStrictEqual([d1.n, d1.sub, d1.title], [1, null, 'Draven Confrontation']);
assert.deepStrictEqual(d1.cast, ['NEEL_NED', 'DRAVEN_VALERON', 'INNER_DISCIPLES_GROUP'], 'crowd tag deduped into cast');
assert.deepStrictEqual([d1.location, d1.props], ['SEVEN_RIVERS_GATEWAY_CONFRONTATION_AREA', []], 'NONE is no prop');
assert.strictEqual(d1.action, 'When Ned Valeron came face to face with Draven Valeron. Draven draws his steps back.');
assert.strictEqual(d1.prompt, 'Photorealistic live-action Mahagatha scene. Depict exactly this story beat: Draven draws his steps back.\n\n'
  + 'ACTION COVERAGE: begin inside the motion.\n\nMaintain @SEVEN_RIVERS_GATEWAY_CONFRONTATION_AREA geography.\n\nNo anime/cartoon look.',
  'subject + camera + continuity + negative; dialogue and asset lists left out');
assert.deepStrictEqual(d1.notes, { Audio: '00:00.00 -> 00:12.78 | ~12.8s', Wardrobe: 'Use approved character costume continuity' }, 'NONE VFX dropped');
assert.deepStrictEqual([d1a.n, d1a.sub, d1a.prompt, d1a.cast, d1a.notes['Edit use']], [1, 'A', 'B-roll filler under the same VO: close physical details.', ['NEEL_NED'], 'Use for 1–4 second inserts.']);
assert.deepStrictEqual([d3.cast, d3.optional, d3.props, d3.location], [['NEEL_NED'], ['ALARIC'], ['AETHELGARD_LETTER', 'MESSENGER_BIRD'], '']);
assert.match(parsePromptDoc('SHOT 01 — x\nCHARACTERS:\n@A').errors[0], /Shot 1: no generation prompt/);
assert.strictEqual(parsePromptDoc('Shot\tAction\n1\tNed runs'), null, 'a table is not a prompt doc');
assert.strictEqual(parseEpisode('Shot\tAction\n1\tNed runs').shots[0].action, 'Ned runs');

const groups = { 'Ned': 'character', 'Evander Cassius': 'character', 'House Elder 1': 'character', 'Seven Rivers Order - arena': 'location',
  'Study room': 'location', 'Maximus Weapon/ Saber': 'prop', 'Spirit stones': 'prop', 'gold coins': 'prop' };
for (const [n, g] of Object.entries(groups)) assert.strictEqual(groupOf(n), g, n);
assert.strictEqual(groupOf('', 1, 300, 150), 'location', 'unnamed wide image');

const D = { aspect: '9:16', duration: 'Auto', resolution: '720p' };
const jobs = parseLines('a cat\n\n  b | 16:9 | 5s | 1080p \nc | 10s\nd | 1080p | 1:1\ne | auto |\nf | 4k\n | 5s', D);
const [a, b, c, d, e, f, g] = jobs;

assert.strictEqual(jobs.length, 7, 'blank line skipped');
assert.deepStrictEqual([a.prompt, a.aspect, a.duration, a.resolution], ['a cat', '9:16', 'Auto', '720p']);
assert.deepStrictEqual([b.prompt, b.aspect, b.duration, b.resolution], ['b', '16:9', '5s', '1080p']);
assert.deepStrictEqual([c.aspect, c.duration, c.resolution], ['9:16', '10s', '720p']);
assert.deepStrictEqual([d.aspect, d.resolution], ['1:1', '1080p']);
assert.strictEqual(e.duration, 'auto');
assert.match(f.error, /unknown setting "4k"/);
assert.strictEqual(g.error, 'empty prompt');
assert.strictEqual(a.images, undefined, 'no image overrides by default');

const [h] = parseLines('hero walks | ref=hero.png | 16:9 | EL = a.png, b.png | first=start frame.jpg');
assert.deepStrictEqual(h.images, { ref: ['hero.png'], el: ['a.png', 'b.png'], first: ['start frame.jpg'] });
assert.strictEqual(h.aspect, '16:9');

const [mo] = parseLines('duel at dawn | model = Veo 3.1 Fast | 16:9');
assert.deepStrictEqual([mo.model, mo.aspect], ['Veo 3.1 Fast', '16:9']);

const [s1, s2] = parseLines('arena entry | shot=40\ncrowd | Shot 63');
assert.deepStrictEqual([s1.shot, s2.shot], ['Shot 40', 'Shot 63']);

const [i, k] = parseLines('knight poster | Image | 1:1\nplain one');
assert.deepStrictEqual([i.type, i.aspect], ['image', '1:1']);
assert.strictEqual(k.type, undefined, 'type only when given');

console.log('parse ok');
