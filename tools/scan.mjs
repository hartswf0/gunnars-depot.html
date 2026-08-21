// tools/scan.mjs — medical imaging for a building.
//
//   node tools/scan.mjs                          scan the Ingold trailer
//   node tools/scan.mjs --stl path/to/thing.stl  scan any existing structure
//   node tools/scan.mjs --rays 512 --step 18     denser
//   node tools/scan.mjs --out assets/scan
//
// Produces, in the output directory:
//   calibration.json  what the instrument reads on a box known to be sealed
//   dome.png          the exposure plate: every ray that got out, unrolled
//   xray-x.png        radiograph looking along x
//   xray-y.png        radiograph looking along y
//   xray-z.png        plan radiograph
//   leaks.json        clusters, with the parts that bound each one
//   scan.html         all of it on one page
//
// No API key, no network, no renderer. It is arithmetic against the geometry.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { png, FILM, stretch } from './png.mjs';
import * as R from '../operative/radiography.js';
import { DENSITY } from '../operative/loads.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(flag('out', path.join(ROOT, 'assets/scan')));
const RAYS = Number(flag('rays', 256));
const STEP = Number(flag('step', 22));
const STL = flag('stl', null);
fs.mkdirSync(OUT, { recursive: true });

// ---- 1. calibrate before measuring anything ---------------------------------
// A number from an instrument nobody has checked is not a measurement.
const cal = R.calibrate({ rays: RAYS });
fs.writeFileSync(path.join(OUT, 'calibration.json'), JSON.stringify(cal, null, 1) + '\n');
console.log(`CALIBRATION  ${cal.verdict}`);
console.log(`             sealed box leaks ${cal.noiseFloor} of ${cal.cast}; ` +
            `a missing wall reads ${cal.knownHoleReads}`);
if (!cal.sealedIsSealed) {
  console.error('\nThe instrument is not honest. Nothing it says about a building means anything.');
  process.exit(1);
}

