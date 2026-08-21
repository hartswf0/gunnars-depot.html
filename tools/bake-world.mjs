// tools/bake-world.mjs — run the loop once so nobody's browser has to.
//
//   node tools/bake-world.mjs
//
// Writes assets/built/trailer.json: the finished world, its joints, its
// conditions, and the whole journal stored as per-step deltas. See operative/baked.js
// for why, and for what reads it back.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../operative/ingold.js';
import { checkAll } from '../operative/checks.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/built/trailer.json');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const t0 = Date.now();
const { world, loop } = build({ budget: 340 });
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`built in ${secs}s — ${world.elements.size} elements, ${world.joints.size} joints`);

const rec = (e) => ({ id: e.id, kind: e.kind, layer: e.layer, box: e.box, shear: e.shear,
  material: e.material, system: e.system, section: e.section, meta: e.meta,
  ports: e.ports, trace: e.trace });
const key = (e) => JSON.stringify(rec(e));

// The journal as deltas. A snapshot is only interesting where it differs from the
// one before it, and almost none of five hundred elements changes on any one move.
const recs = world.history;
const journal = [];
let prev = new Map();
for (let i = 0; i < recs.length; i++) {
  const after = recs[i + 1] && recs[i + 1].snapshot;
  const els = after ? after.elements : world.all().map(rec);
  const now = new Map(els.map(e => [e.id, e]));
  const add = [], mod = [], del = [];
  for (const [id, e] of now) {
    const was = prev.get(id);
    if (!was) add.push(e);
    else if (key(was) !== key(e)) mod.push(e);
  }
  for (const id of prev.keys()) if (!now.has(id)) del.push(id);
  const r = recs[i];
  journal.push({ title: r.note || r.kind,
    sub: `t${r.t} · ${r.op || r.kind}` + (r.cause ? ` · answering ${r.cause}` : ''),
    opened: (r.opened || []).map(c => ({ code: c.code, message: c.message })),
    closed: (r.closed || []).map(c => ({ code: c.code, message: c.message })),
    changed: r.elements || [],
    ...(add.length ? { add } : {}), ...(mod.length ? { mod } : {}), ...(del.length ? { del } : {}) });
  prev = now;
}

const conditions = checkAll(world).map(c => ({ code: c.code, severity: c.severity,
  message: c.message, elements: c.elements, measure: c.measure, repair: c.repair }));

const doc = {
  built: new Date().toISOString().slice(0, 10),
  seconds: +secs,
  datum: world.datum, walls: world.walls,
  elements: world.all().map(rec),
  joints: [...world.joints.entries()].map(([k, v]) => ({ key: k, value: v })),
  conditions,
  loop: { state: loop.state, steps: loop.steps, open: loop.open.length,
          walked: loop.trace.filter(t => t.kept === false).length },
  journal
};
fs.writeFileSync(OUT, JSON.stringify(doc));
const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
console.log(`wrote ${kb} kB — ${journal.length} frames, ${conditions.length} conditions, loop ${doc.loop.state}`);
