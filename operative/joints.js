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
  { a: 'panel',     b: 'sheathing', type: 'screw', size: '#10', spacing: 12, how: 'through the ribs' }
];

const key = (a, b) => [a, b].sort().join('|');

/** The schedule entry for a pair of kinds, in either order. */
export function scheduleFor(kindA, kindB) {
  return SCHEDULE.find(s => (s.a === kindA && s.b === kindB) || (s.a === kindB && s.b === kindA)) || null;
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
