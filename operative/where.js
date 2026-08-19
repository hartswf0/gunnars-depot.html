// operative/where.js — where is it fucked, and what kind of fucked is it.
//
// The loop has one question — what sucks — and it asks it of the whole trailer at
// once. That was fine when the answer was "the electrical is floating"; it is
// useless now that the answer is a list of 17 gable pairs, 88 escaping rays, an
// unreachable bed and 429 contacts nothing has a rule for. A criticism that
// applies to the whole building tells the builder nothing about where to stand.
//
// So every finding gets three coordinates, and the loop can be pointed:
//
//   ZONE       where on the trailer — fore of the axles, over them, aft; and
//              which surface: floor, wall, roof. The axle zone matters because
//              that is where the trailer is 77 in wide instead of 94 and where
//              every plan problem in this build turned out to live.
//   SYSTEM     what trade owns it — frame, envelope, services, fit-out, the road.
//   PATHOLOGY  what kind of wrong it is, independent of where. Unfastened is the
//              same disease in a rafter and in a hitch coupler, and grouping by
//              it is how you notice you have the disease rather than the symptom.

/** Fore of the axles, over them, or aft. Read off the wheel wells, not guessed. */
export function zones(world) {
  const wells = world.all().filter(e => e.kind === 'wellcap' || e.kind === 'wellside');
  const y0 = wells.length ? Math.min(...wells.map(e => e.lo[1])) : 0;
  const y1 = wells.length ? Math.max(...wells.map(e => e.hi[1])) : 0;
  const deck = world.all().filter(e => e.meta.role === 'floor sheathing');
  const floorZ = deck.length ? Math.max(...deck.map(e => e.hi[2])) : 16;
  const plates = world.all().filter(e => /top plate/.test(e.meta.role || ''));
  const plateZ = plates.length ? Math.max(...plates.map(e => e.hi[2])) : floorZ + 90;
  return { axle: [y0, y1], floorZ, plateZ,
    along: (y) => (y < y0 ? 'fore' : y > y1 ? 'aft' : 'axle'),
    height: (z) => (z < floorZ - 0.5 ? 'under' : z > plateZ - 0.5 ? 'roof' : 'wall') };
}

/** Rooms, from the things that make them rooms rather than from a list of names. */
export function rooms(world) {
  const named = [
    ['bath',    ['wc', 'lav', 'lav.cab', 'shower.pan']],
    ['galley',  ['sink', 'fridge', 'cab.galley', 'top.galley']],
    ['dinette', ['table', 'bench.W', 'bench.E']],
    ['sleep',   ['bed.base', 'mattress']]
  ];
  const out = [];
  for (const [id, ids] of named) {
    const es = ids.map(x => world.get(x)).filter(Boolean);
    if (!es.length) continue;
    out.push({ id,
      lo: [0,1,2].map(i => Math.min(...es.map(e => e.lo[i]))),
      hi: [0,1,2].map(i => Math.max(...es.map(e => e.hi[i]))),
      members: es.map(e => e.id) });
  }
  return out;
}

/** Which trade owns it. */
export const SYSTEM = {
  foundation: 'road', chassis: 'road',
  frame: 'frame', walls: 'envelope', roof: 'envelope',
  services: 'services', interior: 'fit-out'
};
export const systemOf = (el) => (el && SYSTEM[el.layer]) || 'unknown';

/**
 * What kind of wrong, independent of where.
 *
 * Grouping by this is how you find out you have one disease in nine places
 * rather than nine problems — which is what the fastening bug turned out to be.
 */
export const PATHOLOGY = {
  UNJOINED:        'not fastened',
  UNDER_NAILED:    'not fastened',
  UNLAPPED:        'nothing to fasten to',
  NO_BEARING:      'not held up',
  ONE_END_BEARING: 'not held up',
  FLOATING:        'not held up',
  SHAKE_FAILURE:   'will not survive the road',
  ENVELOPE:        'will not survive the road',
  OVERLAP:         'two things in one place',
  PROTRUDES:       'two things in one place',
  LEAK:            'the outside gets in',
  UNFLASHED:       'the outside gets in',
  PONDING:         'the outside gets in',
  NO_DRIP_EDGE:    'the outside gets in',
  SPAN_EXCEEDED:   'overspanned',
  BORE_OVERSIZE:   'cut too much away',
  PLATE_TIE_REQUIRED: 'cut too much away',
  EDGE_CLEARANCE:  'cut too much away',
  UNREACHABLE:     'a body cannot use it',
  AISLE_TOO_NARROW:'a body cannot use it',
  NO_CLEARANCE:    'a body cannot use it',
  LOW_HEADROOM:    'a body cannot use it',
  NO_EGRESS:       'a body cannot get out',
  NO_DAYLIGHT:     'nothing to see by',
  NO_VIEW_OUT:     'nothing to see by',
  UNLIT:           'nothing to see by',
  VOLTAGE_DROP:    'the service does not reach',
  UNDERSIZED_CONDUCTOR: 'the service does not reach',
  SERVICE_ORPHAN:  'the service does not reach',
  POWER_BUDGET:    'the service does not reach',
  NO_TRAP:         'the drain will smell',
  UNVENTED_TRAP:   'the drain will smell',
  OPENING_UNHEADED:'an opening with nothing over it',
  OPENING_ABOVE_PLATE: 'an opening with nothing over it',
  // the colony's own kinds
  HOLE: 'the outside gets in', GAP: 'the outside gets in',
  CLASH: 'two things in one place', CLIFF: 'the surface ends at nothing',
  VOID: 'a cavity behind the surface', UNRULED: 'nothing has an opinion'
};
export const pathologyOf = (code) => PATHOLOGY[code] || 'unclassified';

