// operative/joints.js — what holds the building together.
//
// Until this file existed the model had 973 relationships and not one joint. Two
// members were "fastened" because their faces happened to touch — an inference
// drawn from geometry, never an act of construction. Nothing was nailed.
//
// A joint is asserted, not inferred. It says: these two members are connected,
// by this many of these fasteners, and here is the schedule that requires it.
//
// The schedule is IRC Table R602.3(1), the fastening schedule a framer works to.

export const SCHEDULE = [
  { a: 'stud',      b: 'plate',     type: 'nail', size: '16d', count: 2, how: 'end nail',
    note: 'stud to sole or top plate' },
  { a: 'plate',     b: 'plate',     type: 'nail', size: '16d', per: 12, how: 'face nail',
    note: 'doubled top plate, 2 per foot' },
  { a: 'joist',     b: 'chassis',   type: 'nail', size: '10d', count: 3, how: 'toe nail',
    note: 'joist to sill' },
  { a: 'deck',      b: 'joist',     type: 'nail', size: '8d', spacing: 6, how: 'edges 6 in, field 12 in',
    note: 'floor sheathing' },
  { a: 'sheathing', b: 'stud',      type: 'nail', size: '8d', spacing: 6, how: 'edges 6 in, field 12 in',
    note: 'wall sheathing' },
  { a: 'sheathing', b: 'plate',     type: 'nail', size: '8d', spacing: 6, how: 'edges 6 in',
    note: 'sheathing to plate' },
  { a: 'rafter',    b: 'plate',     type: 'tie',  size: 'H2.5A', count: 1, how: 'hurricane tie',
    note: 'a toe nail alone does not hold a roof down' },
  { a: 'panel',     b: 'rafter',    type: 'screw', size: '#10', spacing: 12, how: 'through the ribs',
    note: 'metal roof cover' },
  { a: 'header',    b: 'jack',      type: 'nail', size: '16d', count: 3, how: 'end nail',
    note: 'header onto its jack' },
  { a: 'jack',      b: 'king',      type: 'nail', size: '16d', spacing: 12, how: 'face nail',
    note: 'jack to king' },
  { a: 'king',      b: 'plate',     type: 'nail', size: '16d', count: 2, how: 'end nail' },
  { a: 'cripple',   b: 'plate',     type: 'nail', size: '16d', count: 2, how: 'end nail' },
  { a: 'cripple',   b: 'header',    type: 'nail', size: '16d', count: 2, how: 'end nail' },
  { a: 'chassis',   b: 'chassis',   type: 'weld', size: '3/16 fillet', count: 2, how: 'welded both sides',
    note: 'crossmember to rail' },
  { a: 'blocking',  b: 'stud',      type: 'nail', size: '16d', count: 2, how: 'end nail' },
  { a: 'wellcap',   b: 'wellside',  type: 'nail', size: '8d', spacing: 6, how: 'edges' },
  { a: 'wellside',  b: 'joist',     type: 'nail', size: '8d', spacing: 6, how: 'edges' },
  { a: 'strap',     b: 'plate',     type: 'screw', size: '#9 x 1.5', count: 8, how: 'both sides of the cut' },
  { a: 'partition', b: 'deck',      type: 'nail', size: '16d', spacing: 16, how: 'through the sole' },

  // A house's furniture sits on the floor. A trailer's furniture travels at 65 mph,
  // so everything in it is fastened down — which is why these entries exist at all.
  // Without them 22 members reported themselves unsupported, correctly.
  { a: 'cabinet',   b: 'deck',      type: 'screw', size: '#10 x 3', spacing: 16, how: 'through the base' },
  { a: 'cabinet',   b: 'stud',      type: 'screw', size: '#10 x 3', count: 4, how: 'through the back into studs' },
  { a: 'bench',     b: 'deck',      type: 'screw', size: '#10 x 3', spacing: 16, how: 'through the base' },
  { a: 'bench',     b: 'wellcap',   type: 'screw', size: '#10 x 2', count: 4, how: 'onto the wheel well' },
  { a: 'bed',       b: 'deck',      type: 'screw', size: '#10 x 3', spacing: 16, how: 'through the base' },
  { a: 'counter',   b: 'cabinet',   type: 'screw', size: '#8 x 1.25', spacing: 24, how: 'up through the rails' },
  { a: 'table',     b: 'leg',       type: 'screw', size: '#10 x 2', count: 4, how: 'through the top' },
  { a: 'leg',       b: 'deck',      type: 'screw', size: '#10 x 3', count: 4, how: 'to the floor' },
  { a: 'mattress',  b: 'bed',       type: 'strap', size: 'webbing', count: 2, how: 'so it stays put on the road' },
  { a: 'partition', b: 'stud',      type: 'nail', size: '16d', spacing: 16, how: 'to the wall' },
  { a: 'chase',     b: 'stud',      type: 'screw', size: '#8 x 2', spacing: 16, how: 'to the wall' },
  { a: 'fixture',   b: 'cabinet',   type: 'screw', size: '#8 x 1', count: 4, how: 'clipped into the carcass' },
  { a: 'fixture',   b: 'deck',      type: 'screw', size: '#10 x 3', count: 4, how: 'to the floor' },
  { a: 'fixture',   b: 'stud',      type: 'screw', size: '#10 x 3', count: 2, how: 'to a stud or to blocking' },
  { a: 'fixture',   b: 'blocking',  type: 'screw', size: '#10 x 3', count: 2, how: 'to blocking' },
  { a: 'fixture',   b: 'bed',       type: 'strap', size: 'steel', count: 2, how: 'a battery must not move' },
  { a: 'source',    b: 'bed',       type: 'strap', size: 'steel', count: 2, how: 'a tank must not move' },
  { a: 'source',    b: 'deck',      type: 'strap', size: 'steel', count: 2, how: 'strapped down' },
  { a: 'source',    b: 'chassis',   type: 'strap', size: 'steel', count: 2, how: 'bottle ring on the tongue plate' },
  { a: 'fixture',   b: 'chassis',   type: 'screw', size: '#10 x 1', count: 2, how: 'to the frame' },
  { a: 'fixture',   b: 'rafter',    type: 'screw', size: '#8 x 2', count: 2, how: 'up into the rafter' },
  { a: 'fixture',   b: 'plate',     type: 'screw', size: '#8 x 2', count: 2, how: 'into the plate' },
  { a: 'panel',     b: 'panel',     type: 'bolt',  size: '1/4-20', count: 4, how: 'PV feet through the roof rib' },
  { a: 'vent',      b: 'stud',      type: 'strap', size: 'pipe clamp', spacing: 32, how: 'clipped to the framing' },
  { a: 'vent',      b: 'sheathing', type: 'strap', size: 'pipe clamp', spacing: 32, how: 'clipped to the wall' },
  { a: 'trap',      b: 'joist',     type: 'strap', size: 'pipe hanger', count: 2, how: 'hung under the floor' },
  // A hanger bridges the gap between a pipe and the framing, so it has two ends
  // and a schedule row for each of them.
  { a: 'hanger',    b: 'joist',     type: 'screw', size: '#10 x 1.5', count: 2, how: 'into the joist' },
  { a: 'hanger',    b: 'stud',      type: 'screw', size: '#10 x 1.5', count: 2, how: 'into the stud' },
  { a: 'hanger',    b: 'plate',     type: 'screw', size: '#10 x 1.5', count: 2, how: 'into the plate' },
  { a: 'hanger',    b: 'rafter',    type: 'screw', size: '#10 x 1.5', count: 2, how: 'into the rafter' },
  { a: 'hanger',    b: 'blocking',  type: 'screw', size: '#10 x 1.5', count: 2, how: 'into the blocking' },
  { a: 'hanger',    b: 'deck',      type: 'screw', size: '#10 x 1.5', count: 2, how: 'up through the floor' },
  { a: 'hanger',    b: 'sheathing', type: 'screw', size: '#10 x 1.5', count: 2, how: 'into the sheathing' },
  { a: 'hanger',    b: 'chassis',   type: 'bolt',  size: '1/4-20', count: 2, how: 'through the frame' },
  { a: 'hanger',    b: 'vent',      type: 'strap', size: 'pipe clamp', count: 2, how: 'clamped' },
  { a: 'hanger',    b: 'trap',      type: 'strap', size: 'pipe clamp', count: 2, how: 'clamped' },
  { a: 'hanger',    b: 'source',    type: 'strap', size: 'pipe clamp', count: 2, how: 'clamped' },
  { a: 'hanger',    b: 'fixture',   type: 'strap', size: 'strap', count: 2, how: 'strapped' },
  { a: 'hanger',    b: 'panel',     type: 'bolt',  size: '1/4-20', count: 2, how: 'bolted' },
  { a: 'source',    b: 'joist',     type: 'strap', size: 'pipe hanger', count: 2, how: 'hung under the floor' },
  { a: 'panel',     b: 'sheathing', type: 'screw', size: '#10', spacing: 12, how: 'through the ribs' },

  // Interior furniture bears on other interior furniture constantly — a counter on
  // a cabinet, a mattress on a bed, a tank on a platform. In a house none of that
  // needs a fastener. In a trailer all of it does, and the absence of a row is
  // not the same as a decision that nothing is needed.
  { a: 'fixture',   b: 'fixture',   type: 'screw', size: '#8 x 2', count: 4,
    how: 'fastened because it travels', note: 'catch-all: nothing rides loose' },
  { a: 'source',    b: 'fixture',   type: 'strap', size: 'steel', count: 2, how: 'strapped to what it sits in' },
  { a: 'fixture',   b: 'source',    type: 'strap', size: 'steel', count: 2, how: 'strapped' },
  // The flue: found by shaking it. A 4 in double-wall flue hung inside a boxed
  // chase, and the chase itself, were held by containment and nothing else.
  { a: 'flue',      b: 'chase',     type: 'screw', size: '#10 x 1.5', count: 4, how: 'through the chase into the collar' },
  { a: 'chase',     b: 'sheathing', type: 'screw', size: '#8 x 2', spacing: 16, how: 'to the wall' },
  { a: 'source',    b: 'panel',     type: 'screw', size: '#10 x 1.5', count: 4, how: 'flashed and screwed to the roof' },
  { a: 'source',    b: 'sheathing', type: 'screw', size: '#10 x 1.5', count: 4, how: 'to the skin' },
  // Flashing. IRC R905.2.8.5 nails a drip edge at 12 in o.c.; at 2 g coming off a
  // bump a 20 ft length of it wants more than the generic four screws it was
  // getting, which the shake test noticed at 1.03x.
  { a: 'flashing',  b: 'panel',     type: 'nail', size: '10d nail', spacing: 10, how: 'along the edge' },
  { a: 'flashing',  b: 'sheathing', type: 'nail', size: '10d nail', spacing: 10, how: 'into the skin' },
  { a: 'flashing',  b: 'rafter',    type: 'nail', size: '10d nail', spacing: 10, how: 'into the tails' },
  { a: 'flashing',  b: 'plate',     type: 'nail', size: '10d nail', spacing: 10, how: 'into the plate' },
  { a: 'flashing',  b: 'run',       type: 'strap', size: 'steel', count: 2, how: 'storm collar' },
  // Glass and doors. A window is fixed into its rough opening through the frame
  // and a nailing flange over the skin; a leaf hangs on the jack it is hinged to.
  { a: 'glazing',   b: 'jack',      type: 'screw', size: '#8 x 2', count: 4, how: 'through the frame' },
  { a: 'glazing',   b: 'king',      type: 'screw', size: '#8 x 2', count: 4, how: 'through the frame' },
  { a: 'glazing',   b: 'header',    type: 'screw', size: '#8 x 2', count: 2, how: 'into the head' },
  { a: 'glazing',   b: 'cripple',   type: 'screw', size: '#8 x 2', count: 2, how: 'into the sill' },
  { a: 'glazing',   b: 'stud',      type: 'screw', size: '#8 x 2', count: 2, how: 'into the frame' },
  { a: 'glazing',   b: 'sheathing', type: 'nail',  size: '8d nail', spacing: 8, how: 'nailing flange' },
  { a: 'glazing',   b: 'plate',     type: 'screw', size: '#8 x 2', count: 2, how: 'into the plate' },
  { a: 'leaf',      b: 'jack',      type: 'screw', size: '#10 x 3', count: 6, how: 'three hinges' },
  { a: 'leaf',      b: 'king',      type: 'screw', size: '#10 x 3', count: 6, how: 'three hinges' },
  { a: 'leaf',      b: 'header',    type: 'screw', size: '#8 x 2', count: 2, how: 'into the head' },
  { a: 'leaf',      b: 'sheathing', type: 'nail',  size: '8d nail', spacing: 8, how: 'through the casing' },
  { a: 'leaf',      b: 'plate',     type: 'screw', size: '#8 x 2', count: 2, how: 'threshold' },
  { a: 'leaf',      b: 'stud',      type: 'screw', size: '#10 x 3', count: 6, how: 'hinges' }
];

