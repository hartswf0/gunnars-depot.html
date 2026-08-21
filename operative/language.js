// operative/language.js — words become operations.
//
// A small, explicit, inspectable vocabulary. It refuses what it does not
// understand rather than guessing, and it names what it does understand, so an
// instruction and its consequence stay attached to each other.
import { checkAll } from './checks.js';

const WALLS = { west: 'W', east: 'E', south: 'S', north: 'N', w: 'W', e: 'E', s: 'S', n: 'N' };
const num = (s) => { const v = parseFloat(s); return Number.isFinite(v) ? v : null; };

export const VOCABULARY = [
  ['cut',       'cut a window|door in the west|east|south|north wall from A to B [sill S] [head H]'],
  ['header',    'header on <opening> [with (2)2x8]'],
  ['raise',     'raise|lower the west wall 8 in   ·   raise all walls 6 in'],
  ['pitch',     'pitch the roof — reseats it on whatever the walls are now'],
  ['inlet',     'inlet water|power at X Y Z'],
  ['fixture',   'put a sink|outlet|light at X Y Z'],
  ['route',     'route water|power from <source> to <fixture> [2 in]'],
  ['reroute',   'reroute <run> — recomputes a run the world refused'],
  ['strap',     'strap <plate id>'],
  ['upsize',    'upsize <member id>'],
  ['move',      'move <id> by X Y Z'],
  ['material',  'make <id> plywood|steel|siding|...'],
  ['reference', 'reference contractor|wright|ban|lacaton|alexander'],
  ['fix',       'fix — apply what the world proposes for the most serious open condition'],
  ['undo',      'undo — walk the last move back'],
  ['explain',   'explain <id> — how this became what it is']
];

/** Manhattan path from a source to a fixture through the nearest wall cavity. */
export function planPath(world, from, to) {
  const walls = Object.values(world.walls);
  let best = null;
  for (const w of walls) {
    const k = w.axis === 'y' ? 0 : 1;
    const d = Math.abs(to[k] - w.at);
    if (!best || d < best.d) best = { w, d, k };
  }
  const { w, k } = best;
  const cavityZ = world.datum.deckTop - 7.5;      // under the floor joists
  const riser = [0, 0, 0];
  riser[k] = w.at;
  riser[k === 0 ? 1 : 0] = to[k === 0 ? 1 : 0];
  const a = [...from];
  const p1 = [...from]; p1[k] = w.at; p1[2] = cavityZ;
  const p2 = [...p1]; p2[k === 0 ? 1 : 0] = to[k === 0 ? 1 : 0];
  const p3 = [...p2]; p3[2] = to[2];
  return [a, p1, p2, p3, [...to]];
}

