// tests/run.mjs — receipts.
//
// Every claim the Operative Builder makes about itself is asserted here against
// the real modules. Run with:  node tests/run.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedTrailer } from '../operative/kit.js';
import { checkAll } from '../operative/checks.js';
import { commit, commitChain, undo } from '../operative/ops.js';
import { parse, nextMove, planPath } from '../operative/language.js';
import { learn, preflight, THRESHOLD } from '../operative/invariants.js';
import { parseSTL, bindReference, compareToReference } from '../operative/reference.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) { pass++; results.push(`  ok   ${name}`); }
  else { fail++; results.push(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}
function group(t) { results.push(`\n${t}`); }
const stl = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); return parseSTL(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

// ---------------------------------------------------------------- 1. the seed
group('the seed build stands up on its own');
const w0 = seedTrailer();
w0.conditions = checkAll(w0);
check('81 members placed', w0.elements.size === 81, `got ${w0.elements.size}`);
check('nothing outstanding', w0.conditions.length === 0, w0.conditions.map(c => c.code).join(','));
const g0 = w0.grounded();
check('every member has a load path', w0.solids().every(e => e.layer === 'services' || g0.seen.has(e.id)));
check('sheathing hangs rather than bears', !g0.bearing.has('shell.W') && g0.seen.has('shell.W'));
check('crossmembers are welded, not seated', (g0.under.get('cross.48') || []).every(u => u.via === 'fasten'));

// ------------------------------------------- 2. instruction -> unforeseen condition
group('an instruction meets a condition it did not ask for');
const w = seedTrailer();
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
check('the world walked itself back to settled', w.conditions.length === 0, w.conditions.map(c => c.code).join(','));
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
const m = seedTrailer();
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
check('the service chain settles', m.conditions.length === 0, m.conditions.map(c => c.code).join(','));

// ---------------------------------------------------------------- 7. the reference
group('the drawing gets a say, and it changes a move');
const rw = seedTrailer();
bindReference(rw, { id: 'contractor-reality', name: 'Contractor Reality Trailer', tris: stl('assets/models/concepts/contractor-reality-trailer.stl') });
rw.conditions = checkAll(rw);
const dev = rw.conditions.find(c => c.code === 'PROFILE_DEVIATION' && c.repair);
check('the silhouette comparison finds a real difference', !!dev, rw.conditions.map(c => c.code).join(','));
const cmpBefore = compareToReference(rw);
check('the seed roof is flat and the reference is not',
  Math.abs(cmpBefore.end.current.roofFall) < 1 && Math.abs(cmpBefore.end.reference.roofFall) > 3,
  JSON.stringify({ cur: cmpBefore.end.current.roofFall, ref: cmpBefore.end.reference.roofFall }));
const chained = commitChain(rw, dev.repair.chain, 'PROFILE_DEVIATION');
check('a compound repair is one move, not three', chained.ok && rw.history.filter(h => h.kind === 'op').length === 1,
  `${rw.history.filter(h => h.kind === 'op').length} journal entries`);
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
  const pw = seedTrailer();
  commit(pw, 'raise', { wall, by: 8 });
  const pr = commit(pw, 'pitch', {});
  check(`raising ${wall} then pitching settles`, pw.conditions.length === 0,
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

console.log(results.join('\n'));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
