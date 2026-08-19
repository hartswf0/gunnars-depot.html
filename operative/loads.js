// operative/loads.js — what the building weighs, and what happens at 65 mph.
//
// Joints have been asserted state for a while now, but nothing ever *loaded*
// them. 432 fasteners, and not one of them had ever been asked to hold anything.
// A schedule you never check is a schedule you are trusting, which is the same
// mistake as the support check that skipped services.
//
// A house is shaken by wind and once, maybe, by an earthquake. A trailer is
// shaken every mile. FMCSA 393.102 is the securement rule tractors work to and
// it is the right order of magnitude for anything riding on a highway:
//
//   0.8 g forward   (panic stop)
//   0.5 g rearward
//   0.5 g lateral   (swerve)
//   0.2 g upward    (crest of a bump)
//
// plus the vertical slam coming back down, which for a tandem-axle trailer on
// bad pavement is conventionally taken at 2 g.
//
// THE HONEST CAVEAT, kept at the top where it cannot be skipped: the capacities
// below are published reference values rounded down, not a stamped calculation.
// This finds the joint that will let go first and tells you why. It does not
// certify anything, and no number here should be put on a drawing.

/** lb per cubic foot, for things modelled at their real thickness. */
export const DENSITY = {
  concrete: 145, steel: 490, stone: 165, tile: 120,
  treated_wood: 35, engineered_lumber: 40, plywood: 36, wood: 32
};

/**
 * lb per square foot, for sheet goods modelled at a nominal thickness.
 * The roof cover is drawn 1 in thick because a 0.02 in box is unreadable; taken
 * at steel's density that one sheet weighs 6,870 lb, more than the trailer. Sheet
 * goods are weighed by area, the way they are actually sold.
 */
export const AREAL = {
  corrugated_metal: 1.2, siding: 2.5, fabric: 0.3, paint: 0.1, polycarbonate: 1.5
};

/**
 * Steel sections are not solid bars. A C6 channel is drawn as a 3 x 6 in box
 * because that is its envelope; taken at 490 lb/ft3 each main rail weighed
 * 1,225 lb and the trailer came out at 18,631 lb — heavier than its own axles are
 * rated for, entirely because nobody had ever weighed it. Steel is sold by the
 * foot and weighed by the foot.
 */
export const SECTION_LB_PER_FT = { C4: 5.4, C5: 6.7, C6: 8.2, C8: 11.5 };

/**
 * Hollow things weigh their shell. `bed.base` carries meta.hollow because the
 * support graph needed to know that a battery could live inside it; the mass
 * calculation did not ask, and weighed a storage platform as 1,300 lb of solid
 * plywood. Anything hollow is six faces of sheet, not a block.
 */
export const SHELL_THICKNESS = 0.75;

export function shellMass(e, thick = SHELL_THICKNESS) {
  const s = [0, 1, 2].map(i => e.hi[i] - e.lo[i]);
  const area = 2 * (s[0] * s[1] + s[1] * s[2] + s[0] * s[2]);
  const d = DENSITY[e.material] || DENSITY.plywood;
  return (area * thick / 1728) * d;
}

export function massOf(e) {
  const s = [0, 1, 2].map(i => e.hi[i] - e.lo[i]);
  if (AREAL[e.material] !== undefined) {
    const faces = [s[0] * s[1], s[1] * s[2], s[0] * s[2]];
    return (Math.max(...faces) / 144) * AREAL[e.material];
  }
  const d = DENSITY[e.material];
  if (d === undefined) return 0;                   // services and equipment: below
  return (s[0] * s[1] * s[2] / 1728) * d;
}

/** Equipment weighs what equipment weighs, not what a box of it would weigh. */
export const EQUIPMENT = {
  battery: 26, inverter: 18, panel: 8, controller: 4, pump: 4, heater: 32,
  fridge: 55, cooktop: 22, sink: 12, lav: 10, wc: 28, 'shower.pan': 40,
  light: 0.4, outlet: 0.3, fan: 3, regulator: 1, wheel: 85, coupler: 12
};

export function elementMass(e) {
  const role = (e.meta && e.meta.role) || '';
  if (e.meta && e.meta.lb !== undefined) return e.meta.lb;      // told, not guessed
  if (e.meta && e.meta.ah) return e.meta.ah * 0.26;             // LiFePO4, ~26 lb per 100 Ah
  if (e.meta && e.meta.gallons) return e.meta.gallons * 8.34 + shellMass(e, 0.25);
  if (EQUIPMENT[e.id] !== undefined) return EQUIPMENT[e.id];
  if (EQUIPMENT[role] !== undefined) return EQUIPMENT[role];
  if (EQUIPMENT[e.kind] !== undefined) return EQUIPMENT[e.kind];
  if (e.section && SECTION_LB_PER_FT[e.section] !== undefined) {
    const len = Math.max(...[0, 1, 2].map(i => e.hi[i] - e.lo[i]));
    return SECTION_LB_PER_FT[e.section] * len / 12;
  }
  if (e.meta && e.meta.hollow) return shellMass(e);
  const m = massOf(e);
  if (m) return m;
  return 2;                                            // an unknown part is not weightless
}