export function parse(world, text) {
  const raw = String(text || '').trim();
  if (!raw) return { error: 'say something' };
  const t = raw.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ');
  const w = t.split(' ');
  const has = (...k) => k.some(x => t.includes(x));
  const after = (kw) => { const i = w.indexOf(kw); return i >= 0 ? w[i + 1] : null; };
  const id = () => raw.split(/\s+/).find(x => /[.]/.test(x) && !/^-?\d/.test(x));

  if (w[0] === 'undo') return { op: 'undo', args: {} };
  if (w[0] === 'pitch' || has('pitch the roof')) return { op: 'pitch', args: {} };
  if (w[0] === 'fix') return { op: 'fix', args: {} };
  if (w[0] === 'explain' || w[0] === 'trace') return { op: 'explain', args: { id: id() || w[1] } };

  if (w[0] === 'reference' || w[0] === 'compare') {
    const which = ['contractor', 'wright', 'usonian', 'ban', 'shigeru', 'lacaton', 'vassal', 'alexander'].find(k => t.includes(k));
    return { op: 'reference', args: { which: which || null } };
  }

  if (w[0] === 'cut' || has('window in', 'door in')) {
    const type = has('door') ? 'door' : 'window';
    const wall = WALLS[(w.find(x => WALLS[x]) || '').replace(/[^a-z]/g, '')] ||
      WALLS[(t.match(/\b(west|east|south|north)\b/) || [])[1]];
    if (!wall) return { error: 'which wall? west, east, south or north' };
    const nums = raw.match(/-?\d+(\.\d+)?/g) || [];
    const from = num(after('from') ?? nums[0]);
    const to = num(after('to') ?? nums[1]);
    if (from === null || to === null) return { error: 'give a span: "from 40 to 76"' };
    const args = { wall, from: Math.min(from, to), to: Math.max(from, to), type };
    const sill = num(after('sill')); if (sill !== null) args.sill = sill;
    const head = num(after('head')); if (head !== null) args.head = head;
    return { op: 'cut', args };
  }

  if (w[0] === 'header') {
    const sec = raw.match(/\(?2\)?\s*2x\d+/i);
    return { op: 'header', args: { opening: id() || w[w.indexOf('on') + 1], section: sec ? sec[0].replace(/\s/g, '') : undefined } };
  }

  if (w[0] === 'raise' || w[0] === 'lower') {
    const wall = WALLS[(t.match(/\b(west|east|south|north)\b/) || [])[1]] || null;
    const by = num((raw.match(/-?\d+(\.\d+)?/g) || [])[0]);
    if (by === null) return { error: 'by how much? "raise the west wall 8 in"' };
    return { op: 'raise', args: { wall: w.includes('all') ? null : wall, by: w[0] === 'lower' ? -Math.abs(by) : Math.abs(by) } };
  }

  if (w[0] === 'inlet' || has('shore inlet')) {
    const system = has('power', 'electric') ? 'power' : 'water';
    const n = (raw.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    if (n.length < 3) return { error: 'where? "inlet water at 0 4 10"' };
    return { op: 'source', args: { id: `inlet.${system}`, system, at: n.slice(0, 3) } };
  }

  if (has('put a', 'place a', 'add a') || ['sink', 'outlet', 'light'].includes(w[0])) {
    const kind = ['sink', 'outlet', 'light'].find(k => t.includes(k));
    if (!kind) return { error: 'a sink, an outlet or a light' };
    const n = (raw.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    if (n.length < 3) return { error: 'where? "put a sink at 14 33 46"' };
    const system = kind === 'sink' ? 'water' : 'power';
    const existing = world.all({ kind: 'fixture' }).filter(f => f.meta.role === kind).length;
    return { op: 'fixture', args: { id: existing ? `${kind}.${existing + 1}` : kind, system, kind, at: n.slice(0, 3) } };
  }

  if (w[0] === 'route') {
    const system = has('power', 'electric') ? 'power' : 'water';
    const parts = raw.split(/\s+/);
    const fi = parts.findIndex(x => x.toLowerCase() === 'from');
    const ti = parts.findIndex(x => x.toLowerCase() === 'to');
    const src = fi >= 0 ? parts[fi + 1] : null;
    const dst = ti >= 0 ? parts[ti + 1] : null;
    const a = world.get(src), b = world.get(dst);
    if (!a || !b) return { error: `route from a source to a fixture — I have ${world.all({ kind: 'source' }).map(e => e.id).join(', ') || 'no sources'} and ${world.all({ kind: 'fixture' }).map(e => e.id).join(', ') || 'no fixtures'}` };
    const dm = raw.match(/(\d+(\.\d+)?)\s*(in|")/i);
    const dia = dm ? parseFloat(dm[1]) : (system === 'water' ? 0.75 : 0.5);
    return { op: 'route', args: { system, run: `${system}.${b.id}`, dia, path: planPath(world, a.box.p, b.box.p) } };
  }

  if (w[0] === 'reroute') return { op: 'reroute', args: { run: raw.split(/\s+/)[1] } };
  if (w[0] === 'strap') return { op: 'strap', args: { id: id() || w[1] } };
  if (w[0] === 'upsize') return { op: 'upsize', args: { id: id() || w[1] } };
  if (w[0] === 'move') {
    const n = (raw.match(/-?\d+(\.\d+)?/g) || []).map(Number);
    if (n.length < 3) return { error: 'move <id> by X Y Z' };
    return { op: 'move', args: { id: id(), delta: n.slice(0, 3) } };
  }
  if (w[0] === 'make' || w[0] === 'material') {
    const mats = ['concrete', 'steel', 'treated_wood', 'engineered_lumber', 'plywood', 'siding', 'polycarbonate', 'corrugated_metal', 'standing_seam', 'stone', 'tile', 'paint', 'fabric'];
    const m = mats.find(x => t.includes(x.replace('_', ' ')) || t.includes(x));
    if (!m) return { error: `which material? ${mats.slice(0, 6).join(', ')}...` };
    return { op: 'material', args: { id: id(), material: m } };
  }

  return { error: `I do not have a move for "${raw}"`, vocabulary: VOCABULARY };
}

/** The world's own proposal, ready to be run as the next instruction. */
export function nextMove(world) {
  const conds = world.conditions && world.conditions.length ? world.conditions : checkAll(world);
  for (const c of conds) {
    if (c.repair) return { condition: c, move: c.repair };
  }
  return null;
}