const key = (a, b) => [a, b].sort().join('|');

/**
 * What a thing counts as, for the purposes of a rule.
 *
 * This model has two naming systems and they disagree. `kind` is the structural
 * class the geometry engine cares about — everything in the interior is `fixture`.
 * `meta.role` is what the thing actually is: cabinet, bed, counter, fridge. The
 * schedule below is written in roles, because a framer says "screw the cabinet to
 * the studs", not "screw the fixture to the fixture".
 *
 * Every rule written against `kind` alone has silently missed. The NEC working
 * clearance never fired on a single panel. The fastening schedule skipped the
 * entire interior: fourteen fixture/fixture contacts including an 836 lb water
 * tank sitting loose in the bed platform, found only when something finally tried
 * to shake the trailer. A miss is silent, which is what makes it expensive.
 *
 * So there is one function, and everything asks it.
 */
export function sortOf(e) {
  if (!e) return null;
  const role = e.meta && e.meta.role;
  if (role && ROLES.has(role)) return role;
  return e.kind;
}

/** Roles that name a real thing a rule can be written about. */
export const ROLES = new Set([
  'glazing', 'door leaf',
  'cabinet', 'bed', 'bench', 'counter', 'table', 'leg', 'mattress', 'partition',
  'chase', 'panel', 'controller', 'inverter', 'battery', 'regulator', 'pump',
  'heater', 'fridge', 'cooktop', 'sink', 'lav', 'wc', 'shower', 'light',
  'outlet', 'fan', 'flue', 'water source', 'waste source'
]);

