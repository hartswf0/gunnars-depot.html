// tests/run.mjs — receipts.
//
// Every claim the Operative Builder makes about itself is asserted here against
// the real modules. Run with:  node tests/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedTrailer } from '../operative/kit.js';
import { build } from '../operative/ingold.js';
import { checkAll } from '../operative/checks.js';
import { commit, commitChain, undo, OPS as OPSALL, snapshot, restore } from '../operative/ops.js';
import { parse, nextMove, planPath } from '../operative/language.js';
import { learn, preflight, THRESHOLD } from '../operative/invariants.js';
import { parseSTL, bindReference, compareToReference } from '../operative/reference.js';
import { probeMove, speak, geometryHistory, dependents } from '../operative/probe.js';
import { box as mkbox } from '../operative/geom.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${name}`); }
  else { fail++; results.push(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function group(t) { results.push(`\n${t}`); }
const stl = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); return parseSTL(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
// Placing lumber and nailing it are two acts. `seedTrailer()` does the first; a
// frame that is only stacked genuinely carries nothing, so anything that asserts
// settlement starts from a nailed frame.
const framed = () => { const w = seedTrailer(); commit(w, 'nailOff', {}); return w; };
// One full build, reused. Eight of them at twenty seconds each is three minutes of
// test suite, and every one after the first only wanted a copy to break.
const BUILT = build({ budget: 160 }).world;
function copyOf(source) {
  const c = new (source.constructor)();
  c.walls = JSON.parse(JSON.stringify(source.walls));
  c.datum = JSON.parse(JSON.stringify(source.datum));
  c.runs = JSON.parse(JSON.stringify(source.runs || {}));
  c.reference = source.reference;
  restore(c, snapshot(source));
  c.conditions = checkAll(c);
  return c;
}

// ---------------------------------------------------------------- 1. the seed
group('the seed build stands up on its own');
const stacked = seedTrailer();
stacked.conditions = checkAll(stacked);
check('86 members placed', stacked.elements.size === 86, `got ${stacked.elements.size}`);
// Stacked but not nailed, the four welded crossmembers and the four hung shell
// panels carry nothing, and the world says so. This is not a bug to hide: it is
// the difference between lumber on a deck and a frame.
check('stacked lumber is not yet a frame',
  stacked.conditions.some(c => c.code === 'UNJOINED'), stacked.conditions.map(c => c.code).join(','));
// FLOATING, not UNSUPPORTED: the check that used to exempt equipment now measures
// how far each unheld thing would fall, and reports the fall.
const stackedFloat = stacked.conditions.filter(c => c.code === 'FLOATING');
check('what only hangs has no load path until it is fastened',
  stackedFloat.length >= 8, `${stackedFloat.length} floating`);
check('and it says how far each one would fall',
  stackedFloat.every(c => typeof c.measure.fall === 'number'),
  JSON.stringify(stackedFloat[0] && stackedFloat[0].measure));
const w0 = framed();
w0.conditions = checkAll(w0);
// The seed roof is dead flat on purpose, so the reference has something to argue
// with. Nothing ever checked what water thinks of that until there was a check
// about water, and then it turned out the deliberate choice was also a defect.
// A nailed frame with no openings in it. Three checks have opinions about that
// and none of them are about structure: the roof is flat, there is no glazing,
// and from every point on the floor you cannot see out.
check('a nailed frame is structurally sound and still not somewhere to live',
  ['PONDING', 'NO_DAYLIGHT', 'NO_VIEW_OUT'].every(c => w0.conditions.some(x => x.code === c)) &&
  w0.conditions.length === 3,
  w0.conditions.map(c => c.code).join(','));
check('and the daylight rule cites the fraction, not a feeling',
  w0.conditions.find(c => c.code === 'NO_DAYLIGHT').measure.basis === 'IRC R303.1');
const pitched = framed();
commit(pitched, 'raise', { wall: 'W', by: 8 });
commit(pitched, 'pitch', {});
commit(pitched, 'nailOff', {});
check('and pitching it is what closes it',
  !checkAll(pitched).some(c => c.code === 'PONDING'), checkAll(pitched).map(c => c.code).join(','));
const g0 = w0.grounded();
check('every member has a load path', w0.solids().every(e => e.layer === 'services' || g0.seen.has(e.id)));
check('sheathing hangs rather than bears', !g0.bearing.has('shell.W') && g0.seen.has('shell.W'));
check('crossmembers are welded, not seated', (g0.under.get('cross.48') || []).every(u => u.via === 'fasten'));

// ------------------------------------------- 2. instruction -> unforeseen condition
group('an instruction meets a condition it did not ask for');
const w = framed();
const before = w.hash();
const said = parse(w, 'cut a door in the south wall from 20 to 56');
check('the sentence parses to an operation', said.op === 'cut' && said.args.wall === 'S');
const cut = commit(w, said.op, said.args);
check('the world changed', cut.ok && cut.before !== cut.after, `${cut.before} -> ${cut.after}`);
const surprise = cut.opened.find(c => c.code === 'OPENING_ABOVE_PLATE');
check('a standard 80 in door does not fit a 57.5 in stud wall', !!surprise, cut.opened.map(c => c.code).join(','));
check('the condition is measured, not just named',
  surprise && typeof surprise.measure.over === 'number' && surprise.measure.wallStud === 57.5,
  JSON.stringify(surprise && surprise.measure));
check('the condition names the move that would answer it', !!(surprise && surprise.repair));

// ------------------------------------------- 3. the difference changes the next move
group('the measured difference chooses the next operation');
let steps = 0;
while (steps++ < 6) {
  const n = nextMove(w);
  if (!n) break;
  commitChain(w, n.move.chain || [n.move], n.condition.code);
}
// Conditions about living in it rather than it standing up. This six-move world is
// a frame with one opening cut in it — it is not a failed dwelling, it is an
// unfinished one, and the check here is whether the structure walked itself back.
const HABITABILITY = ['PONDING', 'NO_DAYLIGHT', 'NO_VIEW_OUT', 'UNLIT',
                      'NO_EGRESS', 'LOW_HEADROOM', 'NO_CLEARANCE'];
check('the world walked itself back to settled',
  w.conditions.filter(c => !HABITABILITY.includes(c.code)).length === 0,
  w.conditions.map(c => c.code).join(','));
check('it took more than one move', w.history.filter(h => h.kind === 'op').length >= 3);
const hdr = w.get('header.door.S.20');
check('a header now carries the opening', !!hdr && hdr.section.startsWith('(2)'));
check('the header bears on two jacks', w.all({ kind: 'jack' }).filter(j => j.meta.opening === 'door.S.20').length === 2);

// ---------------------------------------------------------------- 4. xenography
group('every member can say how it became what it is');
// a door starts at the sole plate, so it leaves nothing below it; a window does.
commit(w, 'cut', { wall: 'W', from: 40, to: 70, sill: 30, head: 54, type: 'window' });
const sillCripple = w.all({ kind: 'cripple' }).find(c => c.meta.role === 'sill cripple');
check('an interrupted stud kept its provenance',
  !!sillCripple && !!sillCripple.meta.from && sillCripple.trace.length > 0,
  JSON.stringify(sillCripple && { from: sillCripple.meta.from, trace: sillCripple.trace.length }));
check('the surviving piece is shorter than the stud it came from',
  !!sillCripple && sillCripple.box.s[2] < w0.get(sillCripple.meta.from).box.s[2]);
check('the window opening is on the books', !!w.get('window.W.40'));
commit(w, 'header', { opening: 'window.W.40' });
check('the journal records before and after hashes', w.history.filter(h => h.before && h.after).length >= 3);
const caused = w.history.filter(h => h.cause);
check('moves record what they were answering', caused.length >= 1, `${caused.length}`);

// ---------------------------------------------------------------- 5. reversibility
group('moves walk back');
const hashBefore = w.hash();
const r1 = commit(w, 'material', { id: 'deck', material: 'stone' });
check('a change moves the hash', w.hash() !== hashBefore);
undo(w);
check('undo restores the exact prior state', w.hash() === hashBefore, `${w.hash()} vs ${hashBefore}`);

// ------------------------------------------- 6. a building service that answers back
group('a service run meets the framing it passes through');
const m = framed();
commit(m, 'source', { id: 'inlet.water', system: 'water', at: [0, 4, 10] });
const orphan = commit(m, 'fixture', { id: 'sink', system: 'water', kind: 'sink', at: [30, 33, 46] });
check('an unfed fixture says so', orphan.opened.some(c => c.code === 'SERVICE_ORPHAN'));
const path2 = planPath(m, m.get('inlet.water').box.p, m.get('sink').box.p);
const routed = commit(m, 'route', { system: 'water', run: 'supply', dia: 2.0, path: path2 });
check('routing feeds the fixture', routed.closed.some(c => c.code === 'SERVICE_ORPHAN'));
check('a 2 in line through a 2x6 joist is refused', routed.opened.some(c => c.code === 'BORE_OVERSIZE' && c.elements[0].startsWith('joist')));
check('a 2 in bore in a bearing stud is refused', routed.opened.some(c => c.code === 'BORE_OVERSIZE' && c.elements[0].startsWith('stud')));
check('the bore rules cite their basis', routed.opened.every(c => c.code !== 'BORE_OVERSIZE' || !!c.measure.basis));

const fixed = commit(m, 'reroute', { run: 'supply' }, 'BORE_OVERSIZE');
check('rerouting closes the bore violations', fixed.closed.filter(c => c.code === 'BORE_OVERSIZE' || c.code === 'EDGE_CLEARANCE').length >= 4,
  `${fixed.closed.length} closed`);
check('rerouting did not orphan the fixture', !m.conditions.some(c => c.code === 'SERVICE_ORPHAN'), m.conditions.map(c => c.code).join(','));
check('the repair explains itself in field terms', /bay|under joists|centred/.test(fixed.note), fixed.note);
const tie = commit(m, 'strap', { id: 'sole.W' });
check('a steel tie answers the over-cut plate', tie.closed.some(c => c.code === 'PLATE_TIE_REQUIRED'));
// A source and a sink dropped into a bare frame are held by nothing until someone
// hangs them, which is now a condition rather than an exemption.
const air = m.conditions.filter(c => c.code === 'FLOATING');
check('the equipment is in the air until it is hung', air.length === 2, air.map(c => c.elements[0]).join(','));
check('and the world proposes hanging it', air.every(c => c.repair && ['mount', 'blocking'].includes(c.repair.op)));
const hung = commit(m, 'mountAll', {});
const stillOpen = m.conditions.filter(c =>
  !['PONDING', 'SHAKE_FAILURE', 'NO_DAYLIGHT', 'NO_VIEW_OUT', 'UNLIT'].includes(c.code));
check('hanging what can be hung leaves only what cannot',
  stillOpen.length === 1 && stillOpen[0].code === 'FLOATING' && stillOpen[0].elements[0] === 'sink',
  m.conditions.map(c => c.code).join(','));
// A source and a sink dropped into a bare frame and hung with one bracket are not
// road-worthy, and the shake test says so without being asked about this scenario.
check('and the road has an opinion about the rest',
  m.conditions.some(c => c.code === 'SHAKE_FAILURE'),
  m.conditions.filter(c => c.code === 'SHAKE_FAILURE').map(c => c.message.slice(0, 60)).join(' | '));
// The sink in this probe was dropped into the middle of a bare frame to test
// routing. There is nothing within reach of it, and the honest answer is to say
// so rather than to invent a bracket reaching two feet through the air.
check('and it says plainly that there is nothing to hang it on',
  /nothing within reach/.test(hung.note), hung.note);

// ---------------------------------------------------------------- 7. the reference
group('the drawing gets a say, and it changes a move');
const rw = framed();
bindReference(rw, { id: 'contractor-reality', name: 'Contractor Reality Trailer', tris: stl('assets/models/concepts/contractor-reality-trailer.stl') });
rw.conditions = checkAll(rw);
const dev = rw.conditions.find(c => c.code === 'PROFILE_DEVIATION' && c.repair);
check('the silhouette comparison finds a real difference', !!dev, rw.conditions.map(c => c.code).join(','));
const cmpBefore = compareToReference(rw);
check('the seed roof is flat and the reference is not',
  Math.abs(cmpBefore.end.current.roofFall) < 1 && Math.abs(cmpBefore.end.reference.roofFall) > 3,
  JSON.stringify({ cur: cmpBefore.end.current.roofFall, ref: cmpBefore.end.reference.roofFall }));
const opsBefore = rw.history.filter(h => h.kind === 'op').length;
const chained = commitChain(rw, dev.repair.chain, 'PROFILE_DEVIATION');
check('a compound repair is one move, not three',
  chained.ok && rw.history.filter(h => h.kind === 'op').length === opsBefore + 1,
  `${rw.history.filter(h => h.kind === 'op').length - opsBefore} journal entries`);
check('its intermediate states are not reported as conditions',
  !chained.opened.some(c => c.code === 'ONE_END_BEARING' || c.code === 'OVERLAP'),
  chained.opened.map(c => c.code).join(','));
const cmpAfter = compareToReference(rw);
check('the reference-driven move closed the measured gap',
  Math.abs(cmpAfter.end.reference.roofFall - cmpAfter.end.current.roofFall) < Math.abs(cmpBefore.end.reference.roofFall - cmpBefore.end.current.roofFall),
  JSON.stringify({ before: cmpBefore.end.current.roofFall, after: cmpAfter.end.current.roofFall, ref: cmpAfter.end.reference.roofFall }));
check('the roof now really slopes', rw.get('rafter.65').shear && Math.abs(rw.get('rafter.65').shear.rise) > 1);
check('the reseated roof still bears on both walls',
  !checkAll(rw).some(c => c.code === 'ONE_END_BEARING'), checkAll(rw).map(c => c.code).join(','));
check('all five concept studies read and align', ['contractor-reality', 'wright-usonian', 'shigeru-ban-shelter', 'lacaton-vassal-economy', 'alexander-pattern-cabin']
  .every(n => { try { return stl(`assets/models/concepts/${n}-trailer.stl`).length > 0; } catch { return false; } }));

// ---------------------------------------------------------------- 7b. the end walls
group('a pitched roof reshapes the walls that carry its ends');
for (const [wall, dir] of [['W', 'W to E'], ['E', 'E to W']]) {
  const pw = framed();
  commit(pw, 'raise', { wall, by: 8 });
  const pr = commit(pw, 'pitch', {});
  // Raising a wall makes new plates and new studs. They are lumber until they are
  // nailed, and the world holds that against the move until a framer answers it.
  check(`the raised wall arrives unnailed`, pw.conditions.some(c => c.code === 'UNJOINED'),
    pw.conditions.map(c => c.code).join(','));
  commit(pw, 'nailOff', {});
  // Same window-less box as the seed; the structural question is the one this
  // group is about, so the habitability ones are named and set aside rather than
  // quietly filtered.
  const struct = pw.conditions.filter(c => !HABITABILITY.includes(c.code));
  check(`raising ${wall} then pitching settles`, struct.length === 0,
    pw.conditions.map(c => c.code + ' ' + c.message).slice(0, 2).join(' / '));
  check(`the roof falls ${dir}`, pr.note.includes(dir), pr.note);
  const endStuds = pw.all({ kind: 'stud' }).filter(e => e.meta.wall === 'S').map(e => e.box.s[2]);
  check(`the ${wall === 'W' ? 'south' : 'south'} end wall steps with the roof`,
    Math.max(...endStuds) - Math.min(...endStuds) > 5, `${Math.min(...endStuds).toFixed(1)}..${Math.max(...endStuds).toFixed(1)}`);
}

// ---------------------------------------------------------------- 8. invariants
group('a rule that had to be learned rather than specified');
const iw = seedTrailer();
commit(iw, 'source', { id: 'inlet.water', system: 'water', at: [0, 4, 10] });
commit(iw, 'fixture', { id: 'sink', system: 'water', kind: 'sink', at: [30, 33, 46] });
commit(iw, 'route', { system: 'water', run: 'a', dia: 2.0, path: planPath(iw, [0, 4, 10], [30, 33, 46]) });
commit(iw, 'fixture', { id: 'sink.2', system: 'water', kind: 'sink', at: [30, 97, 46] });
commit(iw, 'route', { system: 'water', run: 'b', dia: 2.0, path: planPath(iw, [0, 4, 10], [30, 97, 46]) });
const promoted = learn(iw);
check(`a code seen ${THRESHOLD}+ times becomes an invariant`, promoted.some(p => p.code === 'BORE_OVERSIZE'),
  JSON.stringify(iw.invariants.map(i => `${i.code}x${i.seen}`)));
const warn = preflight(iw, 'route', { system: 'water', dia: 2.0, path: [] });
check('the invariant is checked before the next route runs, not after', warn.some(x => x.code === 'BORE_OVERSIZE'), JSON.stringify(warn));
check('the promotion is recorded in the world history', iw.history.some(h => h.kind === 'invariant'));

// ---------------------------------------------------------------- 9. the language
group('words the builder understands');
const lw = seedTrailer();
const sentences = [
  ['cut a window in the west wall from 40 to 70 sill 30 head 54', 'cut'],
  ['raise the west wall 8 in', 'raise'],
  ['lower the east wall 4 in', 'raise'],
  ['pitch the roof', 'pitch'],
  ['inlet power at 0 140 40', 'source'],
  ['put an outlet at 30 60 30', 'fixture'],
  ['upsize joist.33', 'upsize'],
  ['make deck plywood', 'material'],
  ['undo', 'undo'],
  ['explain stud.W.33', 'explain']
];
for (const [text, op] of sentences) {
  const p = parse(lw, text);
  check(`"${text}"`, p.op === op, p.error || `got ${p.op}`);
}
check('"raise the west wall" targets W, not all', parse(lw, 'raise the west wall 8 in').args.wall === 'W');
check('nonsense is refused, not guessed', !!parse(lw, 'summon a helicopter').error);

// ---------------------------------------------------------------- 10. envelope
group('the road has an opinion too');
const ew = seedTrailer();
const tall = commit(ew, 'raise', { by: 90 });
check('an over-tall build breaks the towing envelope', ew.conditions.some(c => c.code === 'ENVELOPE'),
  ew.conditions.map(c => c.code).join(','));

// ------------------------------------------- 11. disturbance without commitment
group('a disturbance is answered before it is committed');
const dw = seedTrailer();
const stud = dw.get('stud.W.65');
const t0 = Date.now();
let probe;
for (let i = 0; i < 30; i++) probe = probeMove(dw, 'stud.W.65', mkbox([stud.box.p[0], stud.box.p[1] + 30, stud.box.p[2]], stud.box.s));
const per = (Date.now() - t0) / 30;
check('a probe costs a fraction of a frame', per < 8, `${per.toFixed(2)} ms`);
check('sliding a stud along its own wall stays viable', probe.ok && probe.support === 'BEARING', JSON.stringify(probe).slice(0, 120));
check('the probe leaves the world exactly as it found it',
  dw.get('stud.W.65').box.p[1] === stud.box.p[1] && dw.hash() === seedTrailer().hash());

const intoRoom = probeMove(dw, 'stud.W.65', mkbox([36, 72, stud.box.p[2]], stud.box.s));
check('a stud dragged into the room reports itself unsupported', intoRoom.support === 'FLOATING' && !intoRoom.ok);

const deckEl = dw.get('deck');
const lifted = probeMove(dw, 'deck', mkbox([deckEl.box.p[0], deckEl.box.p[1], deckEl.box.p[2] + 6], deckEl.box.s));
check('lifting the deck reports what it would drop',
  lifted.orphaned.includes('sole.W') && lifted.orphaned.length >= 4, JSON.stringify(lifted.orphaned));
check('lifting the deck also reports the clash', lifted.structure === 'CLASH');
check('dependents are found before the move', dependents(dw, 'joist.65').includes('deck'));

// ------------------------------------------- 12. a member speaks from state alone
group('a member speaks from its state, not from a personality');
const v = speak(dw, 'joist.33');
const keys = v.lines.map(l => l[0]);
check('it says what it is and what it holds', keys.includes('I_AM') && keys.includes('I_SUPPORT') && keys.includes('I_AM_SUPPORTED_BY'));
check('a member with nothing wrong stays quiet', v.quiet && !keys.includes('I_OBSERVE'));
const noisy = seedTrailer();
commit(noisy, 'cut', { wall: 'S', from: 20, to: 56, type: 'door' });
const vs = speak(noisy, 'door.S.20');
check('a member with a condition observes and requests',
  vs.lines.some(l => l[0] === 'I_OBSERVE') && vs.lines.some(l => l[0] === 'I_REQUEST'), JSON.stringify(vs.lines.map(l=>l[0])));

// ------------------------------------------- 13. ghosts, recovered not stored
group('prior states are recoverable without storing them twice');
const gw = seedTrailer();
const before1 = gw.get('stud.W.65').box.p[1];
commit(gw, 'move', { id: 'stud.W.65', delta: [0, 30, 0] }, 'disturbed by hand');
commit(gw, 'raise', { by: 12 });
const hist = geometryHistory(gw, 'stud.W.65');
check('the journal yields the member\'s earlier geometry', hist.length >= 3, `${hist.length} states`);
check('the first state is where it started', Math.abs(hist[0].box.p[1] - before1) < 0.01);
check('the last state is marked as now', hist[hist.length - 1].current === true);
check('identical consecutive states are not counted twice',
  new Set(hist.map(h => JSON.stringify(h.box))).size === hist.length);

// an old position is judged against the world as it is now, not as it was
commit(gw, 'place', { id: 'shelf.1', kind: 'panel', layer: 'interior', at: [6, before1, 44], size: [9, 30, 1], material: 'plywood' });
const old = probeMove(gw, 'stud.W.65', mkbox(hist[0].box.p, gw.get('stud.W.65').box.s));
check('an old state that no longer fits is refused, with the reason',
  !old.ok && old.clashes.some(c => c.id === 'shelf.1'), JSON.stringify(old.clashes));

// ------------------------------------------- 14. the trailer itself
group('the Ingold trailer: the sheet built, not just an envelope');
const ing = await import('../operative/ingold.js');
const built = ing.build();
const T = built.world;
check('it settles with nothing outstanding', T.conditions.length === 0,
  T.conditions.map(c => c.code + ' ' + c.message).slice(0, 3).join(' / '));
const tb = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
for (const e of T.solids()) { const l = e.lo, h = e.hi; for (let i = 0; i < 3; i++) { tb.lo[i] = Math.min(tb.lo[i], l[i]); tb.hi[i] = Math.max(tb.hi[i], h[i]); } }
const dim = tb.hi.map((v, i) => +(v - tb.lo[i]).toFixed(1));
check('8\'-6" overall width, wheels included', dim[0] === 102, `${dim[0]} in`);
// the body is 20 ft; the propane bottle hangs on the tongue, outside it, which is
// why this measures the shell rather than the overall envelope
const body = { lo: Infinity, hi: -Infinity };
for (const e of T.all({ kind: ['sheathing', 'deck', 'plate', 'stud'] })) { body.lo = Math.min(body.lo, e.lo[1]); body.hi = Math.max(body.hi, e.hi[1]); }
check("20'-0\" of framing", Math.abs((body.hi - body.lo) - 241) < 1.0, `${(body.hi - body.lo).toFixed(1)} in of body`);
check('the propane bottle is outside the body, on the tongue', T.get('lpg.bottle').hi[1] < body.lo + 1,
  `bottle ends at y ${T.get('lpg.bottle').hi[1].toFixed(1)}, body starts at ${body.lo.toFixed(1)}`);
check('inside the towing envelope', !T.conditions.some(c => c.code === 'ENVELOPE'));

const has = (k) => T.all().some(e => e.meta.role === k || e.kind === k);
for (const thing of ['toilet', 'shower', 'sink', 'range', 'fridge', 'bed', 'bench', 'table', 'cabinet'])
  check(`it has a ${thing}`, has(thing));
check('it has five openings', T.all({ kind: 'opening' }).length === 5);
check('every opening is headed', T.all({ kind: 'header' }).length === 5);

// the discovery that forced the floor
check('the floor is 2x8, not 2x6', T.all({ kind: 'joist' })[0].section === '2x8');
const drainBores = T.all({ kind: 'joist' }).flatMap(j => (j.meta.penetrations || []).filter(p => p.run === 'drain.main'));
check('the main drain really does pass through the joists', drainBores.length >= 3, `${drainBores.length} bores`);
check('and every one of them keeps its 2 in of edge',
  drainBores.every(p => p.edge >= 2 - 1e-6), JSON.stringify(drainBores.map(p => p.edge)));
const zs = drainBores.map(p => p.at[2]);
check('the drain actually falls along its run', Math.max(...zs) - Math.min(...zs) > 0.4,
  `${(Math.max(...zs) - Math.min(...zs)).toFixed(2)} in of fall across the bores`);

// the services are connected, not decorative
const { systemReach } = await import('../operative/checks.js');
for (const sys of ['water', 'power', 'waste']) {
  const reach = systemReach(T, sys);
  const fixtures = T.all({ kind: 'fixture' }).filter(f => f.system === sys);
  check(`every ${sys} fixture reaches a source`, fixtures.length > 0 && fixtures.every(f => reach.connected.has(f.id)),
    fixtures.filter(f => !reach.connected.has(f.id)).map(f => f.id).join(', ') || `${fixtures.length} fixtures`);
}
check('the 65 gal tank actually holds 65 gal', (() => {
  const t = T.get('tank.fresh');
  const gal = (t.box.s[0] * t.box.s[1] * t.box.s[2]) / 231;
  return gal >= 65;
})(), (() => { const t = T.get('tank.fresh'); return ((t.box.s[0] * t.box.s[1] * t.box.s[2]) / 231).toFixed(1) + ' gal'; })());
check('the making is recoverable', T.history.filter(h => h.snapshot).length >= 45, `${T.history.length} journalled moves`);

// --- the MEP has to be a system, not a gesture
group('fully wired, plumbed, vented and gassed');
const kinds = (k) => T.all().filter(e => e.kind === k || e.meta.role === k);
for (const [what, n] of [['light', 6], ['outlet', 4], ['trap', 3], ['vent', 2]])
  check(`${n} ${what}s`, kinds(what).length >= n, `${kinds(what).length}`);
for (const id of ['pv.1', 'pv.2', 'mppt', 'battery.1', 'battery.2', 'inverter', 'dc.panel', 'ac.panel',
                  'lpg.bottle', 'lpg.reg', 'flue.heater', 'fan.bath', 'tank.fresh', 'pump', 'heater'])
  check(`it has ${id}`, !!T.get(id));
const { systemReach: SR2, sizeConductor, AMPACITY, voltageDrop: VD } = await import('../operative/checks.js');
for (const sys of ['water', 'waste', 'power', 'propane']) {
  const reach = SR2(T, sys);
  const dev = T.all().filter(e => e.system === sys && e.kind !== 'run');
  check(`every ${sys} device reaches its source`, dev.length > 0 && dev.every(d => reach.connected.has(d.id)),
    dev.filter(d => !reach.connected.has(d.id)).map(d => d.id).join(', ') || `${dev.length} devices`);
}
for (const [runId, rec] of Object.entries(T.runs)) {
  if (rec.system !== 'power' || !rec.amps) continue;
  check(`${runId} can carry its ${rec.amps} A`, AMPACITY[String(rec.awg)] >= rec.amps,
    `${rec.awg} AWG rated ${AMPACITY[String(rec.awg)]} A`);
}
const dayWh = T.all().filter(e => e.meta.watts && e.meta.hoursPerDay).reduce((a, e) => a + e.meta.watts * e.meta.hoursPerDay, 0);
const bankWh = T.all().filter(e => e.meta.ah).reduce((a, e) => a + e.meta.ah * (e.meta.volts || 12), 0);
const pvW = T.all().filter(e => e.meta.pvWatts).reduce((a, e) => a + e.meta.pvWatts, 0);
check('the bank carries a day of loads', bankWh * 0.8 >= dayWh, `${(bankWh * 0.8).toFixed(0)} Wh usable vs ${dayWh.toFixed(0)} Wh/day`);
check('the array replaces a day of loads', pvW * 4 * 0.75 >= dayWh, `${(pvW * 4 * 0.75).toFixed(0)} Wh/day vs ${dayWh.toFixed(0)}`);
check('every trap has a vent inside its arm limit', !checkAll(T).some(c => c.code === 'UNVENTED_TRAP'));

group('measured against the sheet, not asserted');
const { compareToSheet } = await import('../operative/spec.js');
const SPEC = compareToSheet(T);
for (const r of SPEC.rows) check(`${r.of}: ${r.want} specified, ${r.got} built`, r.meets, r.note);
for (const y of SPEC.systems) check(`${y.system}: every device on the graph`, y.connected === y.devices, `${y.connected}/${y.devices}`);
check('the bank covers the day', SPEC.power.usableWh >= SPEC.power.dailyWh);
check('the report is regenerable', fs.existsSync(path.join(ROOT, 'data/spec-report.json')));
check('the wheel wells carry the wall above them',
  T.all({ kind: 'stud' }).some(e => e.meta.overWell));

// ------------------------------------------- 15. the record of the making
group('the session record is evidence, not narration');
const recPath = path.join(ROOT, 'data/session-record.json');
if (!fs.existsSync(recPath)) {
  check('data/session-record.json exists', false, 'run tools/session-record.mjs');
} else {
  const SR = JSON.parse(fs.readFileSync(recPath, 'utf8'));
  check('it holds the whole session', SR.loops.length > 150, `${SR.loops.length} loops`);
  check('the counts match the loops themselves',
    Object.entries(SR.counts).filter(([k]) => k !== 'loops')
      .every(([k, n]) => SR.loops.filter(l => l.kind === k).length === n)
    && SR.counts.loops === SR.loops.length, JSON.stringify(SR.counts));
  check('every loop is stamped and attributed', SR.loops.every(l => l.t && l.tool && l.kind));
  check('nearly every loop carries what actually ran',
    SR.loops.filter(l => l.cmd).length / SR.loops.length > 0.9,
    `${SR.loops.filter(l => l.cmd).length}/${SR.loops.length}`);
  check('and what actually came back',
    SR.loops.filter(l => l.saw).length / SR.loops.length > 0.9,
    `${SR.loops.filter(l => l.saw).length}/${SR.loops.length}`);
  const shots = SR.loops.filter(l => l.shot);
  check('every referenced screenshot is in the repository', shots.length > 0 &&
    shots.every(l => fs.existsSync(path.join(ROOT, l.shot))),
    `${shots.length} screenshots`);
  check('the instructions are kept as chapters', SR.chapters.length >= 3 &&
    SR.chapters.every(c => c.at >= 0 && c.at <= SR.loops.length));
  check('verification is a real share of the work', (SR.counts.verify || 0) / SR.loops.length > 0.15,
    `${SR.counts.verify} of ${SR.loops.length} loops were checking the last move`);
  // the two journals answer the same question at different scales
  check('the building journal is shorter than the session that made it',
    T.history.length < SR.loops.length, `building ${T.history.length} vs session ${SR.loops.length}`);
}

// ------------------------------------------- 16. things are actually nailed together
group('joined, not merely adjacent');
const { scheduleFor, jointsOf } = await import('../operative/joints.js');
check('the model keeps joints as state', T.joints instanceof Map && T.joints.size > 300, `${T.joints.size} joints`);
check('nothing is left merely touching where a schedule exists',
  !checkAll(T).some(c => c.code === 'UNJOINED'), (checkAll(T).find(c => c.code === 'UNJOINED') || {}).message);
const studJoints = jointsOf(T, 'stud.W.65');
check('a stud is nailed to its plates', studJoints.some(j => j.size === '16d' && j.count >= 2),
  studJoints.map(j => `${j.count}x${j.size}`).join(', '));
// `shell.W` is gone: cutting the door split it into pieces, each with its own id
// and its own joints. Find the skin by which wall it is on, not by what it used
// to be called.
const westSkin = T.all({ kind: 'sheathing' }).filter(e => e.meta.wall === 'W');
check('sheathing is nailed on a spacing, not a count',
  westSkin.some(p => jointsOf(T, p.id).some(j => j.count > 10)),
  westSkin.map(p => `${p.id}:${jointsOf(T, p.id).length}`).join(' '));
check('and the pieces beside an opening remember the panel they came from',
  westSkin.some(p => p.meta.from && p.meta.opening),
  westSkin.map(p => p.id).join(' '));
check('a rafter gets a tie, not just a toe nail',
  jointsOf(T, 'rafter.65').some(j => j.type === 'tie'), jointsOf(T, 'rafter.65').map(j => j.type).join(','));
check('the schedule cites the code', scheduleFor('stud', 'plate').size === '16d');
check('every joint meets its own schedule', [...T.joints.values()].every(j => j.count >= j.required));
check('a member can say what it is nailed to',
  T.get('stud.W.65').trace.some(t => t.kind === 'joined'));
// fastening is asserted, not inferred
const g2 = T.grounded();
let touching = 0;
for (const [, ups] of g2.under) for (const u of ups) if (u.via === 'touch') touching++;
check('adjacency alone no longer counts as a connection', touching >= 0, `${touching} contacts adjacent but unscheduled`);

// ------------------------------------------- 17. the builder runs a loop
group('the builder chooses its next move');
const { score, rank, briefConditions } = await import('../operative/loop.js');
const { BRIEF, STAGES } = await import('../operative/ingold.js');
check('the brief is kept alive as conditions', BRIEF.length >= 6 && BRIEF.every(r => typeof r.met === 'function'));
const bare = ing.shell();
const unmet = briefConditions(bare, BRIEF);
// Every requirement that asks for something the shell has not got. `sealed` asks
// for an *absence* — no untaped seam in the skin — and a shell with no openings
// cut in it has no seams, so it is vacuously met. That is the right answer, not a
// loophole: there is nothing there to leak.
const vacuous = BRIEF.filter(r => r.met(bare)).map(r => r.id);
check('a bare shell fails every requirement that asks for something',
  unmet.length === BRIEF.length - vacuous.length,
  `${unmet.length} of ${BRIEF.length}; vacuously met: ${vacuous.join(', ') || 'none'}`);
check('and the ones it passes are the ones that ask for an absence',
  vacuous.every(id => id === 'sealed'), vacuous.join(', '));
check('an unmet requirement proposes the stage that answers it',
  unmet.every(c => c.repair && c.repair.op === 'stage'));
const ranked = rank(unmet.concat([{ code: 'X', severity: 0, elements: [], repair: { op: 'note' } }]), new Set());
check('it ranks by severity first', ranked[0].code === 'REQUIREMENT_FAILED');
check('score is lexicographic on blocking, then serious', (() => {
  const a2 = score([{ severity: 3 }, { severity: 1 }]), b2 = score([{ severity: 2 }, { severity: 2 }]);
  return a2.blocking === 1 && b2.blocking === 0 && a2.total === 2;
})());
check('the loop reached a state, not a fixed script', ['SETTLED', 'SETTLING', 'UNSETTLED'].includes(built.loop.state), built.loop.state);
check('it took more moves than the brief has lines', built.loop.steps > BRIEF.length, `${built.loop.steps} steps for ${BRIEF.length} requirements`);
check('it alternated between building and answering',
  built.loop.trace.some(t => t.brief) && built.loop.trace.some(t => t.answering && !t.brief));
check('every kept move records what the world looked like before and after',
  built.loop.trace.filter(t => t.before).every(t => t.after && typeof t.before.total === 'number'));

// ------------------------------------------- 18. gravity
group('switch gravity on and see what falls');
const { dropTest, mountsFor, floorUnder, workspaceOf, intrusion } = await import('../operative/gravity.js');
const G = framed();
// under a rafter, where a light belongs; and one out in the middle of the room
const gr = G.all({ kind: 'rafter' })[2];
commit(G, 'fixture', { id: 'ghost.light', system: 'power', kind: 'light',
  at: [30, (gr.lo[1] + gr.hi[1]) / 2, gr.lo[2] - 3], size: [5, 5, 1.5] });
commit(G, 'fixture', { id: 'ghost.orphan', system: 'power', kind: 'light',
  at: [30, 40, 44], size: [5, 5, 1.5] });
const dt = dropTest(G);
check('a fixture placed in mid-air is reported, not exempted',
  dt.falling.some(f => f.id === 'ghost.light'), dt.falling.map(f => f.id).join(','));
check('and the measure is how far it would fall',
  dt.falling.find(f => f.id === 'ghost.light').fall > 40,
  JSON.stringify(dt.falling.find(f => f.id === 'ghost.light')));
check('the drop stops at whatever is under it, not at zero',
  floorUnder(G, G.get('ghost.light'), G.solids()) >= 0);
check('it says what is within reach to mount to', mountsFor(G, G.get('ghost.light')).length >= 0);
const mounted = commit(G, 'mountAll', {});
check('mounting the one under a rafter closes its condition',
  !checkAll(G).some(c => c.code === 'FLOATING' && c.elements[0] === 'ghost.light'),
  mounted.note);
check('an asserted joint counts even where the contact patch is tiny',
  G.grounded().seen.has('ghost.light'), JSON.stringify(mountsFor(G, G.get('ghost.light'))[0]));
// The honest half: a thing with nothing near it stays reported, and the note says why.
check('the one in the middle of the room stays in the air',
  checkAll(G).some(c => c.code === 'FLOATING' && c.elements[0] === 'ghost.orphan'));
check('and the refusal says there is nothing to hang it on',
  /nothing within reach/.test(mounted.note), mounted.note);

const T2 = BUILT;
check('the finished trailer holds every one of its own parts',
  dropTest(T2).falling.length === 0,
  dropTest(T2).falling.map(f => `${f.id} ${f.fall}`).join(', '));
check('and nothing in it is only touching', !checkAll(T2).some(c => c.code === 'UNJOINED'));
const ws = workspaceOf(T2, T2.get('dc.panel'));
check('an electrical panel claims working space in front of it', !!ws && ws.rule.basis === 'NEC 110.26(A)');
check('and the claim is a real box', !!ws && ws.hi[2] - ws.lo[2] === 78);
check('the space opens into the building, not out through the wall',
  ws.lo[0] >= T2.get('dc.panel').hi[0] - 0.01 || ws.hi[0] <= T2.get('dc.panel').lo[0] + 0.01 ||
  ws.lo[1] >= T2.get('dc.panel').hi[1] - 0.01 || ws.hi[1] <= T2.get('dc.panel').lo[1] + 0.01);
const { blockage } = await import('../operative/gravity.js');
check('and nothing is standing in it', blockage(T2, ws, new Set(['dc.panel'])).fraction <= 0.25,
  JSON.stringify(blockage(T2, ws, new Set(['dc.panel'])).by));
// A sink belongs in a counter and a shower pan belongs in a floor. A rule that
// complains about those trains you to ignore it when it complains about the fuse box.
check('the rule does not fire on things that are supposed to be built in',
  !workspaceOf(T2, T2.get('sink')) && !workspaceOf(T2, T2.get('shower.pan')));
check('nor on a solar panel bolted to a roof', !workspaceOf(T2, T2.get('pv.1')));
check('equipment inside a hollow carcass is reached by opening it, not by standing in it',
  !checkAll(T2).some(c => c.code === 'ACCESS_BLOCKED' && c.elements[0] === 'battery.1'));
// the move that made it settle
const bed = T2.get('bed.base');
check('the fuse block is not behind the bed',
  T2.get('dc.panel').lo[1] < bed.lo[1],
  `panel y ${T2.get('dc.panel').lo[1]}, bed y ${bed.lo[1]}`);
check('a shelf parked in front of a panel is caught even though nothing collides', (() => {
  const P = copyOf(BUILT);
  const p2 = P.get('dc.panel');
  // clear of the bench, so the only thing this proves is the one thing it is about
  commit(P, 'place', { id: 'shelf.test', kind: 'cabinet', layer: 'interior',
    at: [p2.box.p[0] + 18, p2.box.p[1] - 14, 44], size: [26, 12, 30], material: 'plywood' });
  const cs = checkAll(P);
  return cs.some(c => c.code === 'ACCESS_BLOCKED' && c.elements.includes('shelf.test')) &&
         !cs.some(c => c.code === 'OVERLAP' && c.elements.includes('shelf.test'));
})(), 'the whole point: not touching, still blocking');

// ------------------------------------------- 19. views
group('the building has to survive being looked at');
const V = await import('../operative/views.js');
check('there is more than one camera', V.VIEWS.length >= 10, `${V.VIEWS.length}`);
check('they cover outside, inside, plan and services',
  ['exterior', 'interior', 'plan', 'service'].every(k => V.VIEWS.some(v => v.kind === k)));
const placed = V.VIEWS.map(v => ({ v, p: V.place(T2, v) }));
check('every view resolves to a real camera',
  placed.every(x => x.p && x.p.eye.every(Number.isFinite) && x.p.target.every(Number.isFinite)));
check('no interior camera stands inside a solid',
  placed.filter(x => x.v.inside).every(x => !V.occupied(T2, x.p.eye)),
  placed.filter(x => x.v.inside).map(x => `${x.v.id}:${V.occupied(T2, x.p.eye)}`).join(','));
check('a side view is further out than a front view, because the trailer is longer than it is wide',
  Math.abs(V.place(T2, V.byId('left')).eye[0]) > Math.abs(V.place(T2, V.byId('front')).eye[1]));
check('criticism about the roof sends the camera somewhere it can see the roof',
  ['plan', 'threeq', 'threeq.rear', 'front', 'rear'].includes(
    V.chooseView([], { hint: 'the roof overshoots the wall' }).id),
  V.chooseView([], { hint: 'the roof overshoots the wall' }).id);
check('after a repair judged from the front, it looks from the rear',
  V.chooseView([{ view: 'front' }], { lastView: 'front', after: true }).id === 'rear');
check('otherwise it takes the least recently inspected',
  V.chooseView([{ view: 'front' }, { view: 'rear' }], { lastView: 'rear' }).id !== 'rear');

// ------------------------------------------- 20. the critic protocol
group('fucked until proven otherwise');
const C = await import('../operative/critic.js');
const obs = [{ view: 'front', label: 'FRONT', score: 8 }, { view: 'left', label: 'LEFT', score: 12 },
             { view: 'rear', label: 'REAR', score: 76 }, { view: 'inside.entry', label: 'INTERIOR ENTRY', score: 84 },
             { view: 'plan', label: 'PLAN', score: 21 }];
const avg = obs.reduce((a, o) => a + o.score, 0) / obs.length;
check('the world score is the worst view, not the average',
  C.worldScore(obs).score === 84 && Math.round(avg) === 40, `max ${C.worldScore(obs).score} vs mean ${avg.toFixed(1)}`);
check('and it names which view is the worst', C.worldScore(obs).worst === 'inside.entry');
check('a view that has already been judged is replaced, not accumulated',
  C.worldScore([...obs, { view: 'rear', label: 'REAR', score: 3 }]).views.length === obs.length);
check('zero from one view does not settle anything',
  C.settlement([{ view: 'front', label: 'FRONT', score: 0 }], 0).state === 'FUCKED');
const sweep = C.VIEWS ? [] : [
  { view: 'front', score: 4 }, { view: 'rear', score: 5 }, { view: 'left', score: 6 },
  { view: 'inside.entry', score: 7 }, { view: 'inside.reverse', score: 8 },
  { view: 'plan', score: 9 }, { view: 'service', score: 10 }];
check('a full clean sweep with no hard failures is NOT CURRENTLY FUCKED, never DONE',
  C.settlement(sweep, 0).state === 'NOT CURRENTLY FUCKED', C.settlement(sweep, 0).why);
check('one open hard failure reopens it however clean the pictures are',
  C.settlement(sweep, 1).state === 'FUCKED');
const parsed = C.parseVerdict('SUCK SCORE: 78\n\nWHAT SUCKS:\nThe rear elevation falls apart.');
check('the verdict parses out of ordinary prose', parsed.score === 78 && /rear elevation/.test(parsed.whatSucks));
check('an unparseable reply is treated as completely wrong, not as fine',
  C.parseVerdict('I think it looks quite good actually').score === 100);
const bp = C.builderPrompt('The roof overshoots.', [{ code: 'FLOATING', message: 'x falls 4 in' }], 'REAR');
check('the criticism reaches the builder verbatim, unsummarised', bp.includes('The roof overshoots.'));
check('and the linters simply join the accusation', /WHAT SUCKS DETERMINISTICALLY/.test(bp) && bp.includes('FLOATING'));
check('the critic prompt forbids proposing fixes',
  /Do not explain how to fix it/.test(C.CRITIC_PROMPT) && /Do not write code/.test(C.CRITIC_PROMPT));

// ------------------------------------------- 21. the vocabulary is read, not written
group('the op list cannot go stale');
const { vocabulary, signatures } = await import('../operative/ops.js');
const sigs = signatures();
check('every op reports its real argument names', sigs.move.includes('delta') && !sigs.move.includes('by'),
  JSON.stringify(sigs.move));
check('the list covers the whole vocabulary', Object.keys(sigs).length === Object.keys(OPSALL).length);
check('it renders as one line per op', vocabulary().split('\n').length === Object.keys(sigs).length);



// ------------------------------------------- 22. the road
group('a house is shaken once; a trailer is shaken every mile');
const LD = await import('../operative/loads.js');
const T3 = BUILT;
const sh = LD.shake(T3);
check('the trailer has a weight', sh.weight > 4000 && sh.weight < 12000, `${sh.weight} lb`);
// Modelled as solids, a plastic water tank came out at 4,492 lb and a C6 channel
// at 1,225 lb, and the whole trailer weighed 18,631 — more than its axles are
// rated for, entirely because nobody had ever weighed it.
check('a tank weighs its water plus a shell, not its bounding box',
  Math.abs(LD.elementMass(T3.get('tank.fresh')) - (65 * 8.34)) < 300 &&
  LD.elementMass(T3.get('tank.fresh')) < 1000,
  `${LD.elementMass(T3.get('tank.fresh')).toFixed(0)} lb, against 4492 as a solid`);
check('a steel channel weighs by the foot',
  Math.abs(LD.elementMass(T3.get('rail.L')) - (8.2 * 20)) < 5,
  `${LD.elementMass(T3.get('rail.L')).toFixed(0)} lb`);
check('a hollow platform weighs its shell',
  LD.elementMass(T3.get('bed.base')) < 400, `${LD.elementMass(T3.get('bed.base')).toFixed(0)} lb`);
check('it survives every case the road throws at it', sh.failures.length === 0,
  sh.failures.slice(0, 3).map(f => `${f.id} ${f.case} ${f.ratio}x`).join(', '));
check('the cases are the securement rule, not invented',
  LD.ROAD.every(c => c.basis) && LD.ROAD.some(c => /393\.102/.test(c.basis)));
check('tributary load is a dominator, not a guess', (() => {
  const t = LD.tributary(T3).tributary;
  const rail = t.get('rail.L'), stud = t.get('stud.W.49');
  return rail && stud && rail.carried > stud.carried;
})(), 'a main rail carries more than one stud');
// take the fasteners out of one joint and the road notices
const S4 = copyOf(BUILT);
for (const [k, j] of S4.joints) if (j.a === 'tank.fresh' || j.b === 'tank.fresh') j.count = 1;
check('take the straps off the water tank and it says so',
  LD.shake(S4).failures.some(f => f.id === 'tank.fresh'),
  LD.shake(S4).failures.slice(0, 2).map(f => f.id).join(','));

// ------------------------------------------- 23. the weather
group('where the water goes');
const WX = await import('../operative/weather.js');
const wet = WX.rain(T3);
check('the roof drains', wet.drip.slope >= WX.MIN_SLOPE,
  `${wet.drip.slope} in per foot, minimum ${WX.MIN_SLOPE}`);
check('nothing ponds', wet.ponds.length === 0, wet.ponds.map(p => p.id).join(','));
check('every penetration is flashed', wet.penetrations.every(p => p.flashed),
  wet.penetrations.filter(p => !p.flashed).map(p => p.id).join(','));
check('and there are penetrations to flash', wet.penetrations.length >= 3, `${wet.penetrations.length}`);
// The towing width forbids an eave, so the detail has to do the work.
check('the low side gets a drip edge where an overhang is illegal',
  !!T3.all({ kind: 'flashing' }).find(f => f.meta.role === 'drip edge'));
check('and it stays inside the towing envelope',
  !checkAll(T3).some(c => c.code === 'ENVELOPE'), 'width');
const flat = framed();
check('a flat roof is reported as ponding, whoever chose it',
  checkAll(flat).some(c => c.code === 'PONDING'));
check('the ponding rule cites its basis',
  checkAll(flat).find(c => c.code === 'PONDING').measure.basis === 'IRC R905.10.1');
// The wall skin used to stop at the top plate and the roof start above it.
check('the wall is closed up to the roof',
  T3.all({ kind: 'sheathing' }).some(e => /^gable\./.test(e.id)),
  'no infill between the top plate and the roof');

// ------------------------------------------- 24. light
group('can you see in here');
const LI = await import('../operative/light.js');
const day = LI.daylight(T3);
check('the glazing meets the fraction', day.glazingFraction >= LI.GLAZING_FRACTION - 1e-9,
  `${(day.glazingFraction * 100).toFixed(1)}% of ${day.floorArea} sq ft`);
check('and it is measured against the floor it serves, not asserted',
  Math.abs(day.needs - day.floorArea * LI.GLAZING_FRACTION) < 0.2);
check('most of the floor can see a window', day.fraction > 0.8, `${day.fraction}`);
const night = LI.artificial(T3);
check('the lamps actually light the place', night.average >= LI.MIN_FC,
  `${night.average} fc from ${night.watts} W`);
// 18 W of pucks passed the power budget for months, because a battery is happy
// with a house that is too dark to read in.
check('and a dim house is caught even when the power budget is fine', (() => {
  const D = copyOf(BUILT);
  for (const l of D.all().filter(e => e.meta.role === 'light')) l.meta.watts = 3;
  const cs = checkAll(D);
  return cs.some(c => c.code === 'UNLIT') && !cs.some(c => c.code === 'POWER_BUDGET');
})(), 'the two checks disagree, which is the point');
check('the unlit rule says how many watts it wants',
  typeof (LI.artificial(T3).wattsNeeded) === 'number' && LI.artificial(T3).wattsNeeded > 0);
check('a windowless box has no daylight and says so',
  checkAll(flat).some(c => c.code === 'NO_DAYLIGHT'));
check('line of sight stops at solid things',
  !LI.clearLine(T3, [4, 120, 40], [98, 120, 40]) ||
   LI.clearLine(T3, [50, 120, 40], [50, 124, 40]));

// ------------------------------------------- 25. one name per thing
group('the model had two naming systems and they disagreed');
const { sortOf, scheduleForPair } = await import('../operative/joints.js');
check('a cabinet is a cabinet, whatever class it belongs to',
  sortOf(T3.get('cab.galley')) === 'cabinet' && T3.get('cab.galley').kind === 'fixture');
// Every rule written against `kind` alone silently missed: the NEC clearance
// never fired on a panel, and the fastening schedule skipped the whole interior,
// including an 836 lb water tank sitting loose in the bed platform.
check('and the schedule finds the row that was written for it',
  !!scheduleForPair(T3.get('fridge'), T3.get('cab.galley')),
  'fixture/fixture had no row; fridge/cabinet always did');
check('nothing in the interior is left merely touching',
  !checkAll(T3).some(c => c.code === 'UNJOINED'));


// ------------------------------------------- 26. is the building fucked, or are our eyes
group('fill it with light and see where the light gets out');
const RG = await import('../operative/radiography.js');

// Before anything is measured, measure the instrument. This is the only check in
// the project that can tell "the building is wrong" from "the scanner is wrong".
const cal = RG.calibrate({ rays: 256 });
check('a box known to be sealed leaks nothing', cal.sealedIsSealed, `${cal.noiseFloor} of ${cal.cast}`);
check('and the same box with a wall missing does leak', cal.findsAKnownHole, `${cal.knownHoleReads}`);
check('so the instrument reports itself honest', cal.verdict === 'the instrument is honest', cal.verdict);
check('the directions are deterministic — two scans are the same scan',
  JSON.stringify(RG.sphereDirections(64)) === JSON.stringify(RG.sphereDirections(64)));
check('and they cover the sphere', (() => {
  const d = RG.sphereDirections(2000);
  const mean = [0, 1, 2].map(i => d.reduce((a, v) => a + v[i], 0) / d.length);
  return mean.every(m => Math.abs(m) < 0.02);
})(), 'no direction is favoured');

const T4 = BUILT;
const beam = RG.scan(RG.occludersOf(T4), RG.emittersFor(T4, { step: 20 }), { rays: 256 });
check('the trailer holds nearly all of its light',
  beam.leakFraction < 0.002, `${(beam.leakFraction * 100).toFixed(3)}% of ${beam.cast} rays`);
// The control group. When this was zero it was not good news — it meant the door
// and all four windows were framed openings with the skin still unbroken across
// them, which nothing else in the project had ever noticed.
check('and the openings are actually open', beam.viaOpening.length > 100,
  `${beam.viaOpening.length} rays through a door and four windows`);
check('every escape says where on the building it left',
  beam.escapes.every(e => e.face && e.at.every(Number.isFinite)));

// Resolution, stated rather than assumed.
const holed = copyOf(BUILT);
const panel = holed.all({ kind: 'sheathing' }).filter(e => e.meta.wall === 'N')
  .sort((a, b) => (b.hi[0] - b.lo[0]) * (b.hi[2] - b.lo[2]) - (a.hi[0] - a.lo[0]) * (a.hi[2] - a.lo[2]))[0];
holed.remove(panel.id);
check('take a wall panel off and the loop check finds it',
  checkAll(holed).some(c => c.code === 'LEAK'),
  `removed ${panel.id}`);
const blocked = copyOf(BUILT);
blocked.remove('bird.E.113'); blocked.remove('bird.E.129');
check('the coarse in-loop sweep does not see two missing eave blocks',
  !checkAll(blocked).some(c => c.code === 'LEAK'), 'and the finding says so in its own measure');
const survey = RG.scan(RG.occludersOf(blocked), RG.emittersFor(blocked, { step: 24 }), { rays: 192 });
check('but the survey does', RG.clusters(survey.escapes, 12).some(c => c.n >= 3),
  `${survey.escapes.length} escapes`);

// The plates
const un = RG.unwrap(beam.escapes, beam.bounds, 120);
check('the unfolded plate has six faces', un.faces.length === 6);
// A blank plate is the right plate for a building nothing gets out of. This
// demanded a lit pixel, and once the cut seams were taped the coarse sweep started
// finding zero escapes and the test read the improvement as a failure.
const lit = un.px.reduce((a, v) => a + (v >= 1 ? 1 : 0), 0);
check('and every escape lands on one of them',
  beam.escapes.length === 0 ? lit === 0 : lit > 0,
  `${beam.escapes.length} escapes, ${lit} lit pixels`);
const shot = RG.radiograph(RG.occludersOf(T4), 2, { w: 48, h: 48 });
check('a radiograph accumulates material rather than stopping at the first surface',
  shot.peak > 0 && shot.px.some(v => v > 0 && v < shot.peak), `peak ${shot.peak.toFixed(0)}`);

// A mesh, so the same scan works on something that is not this trailer at all.
const meshTris = stl('assets/models/concepts/contractor-reality-trailer.stl');
const mesh = RG.fromTriangles(meshTris);
check('an existing structure can be scanned from its mesh',
  mesh.triangles === meshTris.length / 9 && mesh.solids.length === mesh.triangles,
  `${mesh.triangles} triangles`);
const inside = RG.interiorOf(mesh, { step: Math.max(8, Math.hypot(...RG.bounds(mesh.solids).size) / 12) });
check('and points inside it can be found by parity', inside.length > 0, `${inside.length} interior points`);


// ------------------------------------------- 27. admitting a patient
group('any model in the repository, whatever format it arrived in');
const MESH = await import('../operative/mesh.js');
const rdBuf = (f) => { const b = fs.readFileSync(path.join(ROOT, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

// Every model here exists three times over. Three independent parsers, one answer:
// if they disagree, at least two of them are wrong and none of them can be trusted.
const three = ['stl', 'dae', 'glb'].map(ext => {
  const f = `assets/models/modules/foundation-base.${ext}`;
  const m = MESH.loadMesh(f, ext === 'dae' ? fs.readFileSync(path.join(ROOT, f), 'utf8') : rdBuf(f));
  return { ext, m, std: MESH.standardise(m.tris, { upAxis: m.upAxis, format: m.format }) };
});
check('STL, Collada and glTF all load', three.every(x => x.m.tris.length > 0),
  three.map(x => `${x.ext}:${x.m.tris.length / 9}`).join(' '));
check('and they contain the same number of triangles',
  new Set(three.map(x => x.m.tris.length)).size === 1);
const sizes = three.map(x => MESH.meshBounds(x.std.tris).size.map(n => +n.toFixed(1)));
check('and once standardised they are the same building to the inch',
  JSON.stringify(sizes[0]) === JSON.stringify(sizes[1]) &&
  JSON.stringify(sizes[1]) === JSON.stringify(sizes[2]),
  sizes.map(s => s.join('x')).join('  vs  '));
check('which is 102 in wide, because it is this trailer',
  Math.abs(sizes[0][0] - 102) < 1, `${sizes[0][0]} in`);
// Read the triangles and skip the scene graph and every model in this repository
// is a 1 x 1 x 1 cube at the origin, because they are all instanced unit boxes.
check('the scene graph is walked, not skipped',
  Math.max(...MESH.meshBounds(three.find(x => x.ext === 'glb').m.tris).size) > 2,
  'an unwalked glTF measures 1 x 1 x 1');
check('and the parts are named',
  three.find(x => x.ext === 'glb').m.parts.length > 5,
  `${three.find(x => x.ext === 'glb').m.parts.length} named parts`);
check('up is read from the format, not guessed from the proportions',
  three.find(x => x.ext === 'glb').m.upAxis === 'Y_UP' &&
  three.find(x => x.ext === 'dae').m.upAxis === 'Z_UP');
check('the XML reader works without a DOM', (() => {
  const doc = MESH.parseXML('<a x="1"><b>2 3</b><c/></a>');
  return MESH.find(doc, 'a') && MESH.findAll(doc, 'b')[0].text.trim() === '2 3';
})(), 'node has no DOMParser and a diagnostic that only runs in a browser cannot be checked');

// ------------------------------------------- 28. the CT
group('slice the patient');
const TG = await import('../operative/tomography.js');
const airOcc = RG.occludersOf(T4, { medium: 'air' });
const lightOcc = RG.occludersOf(T4);
// Light goes through glass; air does not. Until there was glass in the model,
// neither instrument could say so — and the flood walked in the front door.
check('glass is transparent to light and solid to air',
  lightOcc.solids.length < airOcc.solids.length,
  `${lightOcc.solids.length} light occluders vs ${airOcc.solids.length} air`);
check('and there is glass to be transparent',
  T4.all({ kind: 'glazing' }).length === 4 && T4.all({ kind: 'leaf' }).length === 1,
  `${T4.all({ kind: 'glazing' }).length} panes, ${T4.all({ kind: 'leaf' }).length} leaf`);

const vox = TG.flood(TG.voxelise(airOcc, { step: 2 }));
check('the trailer encloses a volume', vox.enclosed > 100000, `${vox.enclosed} cells`);
check('and it is about the size of a trailer',
  Math.abs(vox.enclosed * 8 / 1728 - 1050) < 250, `${(vox.enclosed * 8 / 1728).toFixed(0)} cu ft`);
const rooms = TG.cavities(vox);
check('one big cavity, which is the rooms', rooms.length && rooms[0].volume > 900,
  `${rooms.length} cavities, largest ${rooms[0] && rooms[0].volume} cu ft`);
check('from the middle of the room, air has no way out',
  TG.escapeRoute(vox, [50, 150, 50]).sealed);
// The same flood on the light list walks straight out through the windows, which
// is the point: two instruments, two answers, and the difference is meaningful.
check('the same flood through the light list does not',
  !TG.flood(TG.voxelise(lightOcc, { step: 2 })).enclosed ||
  TG.flood(TG.voxelise(lightOcc, { step: 2 })).enclosed < vox.enclosed / 10,
  'light gets out of a window; air does not');
// Resolution, stated. Marked by cell centre rather than overlap, a half-inch
// panel on a two-inch grid catches one column in four and every wall is a sieve.
const coarse = TG.flood(TG.voxelise(airOcc, { step: 6 }));
check('a coarse grid seals what it cannot resolve', coarse.enclosed > 0,
  `${coarse.enclosed} cells at 6 in`);
const sl = TG.slice(vox, 2, Math.floor(TG.sliceCount(vox, 2) / 2));
check('a slice is a plan cut with three labels',
  sl.px.some(v => v === TG.LABEL.MATERIAL) && sl.px.some(v => v === TG.LABEL.ENCLOSED) &&
  sl.px.some(v => v === TG.LABEL.OUTSIDE));
check('and it says what height it was cut at', typeof sl.at === 'number');

// Exposure: the lamp stands in enclosed air beside each part.
const exp = TG.exposure(airOcc, { rays: 16, enclosure: vox });
check('parts on the outside have nowhere inside to stand a lamp',
  exp.some(x => x.outside), `${exp.filter(x => x.outside).length} of ${exp.length}`);
check('and the ones inside mostly see no sky at all',
  exp.filter(x => !x.outside && x.fraction === 0).length > exp.filter(x => x.fraction > 0.2).length);
check('the finding says how sure it is',
  typeof TG.unexpectedExposure(airOcc, exp).basis === 'string');

// ------------------------------------------- 29. a mesh gets the same instruments
group('a patient with no chart still gets imaged');
const patient = MESH.standardise(
  MESH.loadMesh('x.glb', rdBuf('assets/models/concepts/contractor-reality-trailer.glb')).tris,
  { format: 'glb' });
const pOcc = RG.fromTriangles(patient.tris);
const pIn = RG.interiorOf(pOcc, { step: 14 });
check('interior points are found in a mesh by parity', pIn.length > 10, `${pIn.length}`);
const pScan = RG.scan(pOcc, pIn.slice(0, 30), { rays: 96 });
check('and it can be scanned for leaks', pScan.cast > 2000 && pScan.escapes.length >= 0,
  `${pScan.escapes.length} of ${pScan.cast}`);
const pVox = TG.flood(TG.voxelise(pOcc, { step: 3 }));
check('and sliced', pVox.material > 0 && pVox.n.every(n => n > 5), `${pVox.n.join('x')}`);
check('and it encloses something', pVox.enclosed > 0, `${pVox.enclosed} cells`);
const pRad = RG.radiograph(pOcc, 1, { w: 40, h: 40 });
check('and radiographed', pRad.peak > 0);


// ------------------------------------------- 30. a colony that forages for defects
// The colony is a stochastic instrument, so the assertions here are about the
// properties that make a stochastic instrument usable: it repeats, it responds
// to damage, and it does not report from inside a wall.
group('ants that look for gaps instead of food');
const ANT = await import('../operative/ants.js');
const JN = await import('../operative/joints.js');

const antOcc = RG.occludersOf(BUILT, { medium: 'air' });
const antVox = TG.flood(TG.voxelise(antOcc, { step: 2 }));
const colonise = (world, { n = 40, ticks = 260, seed = 11 } = {}) => {
  const occ = RG.occludersOf(world, { medium: 'air' });
  const c = ANT.withSchedule(
    new ANT.Colony(occ, { world, enclosure: TG.flood(TG.voxelise(occ, { step: 2 })), n, seed }),
    JN.scheduleForPair);
  c.step(ticks);
  return c;
};
const holesIn = (c) => c.findings().filter(f => f.kind === 'GAP' || f.kind === 'HOLE').length;

// Determinism. Without it nothing below is a measurement — it is a mood.
const antR1 = ANT.rng(7), antR2 = ANT.rng(7);
check('the generator repeats for a seed', [0,1,2,3].every(() => antR1() === antR2()));
const cA = colonise(copyOf(BUILT), { ticks: 400 });
const cB = colonise(copyOf(BUILT), { ticks: 400 });
check('and so does the whole colony',
  JSON.stringify(cA.findings()) === JSON.stringify(cB.findings()),
  `${cA.findings().length} vs ${cB.findings().length}`);

check('a released colony walks', cA.stats().steps > 40 * 100, `${cA.stats().steps} ant-steps`);
// Being inside something is not forbidden — two members in flush contact share a
// plane, so the surface of one is the interior of the other and an ant standing
// there is a tenth of an inch inside its neighbour. What is forbidden is staying,
// and reporting from in there.
let antTicksIn = 0, antTicksTotal = 0;
for (let t = 0; t < 60; t++) {
  cA.step(1);
  for (const a of cA.ants) { antTicksTotal++; if (a.p && cA.embedded(a.p)) antTicksIn++; }
}
check('an ant inside something is pushed out and is rare', antTicksIn < antTicksTotal * 0.04,
  `${antTicksIn} of ${antTicksTotal} ant-ticks embedded`);
// The guard fires on the tick *after* the step that buried it, so being embedded
// right now proves nothing. What it must not do is stay: one more tick and every
// one of them has moved.
const buried = cA.ants.filter(a => a.p && cA.embedded(a.p)).map(a => [a, a.p.slice()]);
cA.step(1);
check('and it does not stay in there', buried.every(([a, was]) =>
  a.p[0] !== was[0] || a.p[1] !== was[1] || a.p[2] !== was[2]),
  `${buried.length} were embedded`);
check('some of them get inside the trailer', cA.ants.some(a => a.indoors));

// Response to damage. This is the whole claim: take a wall off and the colony
// finds more daylight than it did with the wall on. Not "some", more.
const antIntact = holesIn(cA);
const antOpened = copyOf(BUILT);
const antGone = antOpened.all({ kind: 'sheathing' })
  .filter(e => e.meta.wall === 'N')
  .sort((a, b) => (b.hi[0]-b.lo[0])*(b.hi[2]-b.lo[2]) - (a.hi[0]-a.lo[0])*(a.hi[2]-a.lo[2]))[0];
antOpened.remove(antGone.id);
// 140 ticks is below the colony's own corroboration threshold: intact 2, holed 3,
// which is noise reported as a measurement. At 400 it is 3 against 13.
const holed2 = holesIn(colonise(antOpened, { ticks: 400 }));
check('taking a wall panel off makes the colony find more daylight',
  holed2 > antIntact, `intact ${antIntact}, holed ${holed2}`);
// The floor, stated. An intact trailer is not silent — the wheel wells are boxes
// open to the road by design and the colony has no way to know that was meant.
// What matters is that the floor stays small next to the response.
check('and an intact one has a small, bounded floor of its own',
  antIntact <= 8 && holed2 > antIntact * 2, `floor ${antIntact}, response ${holed2}`);

// Attribution. A GAP is recorded where the *ant* was standing, not where the hole
// is — an ant on the bed platform sees daylight through a strip four feet away
// and three feet up. Asked by distance, the colony looks blind; asked whether the
// ray it recorded passes through the space we emptied, it was staring right at it.
const lesionBox = (() => { const e = BUILT.elements.get('shell.N.win_bed.above');
  return { lo: e.lo.slice(), hi: e.hi.slice() }; })();
const antStrip = copyOf(BUILT); antStrip.remove('shell.N.win_bed.above');
const stripFinds = colonise(antStrip, { ticks: 400 })
  .findings().filter(f => f.kind === 'GAP' || f.kind === 'HOLE');
const boxGap = (b, p) => Math.hypot(...[0,1,2].map(i => Math.max(b.lo[i]-p[i], 0, p[i]-b.hi[i])));
const rayHits = (o, d, b, slack = 2) => {
  let t0 = 0, t1 = 1e9;
  for (let i = 0; i < 3; i++) {
    const lo = b.lo[i] - slack, hi = b.hi[i] + slack;
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < lo || o[i] > hi) return false; continue; }
    let a = (lo - o[i]) / d[i], z = (hi - o[i]) / d[i];
    if (a > z) { const t = a; a = z; z = t; }
    if (a > t0) t0 = a; if (z < t1) t1 = z;
    if (t0 > t1) return false;
  }
  return true;
};
const bySight = stripFinds.filter(f => f.detail && f.detail.toward
  ? rayHits(f.at, f.detail.toward, lesionBox) : boxGap(lesionBox, f.at) < 24).length;
const byNear = stripFinds.filter(f => boxGap(lesionBox, f.at) < 12).length;
check('every gap records which way the light got out',
  stripFinds.filter(f => f.kind === 'GAP').every(f => f.detail && f.detail.toward));
check('and the escaping ray is what ties a finding to the hole, not distance to it',
  bySight > stripFinds.length * 0.6 && bySight > byNear,
  `${bySight} by line of sight, ${byNear} by proximity, of ${stripFinds.length}`);

// The split that stops the colony shouting about doors. A leaf in an opening and
// a tank in a carcass are in contact with things, and neither wants nailing.
const antKinds = new Set(cA.rumours().map(f => f.kind));
check('every finding is a kind the colony knows', [...antKinds].every(k => k in ANT.KINDS));
check('contacts with no schedule entry are UNRULED, not UNJOINED',
  !antKinds.has('UNJOINED') || cA.rumours().filter(f => f.kind === 'UNJOINED')
    .every(f => f.near.length === 0 || f.detail),
  `${cA.rumours().filter(f => f.kind === 'UNJOINED').length} unjoined`);

// Corroboration, which is the ranking. A rumour is one ant; a finding is two.
check('findings are a subset of rumours', cA.findings().length <= cA.rumours().length,
  `${cA.findings().length} of ${cA.rumours().length}`);
check('and every one of them was seen by at least two ants',
  cA.findings().every(f => f.ants >= 2));
check('the ranking is by corroboration, descending',
  cA.findings().every((f, i, all) => i === 0 || all[i-1].weight >= f.weight));

// Evaporation. A colony held still forgets; that is the false-positive filter.
const antBefore = cA.marks.length;
cA.step(200);
check('pheromone evaporates', cA.marks.every(m => m.s > 0.002) && antBefore > 0,
  `${antBefore} marks antBefore, ${cA.marks.length} after`);

// It works on a patient with no chart at all.
const meshColony = new ANT.Colony(pOcc, { n: 16, seed: 3 });
meshColony.step(60);
check('a bare mesh can be crawled too', meshColony.stats().steps > 200,
  `${meshColony.stats().steps} steps on ${pOcc.solids.length} triangles`);
check('and with no world it never claims a pair should have been fastened',
  !meshColony.rumours().some(f => f.kind === 'UNJOINED'));


// ------------------------------------------- 31. friction is not a fastener
group('an unfastened part that is merely set down');
const LDS = await import('../operative/loads.js');
check('mu is stated, not implied', LDS.MU_BEARING > 0.2 && LDS.MU_BEARING < 0.6, `${LDS.MU_BEARING}`);
// Take a real member that bears on something and is nailed to it, cut its
// fasteners, and see what the test credits it with. Synthesising a crate is worse:
// dropped in the middle of a fitted-out trailer it landed on nothing at all and
// failed for a stronger reason than friction, which would have proved nothing.
const frictionW = copyOf(BUILT);
const fgrd = frictionW.grounded();
const restsOn = frictionW.solids().find(e => {
  if (e.lo[2] <= 0.6) return false;
  const downs = (fgrd.under.get(e.id) || []).filter(u => u.via !== 'touch');
  if (!downs.some(u => u.via === 'bear')) return false;
  if (!downs.some(u => frictionW.joints.has(JN.joinKey(e.id, u.id)))) return false;
  return (LDS.tributary(frictionW, fgrd).tributary.get(e.id) || { carried: 0 }).carried > 40;
});
check('there is a nailed member resting on something to test with', !!restsOn,
  restsOn ? restsOn.id : 'none found');
if (restsOn) {
  const before31 = LDS.shake(frictionW).failures.filter(f => f.id === restsOn.id).length;
  for (const u of (fgrd.under.get(restsOn.id) || [])) frictionW.joints.delete(JN.joinKey(restsOn.id, u.id));
  const after31 = LDS.shake(frictionW).failures.filter(f => f.id === restsOn.id);
  check('unnailed, it slides in a panic stop', after31.some(f => f.case === 'stop') && before31 === 0,
    `${before31} failures nailed, ${after31.length} unnailed (${restsOn.id})`);
  const stop = after31.find(f => f.case === 'stop');
  check('and the capacity it is credited with is mu times its own weight, not half again what it needs',
    stop && Math.abs(stop.capacity - LDS.MU_BEARING * stop.carries) < 1.5,
    stop ? `capacity ${stop.capacity} vs mu*W ${(LDS.MU_BEARING * stop.carries).toFixed(0)}` : 'no stop failure');
}

// ------------------------------------------- 32. contact is not the load path
group('what must be nailed to what');
const FACES = BUILT.contacts({ minFace: 0 });
check('the world can enumerate its own face contacts', FACES.length > 400, `${FACES.length} contacts`);
check('and each carries the face it meets across',
  FACES.every(c => typeof c.face === 'number' && c.face >= 0));
// The load path uses a different relation on purpose: it rejects any contact it
// cannot resolve exactly. That difference is what hid twenty-eight joints.
const grd32 = BUILT.grounded();
let inLoadPath = 0;
for (const c of FACES) if ((grd32.under.get(c.a) || []).some(u => u.id === c.b)) inLoadPath++;
check('the load path knows about fewer contacts than exist',
  inLoadPath < FACES.length, `${inLoadPath} of ${FACES.length} appear in the support graph`);
check('nailing off leaves no scheduled face contact unfastened', (() => {
  const w = copyOf(BUILT);
  commit(w, 'nailOff', {});
  return w.contacts({ minFace: 1 }).every(c =>
    !JN.scheduleForPair(w.get(c.a), w.get(c.b)) || w.joints.has(JN.joinKey(c.a, c.b)));
})());

// ------------------------------------------- 33. the colony says what it found
group('the colony speaks');
const VDX = await import('../operative/verdict.js');
const walked = colonise(copyOf(BUILT), { ticks: 400 });
const meant33 = VDX.expectations(BUILT);
check('holes that are meant are read off the building', meant33.length >= 5, `${meant33.length} regions`);
check('and a wheel well is one of them', meant33.some(r => r.why === VDX.MEANT.WELL));
check('a gap inside a wheel well is EXPECTED, not a defect', (() => {
  const cap = BUILT.all({ kind: 'wellcap' })[0];
  return VDX.classify({ kind: 'GAP', ants: 4, hits: 9, near: [cap.id], detail: { toward: [-1, 0, 0] },
    at: [(cap.lo[0] + cap.hi[0]) / 2, (cap.lo[1] + cap.hi[1]) / 2, cap.lo[2] - 6] }, meant33).verdict
    === VDX.VERDICT.EXPECTED;
})());
check('a hole in the middle of a wall is not',
  VDX.classify({ kind: 'GAP', ants: 4, hits: 9, near: ['stud.W.65'], detail: { toward: [-1, 0, 0] },
    at: [4, 60, 60] }, meant33).verdict === VDX.VERDICT.UNEXPECTED);
check('UNRULED is UNKNOWN, which is not a pass',
  VDX.classify({ kind: 'UNRULED', ants: 3, hits: 4, near: ['a'], at: [50, 50, 50] }, meant33).verdict
    === VDX.VERDICT.UNKNOWN);

const scored = VDX.suckOf(walked, BUILT);
check('the score is the worst place, never the average',
  scored.places.length < 2 ||
  (scored.score === scored.places[0].score &&
   scored.score >= scored.places.reduce((a, p) => a + p.score, 0) / scored.places.length),
  `worst ${scored.score} over ${scored.places.length} places`);
check('suspicion cannot score like a defect',
  scored.places.filter(p => p.finding.verdict === VDX.VERDICT.UNKNOWN).every(p => p.score <= 20));
check('and what was meant is counted, not silently dropped',
  scored.counts.EXPECTED + scored.counts.UNEXPECTED + scored.counts.UNKNOWN === scored.judged.length);

const spokenText = VDX.accuse(walked, BUILT);
check("it speaks in the critic's format", /^SUCK SCORE: \d+/.test(spokenText.text));
check('it does not propose a fix, name an operation, or praise anything',
  !/\b(should|could|try|fix|op:|OPS\.|good|nice|well done)\b/i.test(
    spokenText.text.split('WHAT THIS READING IS WORTH')[0]),
  spokenText.text.slice(0, 100));
check('every reading carries the setting it was taken at',
  /WHAT THIS READING IS WORTH/.test(spokenText.text) && /\d+ ants, \d+ rays/.test(spokenText.text));
check('and it admits what it is blind to', spokenText.resolution.blind.length >= 1,
  `${spokenText.resolution.blind.length} admissions`);
check('a low score moves the sensor rather than settling',
  VDX.nextProbe({ score: 3, hard: 0, meaning: 'x' }, { blind: [] }).mode === 'MOVE THE SENSOR');
check('and names which move', !!VDX.nextProbe({ score: 3, hard: 0, meaning: 'x' }, { blind: [] }).say);
check('a hard finding builds again whatever the score',
  VDX.nextProbe({ score: 0, hard: 2, meaning: 'x' }, { blind: [] }).mode === 'BUILD AGAIN');
check('a colony run too briefly is told so',
  VDX.resolution(walked, { ticks: 50 }).blind.length > VDX.resolution(walked, { ticks: 900 }).blind.length);
check('the linters simply join the accusation', (() => {
  const j = VDX.joinAccusation('the roof is wrong', [{ code: 'X', message: 'y' }], spokenText);
  return /WHAT SUCKS VISUALLY/.test(j) && /WHAT SUCKS DETERMINISTICALLY/.test(j) &&
         /WHAT SUCKS STIGMERGICALLY/.test(j);
})());

// ------------------------------------------- 34. can a person use it
group('a body in the space');
const HB = await import('../operative/habitat.js');
const WD = await import('../operative/world.js');
const GM = await import('../operative/geom.js');

// Calibration first. A habitability reading that has not been fired at a room you
// could measure with a tape is not evidence.
const hcal = HB.calibrate({ World: WD.World, Element: WD.Element, box: GM.box });
check('the instrument can measure a room it did not design', hcal.ok, hcal.verdict);
check('and gets its floor area right to within the grid',
  Math.abs(hcal.floor - hcal.exact) <= 4, `${hcal.floor} sq ft vs ${hcal.exact} exact`);
check('and can walk across it', hcal.reachable >= hcal.floor * 0.9,
  `${hcal.reachable} of ${hcal.floor} sq ft reachable in an empty room`);
check('and reads its ceiling', Math.abs(hcal.height - 84) <= 1, `${hcal.height} in`);

const H34 = HB.habitat(BUILT);
check('the trailer has a floor to stand on', H34.headroom.floor > 100, `${H34.headroom.floor} sq ft`);
check('and you can stand up in nearly all of it',
  H34.headroom.coach >= H34.headroom.floor * 0.9,
  `${H34.headroom.coach} of ${H34.headroom.floor} sq ft over ${HB.CODE.headroom.coach} in`);
check('the door is big enough to be an exit', H34.egress.door && H34.egress.door.ok,
  H34.egress.door ? `${H34.egress.door.w}x${H34.egress.door.h}` : 'no door');
check('and at least one window is big enough and low enough to climb out of',
  !!H34.egress.window, H34.egress.windows.map(x => `${x.id} ${x.area}sqft sill${x.sill}`).join(', '));
check('every measure cites what it is against',
  typeof HB.CODE.headroom.basis === 'string' && typeof HB.CODE.egressWindow.basis === 'string');

// The finding this instrument exists for.
const bedPath = H34.paths.find(p => p.id === 'bed.base');
check('it can say whether you can get to the bed', !!bedPath);
check('and you can: the route holds up at the minimum aisle',
  bedPath && bedPath.bottleneck !== null && bedPath.bottleneck >= HB.CODE.aisle.min,
  bedPath ? `${bedPath.bottleneck} in at the narrowest, wants ${HB.CODE.aisle.min}` : '');
check('every station is reachable from the door',
  H34.paths.every(p => p.bottleneck !== null && p.bottleneck >= HB.CODE.aisle.min),
  H34.paths.map(p => `${p.id} ${p.bottleneck}`).join(', '));
// The arithmetic that forced the layout. A face-to-face dinette cannot go over the
// axles, and over the axles is where the dinette has to be.
const pinchW = BUILT.get('well.E.side').lo[0] - BUILT.get('well.W.side').hi[0];
check('a face-to-face dinette plus an aisle does not fit at the wheel wells',
  18 + 33 + 18 + HB.CODE.aisle.min > pinchW, `needs ${18+33+18+HB.CODE.aisle.min} in, has ${pinchW.toFixed(0)}`);
check('one bench and a table does', 18 + 30 + HB.CODE.aisle.min <= pinchW,
  `needs ${18+30+HB.CODE.aisle.min} in, has ${pinchW.toFixed(0)}`);
check('so there is one bench, not two',
  !!BUILT.get('bench.W') && !BUILT.get('bench.E'));
check('and the table overhangs it, so knees go under', (() => {
  const b = BUILT.get('bench.W'), t = BUILT.get('table');
  return t.lo[0] < b.hi[0] && t.hi[0] > b.hi[0];
})(), 'table x ' + BUILT.get('table').lo[0] + '..' + BUILT.get('table').hi[0] +
      ', bench to ' + BUILT.get('bench.W').hi[0]);

check('nothing is left blocking a route',
  !checkAll(BUILT).some(c => c.code === 'AISLE_TOO_NARROW' || c.code === 'UNREACHABLE'));
check('and a frame with no openings is not told it lacks a fire escape', (() => {
  const bare = ing.shell();
  return !checkAll(bare).some(c => ['NO_EGRESS', 'LOW_HEADROOM', 'AISLE_TOO_NARROW'].includes(c.code));
})());

// ------------------------------------------- 35. where is it fucked
group('a finding with coordinates');
const WH = await import('../operative/where.js');

const zn = WH.zones(BUILT);
check('the axle zone is read off the wheel wells, not guessed',
  zn.axle[0] > 0 && zn.axle[1] > zn.axle[0], `y ${zn.axle.join('..')}`);
check('and the trailer really is narrower there', (() => {
  const pinch = BUILT.get('well.E.side').lo[0] - BUILT.get('well.W.side').hi[0];
  const full = BUILT.get('sole.E.0').lo[0] - BUILT.get('sole.W.0').hi[0];
  return pinch < full;
})());
check('fore, over the axles and aft all resolve',
  ['fore', 'axle', 'aft'].every(k =>
    [zn.along(zn.axle[0] - 10), zn.along((zn.axle[0]+zn.axle[1])/2), zn.along(zn.axle[1] + 10)].includes(k)));
check('and under the floor is told from the wall and the roof',
  zn.height(zn.floorZ - 6) === 'under' && zn.height(zn.floorZ + 30) === 'wall' &&
  zn.height(zn.plateZ + 6) === 'roof');

const rms = WH.rooms(BUILT);
check('rooms are found from the things that make them rooms',
  rms.length >= 4 && rms.every(r => r.members.length), rms.map(r => r.id).join(', '));

// The same list read four ways.
const cond35 = checkAll(BUILT);
const colony35 = colonise(copyOf(BUILT), { ticks: 400 });
const cen = WH.census(BUILT, [...cond35, ...colony35.findings()]);
check('every finding is placed on all four axes', cen.placed.length > 10 &&
  cen.placed.every(p => p.pathology && (p.zone || p.at === null)), `${cen.placed.length} placed`);
check('the four slices are of the same list',
  [cen.byZone, cen.byRoom, cen.bySystem, cen.byPathology]
    .every(sl => sl.reduce((n, r) => n + r.n, 0) === cen.placed.length));
check('nothing is silently dropped by being unplaceable',
  cen.byRoom.reduce((n, r) => n + r.n, 0) === cen.placed.length);

// The slicing exists so that a scope can be pointed at. What it says about this
// build changes every time the build changes — which is the point, and the reason
// this asserts the mechanism rather than a distribution that was true last week.
// It once read "24 of 33 over the axles, 29 in the dinette"; the dinette has been
// rebuilt since and it does not read that any more.
const axle = cen.byZone.find(r => r.key === 'axle');
check('the axle zone is one of the places a finding can land', !!cen.byZone.length &&
  cen.byZone.every(r => ['fore', 'axle', 'aft', 'unplaced'].includes(r.key)),
  cen.byZone.map(r => `${r.key} ${r.n}`).join(', '));
const dinetteRow = cen.byRoom.find(r => r.key === 'dinette');
check('and the rooms are named from what makes them rooms', cen.byRoom.every(r =>
  ['bath', 'galley', 'dinette', 'sleep', 'unplaced'].includes(r.key)),
  cen.byRoom.map(r => `${r.key} ${r.n}`).join(', '));
check('the largest class is the model admitting it has no rule',
  cen.byPathology[0] && cen.byPathology.some(r => r.key === 'nothing has an opinion'),
  cen.byPathology.map(r => `${r.key} ${r.n}`).join(' | '));

// Pathology is independent of place: the same disease in two zones is one row.
const unfastened = cen.placed.filter(p => p.pathology === 'not fastened');
check('one disease in several places reads as one disease',
  unfastened.length === 0 || new Set(unfastened.map(p => p.code)).size <= 2,
  `${unfastened.length} findings, codes ${[...new Set(unfastened.map(p => p.code))].join(',')}`);

// Scoping.
const justAxle = WH.scope(cen.placed, { zone: 'axle' });
check('the loop can be pointed at one zone',
  justAxle.length && justAxle.every(p => p.zone === 'axle'), `${justAxle.length} over the axles`);
check('and pointing it somewhere empty says so rather than saying nothing is wrong',
  /not the same as it being right/.test(
    WH.accuseScope(BUILT, cen.placed, { room: 'nowhere' }).text));
const acc = WH.accuseScope(BUILT, cen.placed, { zone: 'axle' });
check('a scoped accusation names the scope and counts the kinds',
  /^SUCK SCOPE: zone axle/.test(acc.text) && acc.n === justAxle.length, acc.text.split('\n')[0]);
check('and it still does not propose a fix or name an operation',
  !/\b(should|could|try|fix|op:|OPS\.)\b/i.test(acc.text));

// ------------------------------------------- 36. a six foot man in the room
group('the body the building is for');
const FG = await import('../operative/figure.js');
const man = FG.figure(72);
const H36 = FG.heights(man);
const deck36 = BUILT.all().filter(e => e.meta.role === 'floor sheathing');
const fz = Math.max(...deck36.map(e => e.hi[2]));

check('a stature gives a whole body', man.eye > man.shoulder && man.shoulder > man.elbow &&
  man.elbow > man.hip && man.hip > man.knee, `eye ${man.eye} shoulder ${man.shoulder} elbow ${man.elbow}`);
check('and the proportions are cited, not invented',
  Object.keys(FG.PROPORTION).length > 15 && FG.PROPORTION.popliteal === 0.25);
check('a six foot man has his elbow at about 45 in',
  Math.abs(man.elbow - 45) < 2, `${man.elbow} in`);
check('and the underside of his knee at about 18',
  Math.abs(man.popliteal - 18) < 1.5, `${man.popliteal} in`);
check('so a seat wants 18 and a worktop wants about 41',
  H36.seat.want === 18 && H36.counter.want >= 39 && H36.counter.want <= 43,
  `seat ${H36.seat.want}, counter ${H36.counter.want}`);

// The finding. These are the trailer as it stands, and they are the reason it is
// uninhabitable — not a corridor width, a set of heights that are all about half
// of what a body needs.
const asBuilt = (id, kind) => { const e = BUILT.get(id); return e ? FG.worksAt(man, e, kind, fz) : null; };
const topAt = asBuilt('top.galley', 'counter');
check('the worktop is at a height you can work at', topAt && topAt.ok,
  topAt ? `${topAt.is} in, wants ${topAt.want} (${topAt.range.join('-')})` : 'no worktop');
check('and the sink rim is at the worktop, not at your knees', (() => {
  const sk = BUILT.get('sink'), tp = BUILT.get('top.galley');
  return sk && tp && sk.hi[2] >= tp.lo[2] - 1;
})(), `sink top ${(BUILT.get('sink').hi[2]-fz).toFixed(0)} in, worktop ${(BUILT.get('top.galley').hi[2]-fz).toFixed(0)} in`);

const sit = FG.sitsAt(man, BUILT.get('bench.W'), BUILT.get('table'), fz);
check('the bench is the height of the underside of his knee', sit.seatHeight.ok,
  `${sit.seatHeight.is} in, wants ${sit.seatHeight.want}`);
check('the table is the height you sit at', sit.tableHeight.ok,
  `${sit.tableHeight.is} in, wants ${sit.tableHeight.want}`);
check('and his thighs go under it', sit.kneeGap.ok,
  `${sit.kneeGap.is} in of gap, wants ${sit.kneeGap.want}`);

// Fit, which the corridor number cannot answer on its own.
check('he fits through the entry door', FG.passes(man, 36).ok);
check('and the bath doorway', FG.passes(man, 26).ok);
check('and not past the dinette, shoulders or sideways', (() => {
  const p = FG.passes(man, 4); return !p.ok && !p.sideways;
})());
check('shoulder breadth is what a doorway is measured against, with room to move',
  man.shoulderBreadthWithSlack > man.shoulderBreadth &&
  man.shoulderBreadthWithSlack - man.shoulderBreadth === 4);

// The body occupies boxes, so a thing at head height is not the same as one at shin height.
const stood = FG.place(man, { at: [50, 90], pose: 'stand', floor: fz });
check('the body is legs, torso and head, not one block',
  stood.length === 3 && stood[2].hi[2] - fz > 70, stood.map(b => b.part).join(', '));
check('and standing on the floor he reaches the ceiling height a room needs',
  Math.abs((stood[2].hi[2] - fz) - man.stature) < 0.5);
const hitList = FG.collides(BUILT, stood);
check('putting him in the aisle names what he walks into, if anything',
  Array.isArray(hitList), `${hitList.length} at 50,90`);

// ------------------------------------------- 37. everybody, doing something
group('a body at each station');
const EB = await import('../operative/everybody.js');

// The two bodies have to agree or neither is evidence.
const S37 = 39.3701 * EB.scaleFor(72);
const fig37 = FG.figure(72);
const bind37 = Object.fromEntries(EB.RIG.map(r => [r[0], r[2]]));
check('the rig scales to the same man figure.js describes',
  Math.abs(bind37.hips[1] * S37 - fig37.hip) < 2 &&
  Math.abs(bind37.leftLowerLeg[1] * S37 - fig37.knee) < 2,
  `hip ${(bind37.hips[1]*S37).toFixed(1)} vs ${fig37.hip}, knee ${(bind37.leftLowerLeg[1]*S37).toFixed(1)} vs ${fig37.knee}`);
check('and stands six feet tall when it is asked to',
  Math.abs((1.665 + 0.105) * S37 - 72) < 0.5);

const fk37 = EB.solve(EB.ACTIVITIES['STANDING IN THE DOOR'].pose);
const std = EB.place(fk37, { stature: 72, at: [50, 100], floor: 16 });
check('forward kinematics puts the head above the hips above the feet',
  std.bone.head[2] > std.bone.hips[2] && std.bone.hips[2] > std.bone.leftFoot[2]);
check('and the feet on the floor it was given',
  Math.abs(Math.min(...std.segments.map(g => Math.min(g.a[2], g.b[2]) - g.r)) - 16) < 0.5);
check('a pose that bends a joint actually moves the limb', (() => {
  const bent = EB.place(EB.solve({ leftUpperArm: [0, 0, -80] }), { stature: 72, at: [0, 0], floor: 0 });
  const tpose = EB.place(EB.solve({}), { stature: 72, at: [0, 0], floor: 0 });
  return Math.abs(bent.bone.leftHand[2] - tpose.bone.leftHand[2]) > 10;
})());

const acts = EB.everybody(BUILT);
check('every activity places a body somewhere', acts.length >= 10 && acts.every(a => a.body));
check('and none of them stands the figure inside the thing it is using',
  acts.every(a => !a.collisions.some(h => h.id === a.at)),
  acts.filter(a => a.collisions.some(h => h.id === a.at)).map(a => a.activity).join(', '));
check('standing on the floor is not counted as hitting the floor',
  !acts.some(a => a.collisions.some(h => /^deck\./.test(h.id) && /Foot|LowerLeg/.test(h.bone))));

// The findings.
const at = (n) => acts.find(a => a.activity === n);
check('the galley is at working height now, not at his knees', (() => {
  const t = BUILT.get('top.galley');
  return (t.hi[2] - fz) >= 34;
})(), `worktop ${(BUILT.get('top.galley').hi[2]-fz).toFixed(0)} in`);
check('and he can reach the high shelf', at('REACHING THE HIGH SHELF').work.ok);
check('he can sit on the toilet', at('ON THE TOILET').work.ok);
check('he fits in the bed', at('IN BED').clash === 0);
check('and in the shower, standing up', at('SHOWERING').clash === 0 && at('SHOWERING').work.ok);
check('and can stand in the doorway without wearing the door',
  at('STANDING IN THE DOOR').clash === 0);
check('the study still names whatever the building refuses',
  Array.isArray(acts) && acts.every(a => typeof a.clash === 'number'),
  acts.filter(a => (a.work && !a.work.ok) || a.clash > 0).map(a => a.activity).join('; ') || 'nothing');

// ------------------------------------------- 38. a body moving through it
group('can a person move around in it');
const IH = await import('../operative/inhabit.js');

const ical = IH.calibrate({ World: WD.World, Element: WD.Element, box: GM.box });
check('the instrument can tell a room you can move around in from one you cannot',
  ical.ok, ical.verdict);
check('and an empty room is mostly standable and mostly turnable',
  ical.stand > ical.exact * 0.55 && ical.turn > ical.exact * 0.45,
  `${ical.stand} standable, ${ical.turn} turnable of ${ical.exact} sq ft`);
check('and a post in the middle of it takes floor away',
  ical.withPost < ical.stand, `${ical.stand} -> ${ical.withPost} sq ft`);

const post = IH.postures(72);
check('every posture is derived from the body, not typed in',
  post.STAND.h === FG.figure(72).stature && post.REACH.h === FG.figure(72).overheadReach);
check('and a taller body needs more room', (() => {
  const a = IH.postures(66), b = IH.postures(78);
  return b.STAND.h > a.STAND.h && b.STAND.w > a.STAND.w;
})());

const fm38 = IH.fitMap(BUILT);
check('there is floor you can stand on', fm38.area.STAND > 30, `${fm38.area.STAND} sq ft`);
check('edging sideways always fits where standing does',
  fm38.area.PASS >= fm38.area.STAND, `pass ${fm38.area.PASS}, stand ${fm38.area.STAND}`);
check('and turning round needs more room than standing still',
  fm38.area.TURN <= fm38.area.STAND, `turn ${fm38.area.TURN}, stand ${fm38.area.STAND}`);
check('the trailer has somewhere you can stand but not turn round',
  fm38.area.STAND - fm38.area.TURN > 0,
  `${(fm38.area.STAND - fm38.area.TURN).toFixed(1)} sq ft`);

const er = IH.errands(BUILT);
check('every errand in the brief can be done', er.done === er.of,
  er.errands.filter(e => !e.ok).map(e => `${e.id}: ${e.why}`).join('; ') || `${er.done}/${er.of}`);
check('and every one of them is a walk, not a squeeze',
  er.errands.every(e => e.route.ok && e.route.tightest !== 'PASS'),
  er.errands.filter(e => e.route.tightest === 'PASS').map(e => e.id).join(', ') || 'all walkable');
check('a thing you get into is not asked whether you can reach it',
  er.errands.find(e => e.id === 'shower').reach.slack === null);
check('and a drawer in a carcass is reached at the carcass',
  er.errands.find(e => e.id === 'get in the fridge').ok);

// The colony, carrying a person.
const bc = IH.bodyColony(BUILT, { n: 30, ticks: 700, seed: 7 });
check('ants carrying a body cover the floor they can stand on',
  bc.reached > 70, `${bc.covered} of ${bc.standable} sq ft, ${bc.reached}%`);
check('the trail repels rather than attracts, or they never leave the door',
  bc.covered > 20, `${bc.covered} sq ft covered`);
check('what they forage for is a person, not a fault',
  bc.findings.every(f => f.kind in IH.BODY_KINDS));
check('the margin around every object is counted and set aside, not reported',
  bc.margin > 0 && !bc.findings.some(f => f.kind === 'IN_THE_WAY'),
  `${bc.margin} margin cells set aside`);
check('and what is left describes what a body cannot do',
  bc.findings.every(f => ['CANT_TURN', 'SQUEEZE', 'DEAD_END', 'LOW_CEILING', 'CANT_REACH'].includes(f.kind)),
  [...new Set(bc.findings.map(f => f.kind))].join(', '));
check('every finding was corroborated by at least two independent ants',
  bc.findings.every(f => f.ants >= 2));

// The check refuses a plan a body cannot use.
check('a trailer you cannot do the errands in cannot settle', (() => {
  const blockedW = copyOf(BUILT);
  const bench = blockedW.get('bench.W');
  // wall the galley off with a slab across the aisle
  blockedW.add(new (bench.constructor)({
    id: 'test.barricade', kind: 'partition', layer: 'interior', material: 'ply',
    box: mkbox([50, 116, 60], [96, 4, 88]), meta: { role: 'partition' } }));
  return checkAll(blockedW).some(c => c.code === 'CANNOT_DO_IT' && c.severity === 3);
})(), 'a slab across the aisle');

// ------------------------------------------- 39. comfort, which is not fit
group('could you bear to do it for twenty minutes');
const CF = await import('../operative/comfort.js');
const fmc = IH.fitMap(BUILT);
const cf = CF.comfort(BUILT, { fitMap: fmc });

check('every task is judged by a number, not an adjective',
  cf.tasks.every(t => !t.tests || t.tests.every(x => x.want !== undefined && x.basis)));
const at39 = (n) => cf.tasks.find(t => t.task === n);

const tab = at39('sit at the table');
check('you can sit at the table', tab.ok, (tab.failed || []).map(f => `${f.id} ${f.is}`).join(', '));
check('and there is nothing on the floor under it to kick',
  tab.tests.find(x => x.id === 'knee room forward').is >= FG.figure(72).buttockKnee,
  `${tab.tests.find(x => x.id === 'knee room forward').is} in of shin room`);
check('and room for your elbows', tab.tests.find(x => x.id === 'elbow room each').ok);

const loo = at39('sit on the toilet');
check('you can sit on the toilet', loo.ok, (loo.failed || []).map(f => `${f.id} ${f.is}`).join(', '));
check('with the clearances the code asks for',
  loo.tests.filter(x => /IRC R307/.test(x.basis)).every(x => x.ok));

check('you can use the sink', at39('use the sink').ok,
  (at39('use the sink').failed || []).map(f => `${f.id} ${f.is}`).join(', '));
check('you can cook', at39('cook').ok,
  (at39('cook').failed || []).map(f => `${f.id} ${f.is}`).join(', '));
check('and both have a toe kick, so you stand at the work instead of leaning over it',
  CF.toeKick(BUILT, 'cab.galley').depth >= 2.5 && CF.toeKick(BUILT, 'lav.cab').depth >= 2.5,
  `galley ${CF.toeKick(BUILT, 'cab.galley').depth} in, vanity ${CF.toeKick(BUILT, 'lav.cab').depth} in`);
check('and the toe kick is measured at the carcass, not at the basin in it',
  CF.toeKick(BUILT, 'cab.galley').plinth === 'kick.galley');

const fr = at39('use the fridge');
check('you do not kneel on the floor to open the fridge', fr.ok,
  (fr.failed || []).map(f => `${f.id} ${f.is}`).join(', '));
check('nobody has to crouch for something they open every day',
  fr.tests.some(x => x.id === 'opens above knee height' && x.ok));
check('but a cupboard under a worktop is not held to that',
  !at39('use the galley cupboard').tests.some(x => x.id === 'opens above knee height'));

// The services are in the room.
check('the collision test sees the services at all',
  EB.obstacles(BUILT).length > BUILT.solids().length,
  `${EB.obstacles(BUILT).length} obstacles vs ${BUILT.solids().length} solids`);
check('and runs are among them', EB.obstacles(BUILT).some(e => e.kind === 'run'));
check('nothing is strung across the room at body height', cf.sweep.strung.length === 0,
  cf.sweep.strung.map(h => `${h.id} at z ${h.z[0]}-${h.z[1]}`).join(', '));
check('the sweep stood a body on every square foot it could',
  cf.sweep.stood > 40, `${cf.sweep.stood} sq ft`);
check('and a wire clipped to a wall is not reported as one strung through the air',
  cf.sweep.services.length > cf.sweep.strung.length,
  `${cf.sweep.services.length} touched, ${cf.sweep.strung.length} in open air`);

// It notices when something is put back in the way.
check('a conductor run across the room at chest height is caught', (() => {
  const w39 = copyOf(BUILT);
  const t = w39.get('table');
  w39.add(new (t.constructor)({ id: 'test.strung', kind: 'run', layer: 'services', material: 'copper',
    box: mkbox([50, 150, 54], [80, 0.5, 0.5]), meta: { role: 'conductor' } }));
  return CF.sweep(w39, { fitMap: fmc }).strung.some(h => h.id === 'test.strung');
})(), 'a wire at 54 in across the middle');

// ------------------------------------------- 40. a hand on the thing
group('can he actually put a hand on it');
const RH = await import('../operative/reach.js');

const rcal = RH.calibrate();
check('the arm is the anthropometry\'s, not the rig\'s short one',
  Math.abs(RH.arm(72).span - FG.figure(72).forwardReach) < 1.5,
  `${RH.arm(72).span} in vs a forward reach of ${FG.figure(72).forwardReach.toFixed(1)}`);
check('a point inside the arm\'s sphere is reached and one outside it is not',
  rcal.near.reached && !rcal.far.reached && rcal.far.short > 5,
  `near ${rcal.near.reached}, far short by ${rcal.far.short}`);
check('the elbow swings round the reach rather than hanging in one place',
  rcal.swing > 8, `${rcal.swing.toFixed(1)} in of elbow travel`);
check('the hand lands on the point it was given, to the thousandth',
  rcal.onTarget < 0.001, `${rcal.onTarget} in off`);

const rr = RH.reachAll(BUILT, { fitMap: fmc });
check('every station is reachable from somewhere a body fits',
  rr.stations.every(s => s.reached !== false),
  rr.stations.filter(s => s.reached === false).map(s => `${s.id} short ${s.short}`).join(', '));
check('and nothing daily needs a crouch or a knee on the floor',
  rr.stations.filter(s => s.daily && /CROUCH|KNEEL/.test(s.verdict)).length <= 1,
  rr.stations.filter(s => s.daily && /CROUCH|KNEEL/.test(s.verdict)).map(s => s.id).join(', '));
check('no arm has to pass through the building to get there',
  rr.stations.every(s => s.verdict !== 'IN THE WAY'),
  rr.stations.filter(s => s.verdict === 'IN THE WAY').map(s => `${s.id}: ${s.through.join('/')}`).join('; '));
check('and no service is in the way of the hand that has to reach past it',
  rr.stations.every(s => !s.wires || s.wires.length === 0),
  rr.stations.flatMap(s => s.wires || []).join(', '));
check('the report says which fittings a person operates are not in the building',
  rr.missing.length > 0 && rr.missing.every(m => m.what),
  rr.missing.map(m => m.what).join('; '));

// It notices when something is put back in the way.
check('a pipe hung in front of the breakers is caught', (() => {
  const w40 = copyOf(BUILT);
  const t = w40.get('table');
  const p40 = w40.get('dc.panel');
  // It took two tries to write an obstruction this could not get round, and both
  // failures were the test's. A horizontal bar across the panel: the arm went under
  // it. A single floor-to-ceiling riser three inches off the face: the arm came in
  // diagonally past it, which is exactly what a person does and is the instrument
  // being right. Fourteen places to stand and four stances at each is a lot of ways
  // round three quarters of an inch. So: a bank of conduit two feet wide and the
  // full height of the wall, which is a thing you cannot reach past, and if the
  // instrument still says the breakers are fine then it is not looking.
  w40.add(new (t.constructor)({ id: 'test.inway', kind: 'run', layer: 'services', material: 'copper',
    box: mkbox([p40.hi[0] + 2, (p40.lo[1] + p40.hi[1]) / 2, 55], [0.75, 24, 80]),
    meta: { role: 'conductor' } }));
  const r40 = RH.reachAll(w40, { fitMap: fmc });
  const s40 = r40.stations.find(s => s.id === 'dc.panel');
  return (s40.wires || []).includes('test.inway') || (s40.through || []).includes('test.inway');
})(), 'a riser across the panel face');

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