/**
 * Published lateral (shear) design values per fastener, in pounds, rounded down.
 * Withdrawal is the second number — a nail pulled straight out is far weaker than
 * a nail sheared, which is why a hurricane tie exists at all.
 */
export const FASTENER = {
  '8d nail':        { shear: 90,  pull: 30,  basis: 'NDS 12N, 0.131 in x 2.5 in, SPF' },
  '10d nail':       { shear: 118, pull: 38,  basis: 'NDS 12N, 0.148 in x 3 in, SPF' },
  '16d nail':       { shear: 141, pull: 45,  basis: 'NDS 12N, 0.162 in x 3.5 in, SPF' },
  '#8 x 2 screw':   { shear: 100, pull: 90,  basis: 'NDS 12L, #8 wood screw' },
  '#8 x 1.25 screw':{ shear: 90,  pull: 70,  basis: 'NDS 12L' },
  '#8 x 1 screw':   { shear: 80,  pull: 60,  basis: 'NDS 12L' },
  '#9 x 1.5 screw': { shear: 110, pull: 100, basis: 'NDS 12L' },
  '#10 screw':      { shear: 150, pull: 120, basis: 'NDS 12L, #10 wood screw' },
  '#10 x 1 screw':  { shear: 120, pull: 90,  basis: 'NDS 12L' },
  '#10 x 1.5 screw':{ shear: 130, pull: 105, basis: 'NDS 12L' },
  '#10 x 2 screw':  { shear: 145, pull: 115, basis: 'NDS 12L' },
  '#10 x 3 screw':  { shear: 160, pull: 130, basis: 'NDS 12L' },
  'H2.5A tie':      { shear: 165, pull: 415, basis: 'Simpson H2.5A, published uplift' },
  '1/4-20 bolt':    { shear: 600, pull: 400, basis: 'NDS 12A, 1/4 in bolt, single shear' },
  '3/16 fillet weld': { shear: 3000, pull: 3000, basis: 'E70XX, 2 in of 3/16 fillet' },
  'pipe clamp strap': { shear: 100, pull: 80,  basis: 'sheet-metal pipe clamp' },
  'steel strap':    { shear: 800, pull: 800, basis: '1-1/4 in x 20 ga strapping' },
  'pipe hanger strap': { shear: 120, pull: 100, basis: 'split-ring hanger' },
  'webbing strap':  { shear: 500, pull: 500, basis: '1 in polyester webbing' },
  'strap':          { shear: 300, pull: 300, basis: 'generic strap, assumed' }
};
const UNKNOWN = { shear: 60, pull: 30, basis: 'unknown fastener, assumed weak on purpose' };
export const capacityOf = (j) =>
  FASTENER[`${j.size} ${j.type}`] || FASTENER[j.size] || FASTENER[j.type] || UNKNOWN;

/**
 * What each element is holding up: itself, plus everything whose only route to
 * the ground runs through it. Computed by cutting the element out of the cached
 * support graph and seeing what stops being grounded — which is a dominator, and
 * is the only honest way to say "this joint carries that".
 */
export function tributary(world, g = world.grounded()) {
  const over = g.over, under = g.under;
  const mass = new Map();
  for (const e of world.solids()) mass.set(e.id, elementMass(e));

  const groundIds = world.solids().filter(e => e.lo[2] <= 0.6).map(e => e.id);
  const reach = (skip) => {
    const seen = new Set(), q = [];
    for (const id of groundIds) if (id !== skip) { seen.add(id); q.push(id); }
    while (q.length) {
      const id = q.pop();
      for (const up of over.get(id) || []) {
        if (up.via === 'touch' || up.id === skip || seen.has(up.id)) continue;
        seen.add(up.id); q.push(up.id);
      }
    }
    return seen;
  };
  const whole = reach(null);
  const out = new Map();
  for (const e of world.solids()) {
    if (!whole.has(e.id)) { out.set(e.id, { carried: mass.get(e.id) || 0, orphans: [] }); continue; }
    // Nothing rests on it, so it carries only itself and the cut is pointless. Most
    // of a building is leaves; skipping them takes the whole pass from 94 ms to a
    // fraction of it, which is the difference between a check that runs on every
    // move and one that runs when someone remembers.
    if (!(over.get(e.id) || []).some(u => u.via !== 'touch')) {
      out.set(e.id, { carried: mass.get(e.id) || 0, orphans: [] });
      continue;
    }
    const without = reach(e.id);
    let carried = mass.get(e.id) || 0;
    const orphans = [];
    for (const id of whole) if (id !== e.id && !without.has(id)) { carried += mass.get(id) || 0; orphans.push(id); }
    out.set(e.id, { carried: +carried.toFixed(1), orphans });
  }
  return { tributary: out, mass, total: +[...mass.values()].reduce((a, b) => a + b, 0).toFixed(0) };
}