// ---- 2. the subject ---------------------------------------------------------
let occ, emitters, label, world = null;
if (STL) {
  // An existing structure, from a mesh. Triangles rather than boxes, so the
  // occluders are the triangles' own bounding slabs plus an exact test — which
  // is what `fromTriangles` does. Nothing about the scan changes.
  const { parseSTL } = await import('../operative/reference.js');
  const buf = fs.readFileSync(path.resolve(STL));
  const tris = parseSTL(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  occ = R.fromTriangles(tris);
  emitters = R.interiorOf(occ, { step: STEP });
  label = path.basename(STL);
  console.log(`SUBJECT      ${label}: ${tris.length} triangles`);
} else {
  const { build } = await import('../operative/ingold.js');
  const r = build({ budget: 120 });
  world = r.world;
  occ = R.occludersOf(world);
  emitters = R.emittersFor(world, { step: STEP });
  label = 'ingold-trailer';
  console.log(`SUBJECT      ${label}: ${world.elements.size} members, ${r.loop.state.toLowerCase()}`);
}
console.log(`             ${occ.solids.length} occluders, ${occ.holes.length} openings, ${emitters.length} emitters`);

// ---- 3. fill it with light --------------------------------------------------
const t0 = Date.now();
const s = R.scan(occ, emitters, { rays: RAYS });
const cl = R.clusters(s.escapes, 8);
console.log(`SCAN         ${s.cast} rays in ${((Date.now() - t0) / 1000).toFixed(1)}s: ` +
            `${s.escapes.length} got out where they should not, ${s.viaOpening.length} through openings`);
console.log(`             leak fraction ${(s.leakFraction * 100).toFixed(2)}%, ` +
            `${cl.length} distinct leaks, noise floor ${cal.noiseFloor}`);

const leaks = cl.map(c => ({ ...c,
  bounded: world ? R.around(world, c.at, 10).map(a => `${a.id} (${a.d.toFixed(1)} in)`) : [] }));
fs.writeFileSync(path.join(OUT, 'leaks.json'), JSON.stringify({
  of: label, rays: s.cast, escapes: s.escapes.length, viaOpening: s.viaOpening.length,
  leakFraction: s.leakFraction, calibration: cal, clusters: leaks
}, null, 1) + '\n');

for (const c of leaks.slice(0, 10))
  console.log(`  ${String(c.n).padStart(4)} rays  ${c.face}  at ${c.at.join(', ')}  ` +
              `${c.extent.join(' x ')} in` + (c.bounded.length ? `  between ${c.bounded.slice(0, 3).map(b => b.split(' ')[0]).join(', ')}` : ''));

// ---- 4. the plates ----------------------------------------------------------
const D = (e) => (world && world.get(e.id) ? (DENSITY[world.get(e.id).material] || 30) / 100 : 0.3);

// The unfolded surface: where the rays left, on the building itself.
const CELL = 220;
const u = R.unwrap(s.escapes, s.bounds, CELL);
const uo = R.unwrap(s.viaOpening, s.bounds, CELL);
// Each plate on its own exposure, with its peak printed beside it. Shared, the
// control group's 3,659 rays levelled the leak plate down to a few faint specks —
// the finding was there and unreadable. Two plates are compared by their numbers,
// not by their brightness.
const plate = (im, grid) => png(im.w, im.h, (x, y) => {
  const v = FILM(stretch(im.px[y * im.w + x], Math.max(im.peak, 1)));
  if (v[0] || v[1] || v[2]) return v;
  // faint frames, so a black face still reads as a face rather than as nothing
  const onEdge = grid.some(f =>
    ((x === f.x || x === f.x + f.w - 1) && y >= f.y && y < f.y + f.h) ||
    ((y === f.y || y === f.y + f.h - 1) && x >= f.x && x < f.x + f.w));
  return onEdge ? [22, 30, 40] : [4, 6, 9];
});
fs.writeFileSync(path.join(OUT, 'unwrapped.png'), plate(u, u.faces));
fs.writeFileSync(path.join(OUT, 'unwrapped-openings.png'), plate(uo, uo.faces));

const d = R.dome(s.escapes, 240, 120);
fs.writeFileSync(path.join(OUT, 'dome.png'),
  png(d.w, d.h, (x, y) => FILM(stretch(d.px[y * d.w + x], d.peak))));

const axes = [['x', 0], ['y', 1], ['z', 2]];
for (const [name, axis] of axes) {
  const g = R.radiograph(occ, axis, { w: 480, h: 480, density: D });
  fs.writeFileSync(path.join(OUT, `xray-${name}.png`),
    png(g.w, g.h, (x, y) => FILM(stretch(g.px[y * g.w + x], g.peak, 0))));
}
console.log(`PLATES       dome.png, dome-openings.png, xray-x/y/z.png -> ${path.relative(ROOT, OUT)}`);

// ---- 5. one page ------------------------------------------------------------
const rows = leaks.slice(0, 24).map(c =>
  `<tr><td class="n">${c.n}</td><td>${c.face}</td><td class="n">${c.at.join(', ')}</td>` +
  `<td class="n">${c.extent.join(' &times; ')}</td><td>${c.bounded.slice(0, 4).join('<br>') || '&mdash;'}</td></tr>`).join('\n');
fs.writeFileSync(path.join(OUT, 'scan.html'), `<!doctype html>
<meta charset="utf-8"><title>Scan — ${label}</title>
<style>
 body{margin:0;padding:16px;background:#07090c;color:#e8edf3;
   font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;max-width:1100px}
 h1{font-size:13px;letter-spacing:.12em;margin:0 0 2px}
 h2{font-size:11px;letter-spacing:.14em;color:#7c8894;margin:26px 0 6px;font-weight:600}
 p{color:#7c8894;margin:0 0 14px;max-width:62ch}
 .cal{border:1px solid ${cal.sealedIsSealed ? '#14532d' : '#7f1d1d'};
   background:${cal.sealedIsSealed ? '#08160e' : '#1a0a0b'};padding:8px 10px;margin:10px 0 0}
 .plates{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}
 figure{margin:0;background:#0b0e12;border:1px solid #1e262f}
 img{display:block;width:100%;height:auto;image-rendering:pixelated}
 figcaption{padding:5px 7px;color:#7c8894;font-size:10px}
 table{border-collapse:collapse;width:100%;font-size:11px}
 th,td{text-align:left;padding:4px 8px 4px 0;border-bottom:1px solid #141a21;vertical-align:top}
 th{color:#7c8894;font-size:9px;letter-spacing:.1em;text-transform:uppercase}
 td.n{font-variant-numeric:tabular-nums;white-space:nowrap}
</style>
<h1>SCAN — ${label.toUpperCase()}</h1>
<div class="cal"><b>${cal.verdict}</b><br>
A box known to be sealed leaks <b>${cal.noiseFloor}</b> of ${cal.cast} rays.
The same box with one wall removed reads <b>${cal.knownHoleReads}</b>.
Anything below the first number is the instrument, not the building.</div>

<h2>Exposure plate</h2>
<p>The building's own surface, unfolded flat, with every escaping ray plotted
where it actually left. Roof on top, underside at the bottom, the four walls in
the middle band. A sealed building develops black. A seam develops as a line,
because a seam is a line.</p>
<p>The second plate is the control group, on the same exposure: the rays that
left through a door or a window. If it is empty, the openings are not openings —
which is exactly what it said the first time it was run.</p>
<div class="plates">
 <figure><img src="unwrapped.png"><figcaption>LEAKS — ${s.escapes.length} of ${s.cast} rays, brightest pixel ${u.peak}</figcaption></figure>
 <figure><img src="unwrapped-openings.png"><figcaption>THROUGH OPENINGS — ${s.viaOpening.length} rays, brightest pixel ${uo.peak} — the control group</figcaption></figure>
 <figure><img src="dome.png"><figcaption>BY DIRECTION — the same leaks, sorted by which way they went</figcaption></figure>
</div>

<h2>Radiographs</h2>
<p>Parallel rays through the whole thing, carrying how much material each one
passed through. This finds nothing on its own; it shows density, and a part that
is not where anyone thought it was shows up as a shadow in the wrong place.</p>
<div class="plates">
 <figure><img src="xray-x.png"><figcaption>ALONG X — through the side</figcaption></figure>
 <figure><img src="xray-y.png"><figcaption>ALONG Y — through the end</figcaption></figure>
 <figure><img src="xray-z.png"><figcaption>ALONG Z — plan</figcaption></figure>
</div>

<h2>Leaks</h2>
<table>
<tr><th>rays</th><th>face</th><th>at</th><th>extent (in)</th><th>bounded by</th></tr>
${rows}
</table>`);
console.log(`PAGE         ${path.relative(ROOT, OUT)}/scan.html`);
