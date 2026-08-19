// tools/prove-ants.mjs — did acting on the colony make the model better?
//
//   node tools/prove-ants.mjs [git-ref]        default: the commit before the fix
//
// The colony's own score is not admissible as evidence for the colony. Every
// measure here comes from an instrument the colony does not touch, and both
// worlds are measured with the *same* stick — the current tree's instruments,
// applied to a build from each tree. The contact audit is written here, in this
// file, so neither tree's idea of contact gets to grade itself.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = process.argv[2] || '8d70673';
const WT = `/tmp/prove-ants-${REF}`;
if (!fs.existsSync(WT)) {
  execFileSync('git', ['worktree', 'add', '--detach', WT, REF], { cwd: ROOT, stdio: 'inherit' });
}

const before = await import(`${WT}/operative/ingold.js`);
const after  = await import(`${ROOT}/operative/ingold.js`);
const J = await import(`${ROOT}/operative/joints.js`);
const L = await import(`${ROOT}/operative/loads.js`);
const W = await import(`${ROOT}/operative/weather.js`);
const R = await import(`${ROOT}/operative/radiography.js`);
const T = await import(`${ROOT}/operative/tomography.js`);
const G = await import(`${ROOT}/operative/gravity.js`);

/** Plain AABB face contact, written once, applied to both. */
function audit(w) {
  const s = w.solids();
  let scheduled = 0, unfastened = 0, edgeOnly = 0;
  for (let i = 0; i < s.length; i++) for (let j = i + 1; j < s.length; j++) {
    const a = s[i], b = s[j];
    const ov = [0, 1, 2].map(k => Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]));
    if (ov.some(o => o < -0.02)) continue;
    if (!J.scheduleForPair(a, b)) continue;
    scheduled++;
    if (w.joints.has(J.joinKey(a.id, b.id))) continue;
    const d = ov.slice().sort((x, y) => y - x);
    if (Math.max(0, d[0]) * Math.max(0, d[1]) < 1) edgeOnly++; else unfastened++;
  }
  return { scheduled, unfastened, edgeOnly };
}

async function measure(mod) {
  const w = mod.build({ budget: 200 }).world;
  const g = w.grounded();
  const sh = L.shake(w, L.ROAD, g);
  const drop = G.dropTest(w);
  const pen = W.penetrations(w);
  const occ = R.occludersOf(w);
  const sc = R.scan(occ, R.emittersFor(w, { step: 16 }), { rays: 2048 });
  const ct = T.flood(T.voxelise(R.occludersOf(w, { medium: 'air' }), { step: 1 }));
  return { members: w.elements.size, joints: w.joints.size, ...audit(w),
    shakeFail: sh.failures.length, shakeWorst: sh.worst ? `${sh.worst.id} ${sh.worst.ratio}x` : '—',
    floating: drop.falling.length, totalFall: drop.totalFall,
    penetrations: pen.length, unflashed: pen.filter(p => !p.flashed).length,
    lb: Math.round(w.solids().reduce((n, e) => n + L.elementMass(e), 0)),
    escapes: sc.escapes.length, cast: sc.cast, ctEnclosed: ct.enclosed };
}

const B = await measure(before), A = await measure(after);
const ROWS = [
  ['members', 'members'], ['joints', 'joints'],
  ['scheduled contacts', 'scheduled'],
  ['  left unfastened', 'unfastened'],
  ['  edge-only, unnailable', 'edgeOnly'],
  ['members not held up', 'floating'],
  ['inches they would fall', 'totalFall'],
  ['road-shake failures', 'shakeFail'],
  ['roof penetrations', 'penetrations'],
  ['  unflashed', 'unflashed'],
  ['weight, lb', 'lb'],
  ['rays escaping (2048/lamp)', 'escapes'],
  ['CT enclosed cells at 1 in', 'ctEnclosed']
];
console.log(`\nBEFORE = ${REF}   AFTER = working tree\n`);
console.log('measure'.padEnd(30) + 'BEFORE'.padStart(9) + 'AFTER'.padStart(9) + '   change');
console.log('-'.repeat(62));
for (const [name, k] of ROWS) {
  const d = A[k] === B[k] ? 'same' : `${A[k] > B[k] ? '+' : ''}${A[k] - B[k]}`;
  console.log(name.padEnd(30) + String(B[k]).padStart(9) + String(A[k]).padStart(9) + '   ' + d);
}
console.log('worst shake case'.padEnd(30) + String(B.shakeWorst).padStart(9) + String(A.shakeWorst).padStart(9));