/**
 * Sliding friction for a member that is set down and not fastened. Wood on wood
 * and steel on wood both sit near this; it is deliberately not generous, because
 * the alternative reading of an unfastened part is that it is held by nothing.
 */
export const MU_BEARING = 0.35;

/** The road, as accelerations. Every one of these is a case the trailer must survive. */
export const ROAD = [
  { id: 'stop',    label: 'panic stop',   g: [0, -0.8, 0], mode: 'shear', basis: 'FMCSA 393.102(a)' },
  { id: 'reverse', label: 'hard reverse', g: [0, 0.5, 0],  mode: 'shear', basis: 'FMCSA 393.102(a)' },
  { id: 'swerve',  label: 'swerve',       g: [0.5, 0, 0],  mode: 'shear', basis: 'FMCSA 393.102(a)' },
  { id: 'crest',   label: 'crest of a bump', g: [0, 0, 0.2], mode: 'pull', basis: 'FMCSA 393.102(a)' },
  { id: 'slam',    label: 'landing off a bump', g: [0, 0, -2], mode: 'shear', basis: 'tandem axle on bad pavement, conventional' }
];

/**
 * Shake it and see what lets go. For every element, the mass it carries times the
 * acceleration, against what its own joints to the things below it can take.
 */
export function shake(world, cases = ROAD, g = world.grounded()) {
  const { tributary: trib, mass, total } = tributary(world, g);
  const results = [];
  for (const e of world.solids()) {
    const t = trib.get(e.id);
    if (!t) continue;
    if (e.lo[2] <= 0.6) continue;      // it is standing on the road; the road holds it
    const downs = (g.under.get(e.id) || []).filter(u => u.via !== 'touch');
    const joints = downs.map(u => world.joints.get([e.id, u.id].sort().join('|'))).filter(Boolean);
    const bearing = downs.some(u => u.via === 'bear');
    for (const c of cases) {
      const a = Math.hypot(...c.g);
      if (!a) continue;
      // Down is carried by bearing where there is bearing; everything else lands
      // on the fasteners.
      if (c.g[2] < 0 && bearing) continue;
      const demand = t.carried * a;
      let capacity = 0;
      for (const j of joints) {
        const cap = capacityOf(j);
        capacity += (j.count || 2) * (c.mode === 'pull' ? cap.pull : cap.shear);
      }
      // Friction is not a fastener.
      //
      // This read `capacity = demand * 1.5` — every unfastened member that
      // happened to be resting on something was handed exactly half again the
      // capacity it needed, in every case, whatever it weighed. The test was
      // structurally incapable of failing an unfastened part, which is the same
      // shape as the services exemption that hid twenty-three floating fixtures.
      //
      // What actually resists a panic stop for a part that is merely set down is
      // friction: mu times its own weight. At 0.8 g the demand beats mu on any
      // real surface, which is why cargo gets strapped and not merely set down.
      // Downward cases are already skipped above — the road holds those.
      if (!joints.length && bearing && c.mode === 'shear') capacity = MU_BEARING * t.carried;
      // A quarter-pound trap with no fastener is a real omission, but it is
      // UNJOINED's business, not the shake test's. Reporting it here as an
      // infinite overload buries the 836 lb tank in a list of P-traps.
      if (demand < 5) continue;
      const ratio = capacity > 0 ? demand / capacity : Infinity;
      if (ratio > 1) results.push({
        id: e.id, kind: e.kind, case: c.id, label: c.label, basis: c.basis,
        carries: t.carried, demand: +demand.toFixed(0), capacity: +capacity.toFixed(0),
        ratio: +ratio.toFixed(2), joints: joints.length,
        holding: t.orphans.length, sample: t.orphans.slice(0, 3)
      });
    }
  }
  results.sort((a, b) => b.ratio - a.ratio);
  return { weight: total, failures: results,
           worst: results[0] || null,
           byCase: cases.map(c => ({ ...c, n: results.filter(r => r.case === c.id).length })) };
}
