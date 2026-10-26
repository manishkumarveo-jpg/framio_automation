// Runs inside the Frameo page (MAIN world) so it can use Frameo's canvas editor (window.editor,
// tldraw), which content.js can't see. It only lists shot frames and selects one; content.js
// asks via window.postMessage.
(() => {
  // Installed both by the manifest and on demand by the side panel: only once per page.
  if (window.__eleviqueBridge) return;
  window.__eleviqueBridge = true;
  document.documentElement.dataset.eleviqueBridge = 'ready'; // lets content.js tell "not loaded" from "no answer"

  // Shot rows are "rowContainer" shapes holding "frame" shapes. Frameo groups a row's frames by
  // their y position and labels row P "Shot {baseShotNumber + P}".
  function shotRows(ed) {
    const shape = id => ed.getShapeById(id);
    const rows = [];
    for (const rc of ed.shapesArray.filter(s => s.type === 'rowContainer')) {
      const frames = ed.getSortedChildIds(rc.id).map(shape).filter(s => s?.type === 'frame').sort((a, b) => a.y - b.y);
      const tolerance = (rc.props.rowHeight || 100) / 2, groups = [];
      for (const f of frames) {
        const g = groups.at(-1);
        if (g && Math.abs(f.y - g[0].y) < tolerance) g.push(f); else groups.push([f]);
      }
      groups.forEach((g, p) => {
        const number = (rc.props.baseShotNumber ?? 1) + p;
        const shotId = g.find(f => f.props?.shotId)?.props.shotId;
        rows.push({
          container: rc.id,
          number,
          name: (shotId && rc.props.rowNamesByShotId?.[shotId]) || `Shot ${number}`,
          frames: g.sort((a, b) => a.x - b.x).map(f => ({ id: f.id, empty: ed.getSortedChildIds(f.id).length === 0 })),
        });
      });
    }
    return rows.sort((a, b) => a.number - b.number);
  }

  // Same steps as Frameo's own "Add Shot" strip under the last row: one empty frame, sized like the
  // last row's frames, placed below it in the same container; then the container tidies itself.
  function addShot(ed) {
    const rows = shotRows(ed);
    if (!rows.length) throw new Error('This canvas has no shots yet. Add the first shot in Frameo.');
    const last = rows.at(-1), rc = ed.getShapeById(last.container);
    if (rc.props.lockLayout) throw new Error("Frameo's shot layout is locked on this canvas.");
    const frames = id => rows.find(r => r === id).frames.map(f => ed.getShapeById(f.id));
    const tallest = fs => Math.max(...fs.map(f => f.props.h ?? rc.props.rowHeight));
    const lastFrames = frames(last), first = lastFrames[0];
    // Gap between rows: measured from the two last rows, else Frameo's defaults (rowGap + 200).
    const prev = rows.filter(r => r.container === last.container).at(-2);
    let gap = (rc.props.rowGap ?? 0) + 200;
    if (prev) {
      const p = frames(prev), measured = first.y - (p[0].y + tallest(p));
      if (measured > 0) gap = measured;
    }
    const id = `shape:${crypto.randomUUID().replace(/-/g, '').slice(0, 21)}`;
    ed.batch(() => {
      ed.createShapes([{ id, type: 'frame', parentId: rc.id, x: rc.props.padding ?? first.x,
        y: first.y + tallest(lastFrames) + gap, props: { w: first.props.w ?? 576, h: first.props.h ?? 1024 } }]);
      const fresh = ed.getShapeById(rc.id), util = ed.getShapeUtil(fresh);
      util?.organizeChildren?.(fresh);
      util?.resizeContainerToFitChildren?.(fresh);
    });
    const row = shotRows(ed).find(r => r.frames.some(f => f.id === id));
    if (!row) throw new Error("Added a shot but couldn't find it afterwards.");
    return { frameId: id, number: row.number, name: row.name };
  }

  // Elements "+ → From canvas" switches the canvas to Frameo's "selectFromCanvas" tool, which waits
  // for an image click and hands the clicked shape to its resolve callback. Hand it our shape instead.
  function pickForElement(ed, { shapeId, url }) {
    const tool = ed.root?.children?.selectFromCanvas;
    if (!tool?.resolveCallback) throw new Error("Frameo isn't waiting for a canvas pick.");
    const file = u => String(u || '').split('?')[0].split('/').pop();
    let shape = shapeId && ed.getShapeById(shapeId);
    if (shape?.type !== 'imageSvg') { // older scans have no shape id: match the image file instead
      shape = ed.shapesArray.find(s => s.type === 'imageSvg' && s.props?.assetId
        && file(ed.getAssetById?.(s.props.assetId)?.props?.src) === file(url));
    }
    if (!shape) throw new Error("That image isn't on this canvas page. Re-scan the canvas, then retry.");
    if (tool.acceptsType && !tool.acceptsType(shape.type)) throw new Error("Frameo's pick isn't for images right now.");
    tool.resolveCallback(shape);
    ed.setSelectedTool('select');
    return { shapeId: shape.id };
  }

  // What's in a frame right now (children and their types/props): changes once Frameo starts
  // generating into it, which is how a job into a chosen shot is confirmed.
  function frameState(ed, { id }) {
    const frame = ed.getShapeById(id);
    if (!frame) return { signature: 'missing' };
    const kids = ed.getSortedChildIds(id).map(k => ed.getShapeById(k)).filter(Boolean);
    return { signature: JSON.stringify([frame.props, frame.meta, kids.map(k => [k.id, k.type, k.props])]) };
  }

  // A shot's newest finished take: the rightmost frame holding a customVideo with a video file.
  // ponytail: the file URL is looked for in the shape's props and its asset; check a real
  // customVideo's props (editor.getShapeById) if Frameo renames them.
  const VIDEO = /^https?:\/\/\S+\.(mp4|webm|mov)(\?|$)/i;
  function videoUrl(ed, shape) {
    const asset = shape.props?.assetId && ed.getAssetById?.(shape.props.assetId);
    const strings = [asset?.props?.src, ...Object.values(shape.props || {}), ...Object.values(asset?.props || {})]
      .filter(v => typeof v === 'string');
    return strings.find(v => VIDEO.test(v))
      || strings.find(v => /^https?:\/\//.test(v) && /saved-videos\//.test(v) && !/_thumb\.|\.(jpe?g|png|webp)(\?|$)/i.test(v));
  }
  function shotVideo(ed, { shot }) {
    const n = +String(shot).replace(/\D/g, '');
    const row = shotRows(ed).find(r => r.number === n);
    if (!row) throw new Error(`${shot} isn't on the canvas. Nothing was generated.`);
    for (const f of [...row.frames].reverse()) {
      for (const id of ed.getSortedChildIds(f.id)) {
        const s = ed.getShapeById(id);
        const url = s?.type === 'customVideo' && videoUrl(ed, s);
        if (url) return { url };
      }
    }
    throw new Error(`${shot} has no finished video yet. Retry once it has rendered. Nothing was generated.`);
  }

  const commands = {
    frameState,
    shotVideo,
    shots: ed => ({ rows: shotRows(ed) }),
    addShot,
    pickForElement,
    select: (ed, { id }) => { if (!ed.getShapeById(id)) throw new Error('frame not found'); ed.select(id); return { ids: [...ed.selectedIds] }; },
    selected: ed => ({ ids: [...ed.selectedIds] }),
  };

  window.addEventListener('message', e => {
    if (e.source !== window || e.data?.source !== 'elevique-content' || !commands[e.data.cmd]) return;
    let reply;
    try {
      if (!window.editor) throw new Error("Frameo's canvas isn't loaded on this page. Open the project's Canvas view, then retry.");
      reply = { ok: true, ...commands[e.data.cmd](window.editor, e.data.args || {}) };
    } catch (err) {
      reply = { ok: false, error: err.message };
    }
    // Request id last, so nothing in the reply (e.g. a frame id) can overwrite it.
    window.postMessage({ ...reply, source: 'elevique-bridge', id: e.data.id }, location.origin);
  });
})();