/** One finding, placed. Works on a checkAll condition or a colony finding alike. */
export function locate(world, f, z = zones(world), rs = rooms(world)) {
  const ids = f.elements || f.near || [];
  const els = ids.map(id => world.get(id)).filter(Boolean);
  let at = f.at;
  if (!at && els.length) at = [0,1,2].map(i =>
    els.reduce((s, e) => s + (e.lo[i] + e.hi[i]) / 2, 0) / els.length);
  const code = f.code || f.kind;
  const room = at ? (rs.find(r => [0,1,2].every(i => at[i] >= r.lo[i] - 6 && at[i] <= r.hi[i] + 6)) || null) : null;
  return {
    code, severity: f.severity === undefined ? null : f.severity,
    message: f.message || (f.detail && f.detail.label) || '',
    at: at ? at.map(v => +v.toFixed(1)) : null,
    zone:   at ? z.along(at[1]) : null,
    height: at ? z.height(at[2]) : null,
    room:   room ? room.id : null,
    system: els.length ? systemOf(els[0]) : null,
    pathology: pathologyOf(code),
    elements: ids.slice(0, 6),
    ants: f.ants || null
  };
}

/**
 * The whole state, sliced three ways.
 *
 * The point is not the totals. It is that the same list read by zone, by system
 * and by pathology says three different things, and only one of them tells the
 * builder where to stand.
 */
export function census(world, findings) {
  const z = zones(world), rs = rooms(world);
  const placed = findings.map(f => locate(world, f, z, rs));
  const tally = (key) => {
    const m = new Map();
    for (const p of placed) {
      const k = p[key] === null ? 'unplaced' : p[key];
      const e = m.get(k) || { key: k, n: 0, codes: new Set(), worst: 0 };
      e.n++; e.codes.add(p.code); e.worst = Math.max(e.worst, p.severity || 0);
      m.set(k, e);
    }
    return [...m.values()].map(e => ({ ...e, codes: [...e.codes] }))
      .sort((a, b) => b.worst - a.worst || b.n - a.n);
  };
  return { placed, byZone: tally('zone'), byHeight: tally('height'),
           byRoom: tally('room'), bySystem: tally('system'), byPathology: tally('pathology'),
           axle: z.axle };
}

/** Point the loop somewhere. Everything else stays open; it just is not this turn's problem. */
export function scope(placed, { zone = null, height = null, room = null, system = null, pathology = null } = {}) {
  return placed.filter(p =>
    (zone === null || p.zone === zone) &&
    (height === null || p.height === height) &&
    (room === null || p.room === room) &&
    (system === null || p.system === system) &&
    (pathology === null || p.pathology === pathology));
}

/**
 * The accusation for one scope, in the critic's voice.
 *
 * "The trailer is fucked" is not actionable. "Everything over the axles is
 * fucked, in these four ways, and here is the widest thing there" is.
 */
export function accuseScope(world, placed, sel) {
  const hit = scope(placed, sel);
  const where = Object.entries(sel).filter(([, v]) => v).map(([k, v]) => `${k} ${v}`).join(', ') || 'the whole trailer';
  if (!hit.length) return { text: `Nothing currently stands against ${where}. That is not the same as it being right.`, n: 0, scope: sel };
  const byPath = new Map();
  for (const p of hit) byPath.set(p.pathology, (byPath.get(p.pathology) || 0) + 1);
  const lines = [`SUCK SCOPE: ${where}`, '', `${hit.length} finding${hit.length === 1 ? '' : 's'} here, of ${byPath.size} kind${byPath.size === 1 ? '' : 's'}:`];
  for (const [k, n] of [...byPath].sort((a, b) => b[1] - a[1])) lines.push(`  ${String(n).padStart(3)}  ${k}`);
  lines.push('', 'WHAT SUCKS:');
  for (const p of hit.slice(0, 8))
    lines.push(`${p.code}${p.at ? ` at ${p.at.join(', ')}` : ''} — ${p.message || p.pathology}${p.elements.length ? ` (${p.elements.slice(0, 3).join(', ')})` : ''}`);
  return { text: lines.join('\n'), n: hit.length, scope: sel, findings: hit };
}
