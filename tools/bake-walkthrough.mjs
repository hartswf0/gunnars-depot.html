// tools/bake-walkthrough.mjs — the trailer, frozen, so a browser can open it.
//
//   node tools/bake-walkthrough.mjs [outfile]
//
// `build()` takes a hundred seconds: it runs the whole design loop, and the loop
// is the point of it. A viewer that runs the loop on page load is a viewer nobody
// opens. So the world is built once, here, and written out as the thing it is —
// boxes, bodies, reaches, and the map of where a body fits — which the walkthrough
// then loads in a few milliseconds and which you can also just read.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../operative/ingold.js';
import { checkAll } from '../operative/checks.js';
import * as EB from '../operative/everybody.js';
import * as RH from '../operative/reach.js';
import { fitMap } from '../operative/inhabit.js';
import { comfort } from '../operative/comfort.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'assets/walkthrough/trailer.json'));
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const t0 = Date.now();
const { world: w } = build({ budget: 200 });
console.log('built in', ((Date.now() - t0) / 1000).toFixed(1), 's —', w.elements.size, 'elements');

const r2 = (v) => +v.toFixed(2);
const elements = w.all().map(e => ({
  id: e.id, kind: e.kind, layer: e.layer, material: e.material || null,
  system: e.meta.system || null,
  p: e.box.p.map(r2), s: e.box.s.map(r2),
  shear: e.shear ? { axis: e.shear.axis, rise: e.shear.rise } : null,
  why: e.meta.why || e.meta.role || null,
  hostedBy: e.meta.hostedBy || null
}));

const seg = (g) => ({ b: g.bone, a: g.a.map(r2), z: g.b.map(r2), r: r2(g.r) });
const bodies = Object.keys(EB.ACTIVITIES).map(name => {
  const x = EB.attempt(w, name, { stature: 72 });
  return { name, at: x.at, stand: x.stand, headTop: x.headTop, clash: x.clash,
    work: x.work, collisions: x.collisions,
    segments: x.body.segments.map(seg) };
});

// Each station re-solved so the viewer can draw the arm that got there.
const fm = fitMap(w, { stature: 72, step: 2 });
const rr = RH.reachAll(w, { stature: 72, fm });
const OBS = RH.snapshot(w);
const stations = rr.stations.map(S => {
  if (!S.from) return { ...S, segments: [] };
  const el = w.get(S.on) || (S.orOn ? w.get(S.orOn) : null);
  const ig = RH.permitted(w, el, S.target, (S.past || []).concat(S.inside ? [S.inside] : []));
  const stance = RH.STANCES.find(s => s.id === S.stance) || RH.STANCES[0];
  const floor = fm.plan.floorTop[fm.at(
    Math.round((S.from[0] - fm.lo[0]) / fm.step - 0.5),
    Math.round((S.from[1] - fm.lo[1]) / fm.step - 0.5))] ?? 15.8;
  const op = RH.operate(w, { target: S.target, stand: S.from, floor, stature: 72,
                             stance, ignore: ig, obs: OBS });
  return { id: S.id, what: S.what, room: S.room, daily: S.daily, verdict: S.verdict,
           ok: S.ok, why: S.why, stance: S.stance, target: S.target, from: S.from,
           through: S.through || [], wires: S.wires || [],
           segments: op.body.segments.map(seg) };
});

// Where a body fits, as a bitmap the walk can be clamped to.
const packed = {};
for (const k of ['STAND', 'WALK', 'TURN', 'PASS'])
  packed[k] = Buffer.from(fm.fits[k]).toString('base64');

const conditions = (checkAll(w) || []).map(c => ({
  code: c.code, severity: c.severity, message: c.message, elements: c.elements }));

const cf = comfort(w, { stature: 72, fitMap: fm });

const doc = {
  built: new Date().toISOString().slice(0, 10),
  datum: w.datum,
  elements, bodies, stations,
  missing: rr.missing,
  comfort: cf.tasks.map(t => ({ task: t.task, ok: t.ok,
    tests: t.tests.map(x => ({ id: x.id, ok: x.ok, is: x.is, want: x.want })) })),
  conditions,
  fit: { n: fm.n, lo: fm.lo.map(r2), step: fm.step, area: fm.area, bits: packed },
  counts: { elements: elements.length, bodies: bodies.length,
    stations: stations.length, reached: stations.filter(s => s.ok).length,
    clash: bodies.reduce((a, b) => a + b.clash, 0) }
};
fs.writeFileSync(OUT, JSON.stringify(doc));
console.log('wrote', (fs.statSync(OUT).size / 1024).toFixed(0) + ' kB to', OUT);
console.log(JSON.stringify(doc.counts));