/** The schedule entry for a pair of kinds, in either order. */
export function scheduleFor(kindA, kindB) {
  return SCHEDULE.find(s => (s.a === kindA && s.b === kindB) || (s.a === kindB && s.b === kindA)) || null;
}

/**
 * The schedule row for two actual elements. Tries what they are before what class
 * they belong to, so `fixture`/`fixture` becomes `fridge`/`cabinet` and finds the
 * row that was written for it.
 */
export function scheduleForPair(A, B) {
  const a = sortOf(A), b = sortOf(B);
  return scheduleFor(a, b) || scheduleFor(A.kind, b) || scheduleFor(a, B.kind) ||
         scheduleFor(A.kind, B.kind) || null;
}

/** How many fasteners a given contact requires, given its size. */
export function required(rule, contactLength) {
  if (rule.count) return rule.count;
  if (rule.spacing && contactLength) return Math.max(2, Math.ceil(contactLength / rule.spacing) + 1);
  if (rule.per && contactLength) return Math.max(2, Math.ceil((contactLength / rule.per) * 2));
  return 2;
}

export function joinKey(a, b) { return key(a, b); }

/** Every joint an element takes part in. */
export function jointsOf(world, id) {
  const out = [];
  for (const j of (world.joints || new Map()).values()) if (j.a === id || j.b === id) out.push(j);
  return out;
}
