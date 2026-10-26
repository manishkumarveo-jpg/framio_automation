// Uploaded .xlsx / .docx → rows or text, with the browser's own unzip (DecompressionStream) and
// DOMParser; no libraries. Both formats are zip archives of XML. Side panel only.

// Zip central directory → reader for one entry's text.
function unzip(buf) {
  const v = new DataView(buf), files = {};
  let end = buf.byteLength - 22;
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0) throw new Error("That file isn't a valid .xlsx or .docx. Save it again from Excel, Sheets or Word.");
  for (let i = 0, p = v.getUint32(end + 16, true), n = v.getUint16(end + 10, true); i < n; i++) {
    const nameLen = v.getUint16(p + 28, true), local = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    files[name] = { method: v.getUint16(p + 10, true), data: new Uint8Array(buf, start, v.getUint32(p + 20, true)) };
    p += 46 + nameLen + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return async name => {
    const f = files[name];
    if (!f) return null;
    const bytes = f.method === 0 ? f.data
      : new Uint8Array(await new Response(new Blob([f.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    return new TextDecoder().decode(bytes);
  };
}
const xmlDoc = s => new DOMParser().parseFromString(s || '<x/>', 'application/xml');

// First sheet of a workbook, as rows of cell text (column letters respected, so gaps stay gaps).
// ponytail: values as stored; dates and formulas show their raw value, fine for shot lists.
async function xlsxRows(read) {
  const shared = [...xmlDoc(await read('xl/sharedStrings.xml')).getElementsByTagName('si')]
    .map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
  const rid = xmlDoc(await read('xl/workbook.xml')).getElementsByTagName('sheet')[0]?.getAttribute('r:id');
  const target = [...xmlDoc(await read('xl/_rels/workbook.xml.rels')).getElementsByTagName('Relationship')]
    .find(r => r.getAttribute('Id') === rid)?.getAttribute('Target');
  const path = !target ? 'xl/worksheets/sheet1.xml' : target.startsWith('/') ? target.slice(1) : `xl/${target}`;
  const col = ref => [.../^[A-Z]+/.exec(ref || 'A')[0]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
  return [...xmlDoc(await read(path)).getElementsByTagName('row')].map(row => {
    const cells = [];
    for (const c of row.getElementsByTagName('c')) {
      const t = c.getAttribute('t'), v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      cells[col(c.getAttribute('r'))] = t === 's' ? shared[+v] ?? ''
        : t === 'inlineStr' ? [...c.getElementsByTagName('t')].map(x => x.textContent).join('') : v;
    }
    return Array.from(cells, x => x ?? '');
  });
}

// A Word document's tables (rows of cell text) and its whole text, one paragraph per line.
async function docxContent(read) {
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const doc = xmlDoc(await read('word/document.xml'));
  const text = el => [...el.getElementsByTagNameNS(W, 'p')]
    .map(p => [...p.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('')).join('\n');
  const tables = [...doc.getElementsByTagNameNS(W, 'tbl')].map(tbl => [...tbl.getElementsByTagNameNS(W, 'tr')]
    .map(tr => [...tr.getElementsByTagNameNS(W, 'tc')].map(tc => text(tc).trim())));
  return { tables, text: text(doc) };
}
