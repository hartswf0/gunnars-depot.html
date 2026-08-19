// operative/ingold.js — the trailer itself.
//
// Named for Tim Ingold, whose distinction between *correction* (reducing deviation
// from a fixed target) and *correspondence* (letting execution reveal conditions
// that change the target) is the whole argument of this repository.
//
// This file is not a model of a trailer. It is the *making* of one: a sequence of
// operations committed through the same journal, checks and repairs as any other
// move, so the finished building carries the record of how it became itself.
//
// Envelope from the reference sheets, which all agree:
//   LENGTH 20'-0"   WIDTH 8'-6"   HEIGHT 10'-6"   SLEEPING 1
//   WATER 65 GAL    POWER OFF-GRID
import { World } from './world.js';
import { seedTrailer } from './kit.js';
import { commit } from './ops.js';
import { run as runLoop } from './loop.js';
import { planPath } from './language.js';
import { SECTIONS } from './world.js';
import { BORE } from './checks.js';

// 8'-6" is the OVERALL towing width. Framing 101 + 0.5 sheathing per side = 102.
// The first build took 8'-6" as the shell width and the world answered with a
// 120 in overall — see SHELL below.
export const SHELL = Object.freeze({
  width: 101, length: 240, wallTop: 106,
  wheelInboard: true, railInset: 10.5, eave: 0,
  roofRise: 0,
  // 2x8 floor joists, and the deck 1.75 in higher to keep the rails off the ground.
  // Not a preference. A 1.5 in drain needs 2 in of edge on each side of a bore, which
  // in a 5.5 in joist leaves exactly one legal height — and a drain has to fall.
  // 2x6 gives 0.00 in of vertical freedom; 2x8 gives 1.75 in, and the run needs 1.25 in.
  // The waste system rewrote the floor structure.
  joistSection: '2x8', deckTop: 15.75,

  // The roof was dead flat and nobody asked. Rain does not care what the checks
  // look for: at 0 in per foot the water sits on it, and with 0.5 in of projection
  // whatever runs off lands on the cladding. IRC R905.10.1 wants 1/4 in per foot
  // minimum; 6 in across 101 gives 0.71.
  //
  // The fall goes across the width because that is where it fits, and the eave
  // goes along the length because that is the only direction the road allows one:
  // 102 in overall is the towing limit and the skin is already at 102. So the low
  // side gets a drip edge instead of an overhang, and the model says why.
  roofRise: 6, eaveX: 0, eaveY: 8
});

// Zones down the length, read off the plan every sheet shares.
export const ZONES = Object.freeze({
  bath:    [4, 64],
  galley:  [64, 112],
  dinette: [112, 180],
  bed:     [182, 236]
});

const step = (world, op, args, because) => {
  const r = commit(world, op, args, because);
  return r;
};

/** Stage 1 — the shell, on the sheet's envelope. */
export function shell() {
  return seedTrailer(new World(), SHELL);
}

/** Stage 2 — the openings: one door, four windows, where the plan puts them. */
export function openings(w, log = []) {
  const cuts = [
    ['door.entry',   { wall: 'W', from: 72,  to: 108, type: 'door' },                          'the plan enters on the long wall, past the bath'],
    ['win.dinette',  { wall: 'W', from: 128, to: 168, type: 'window', sill: 30, head: 60 },     'daylight on the dinette'],
    ['win.galley',   { wall: 'E', from: 74,  to: 94,  type: 'window', sill: 28, head: 52 },     'over the sink'],
    ['win.bed',      { wall: 'N', from: 30,  to: 70,  type: 'window', sill: 26, head: 56 },     'the sheets end the trailer with a window at the bed'],
    ['win.bath',     { wall: 'S', from: 62,  to: 86,  type: 'window', sill: 36, head: 58 },     'light and vent for the shower']
  ];
  for (const [id, args, why] of cuts) {
    log.push(step(w, 'cut', { ...args, id }, why));
    log.push(step(w, 'header', { opening: id }, 'an interrupted stud carries nothing'));
  }
  // And fill them. An opening with nothing in it is a hole, and this model had
  // five of them for its whole life: the ray scan was content, because light is
  // supposed to come through a window, and the voxel CT was not, because it
  // floods air — and air walked in the front door and reported that the trailer
  // enclosed nothing at all. Glass is transparent to one instrument and solid to
  // the other, which is the difference between a window and a hole.
  log.push(step(w, 'closeAll', {}, 'a door leaf and four panes; the openings are openings, not holes'));
  return log;
}

/**
 * Stage 3 — the interior the plan actually names.
 *
 * Two things here were decided by the trailer rather than by the drawing:
 *
 *   The wheel wells are 12 in deep, but the wall stands on the first 3.5 in of
 *   them, so what is left in the room is an 8.5 in ledge at 15 in high — a shelf,
 *   not a seat. The dinette benches are therefore built inboard of the wells and
 *   land on them, instead of being them.
 *
 *   The rear axle sits at 55% of the length for tongue weight, which puts the back
 *   of the wheel well at y=183. That leaves 52 in between the well and the end
 *   wall, so the bed is 52 in deep — a full mattress wants 54. The axle decided
 *   the size of the bed.
 */
export function interior(w, log = []) {
  // Everything here is measured off the floor, not off a remembered number. The
  // first version used absolute heights; when the drain forced the deck up 1.75 in,
  // thirty-five placements broke at once. A thing that sits on the floor is
  // described relative to the floor.
  const D = w.datum.deckTop;
  const at = (x, y, above, h) => [x, y, D + above + h / 2];

  const put = (id, kind, xy, above, size, opts = {}) =>
    log.push(step(w, 'fixture', {
      id, kind, at: at(xy[0], xy[1], above, size[2]), size, layer: 'interior',
      material: opts.material || 'plywood', system: opts.system || null,
      hollow: opts.hollow, hostedBy: opts.host
    }, opts.why));

  const wallH = w.walls.W.topPlateBot - D;

  // --- bath, y 4..64 -------------------------------------------------------
  log.push(step(w, 'place', { id: 'wall.bath.W', kind: 'partition', layer: 'interior',
    at: [21.75, 65.75, D + wallH / 2], size: [36.5, 3.5, wallH], material: 'plywood' }, 'the bath needs to close'));
  log.push(step(w, 'place', { id: 'wall.bath.E', kind: 'partition', layer: 'interior',
    at: [81.75, 65.75, D + wallH / 2], size: [31.5, 3.5, wallH], material: 'plywood' }, 'the other side of the bath door'));
  // a composting head is the reason there is no black tank on this trailer
  put('wc',        'toilet',  [16, 22], 0,  [20, 28, 15],  { material: 'tile', why: 'composting head: no water in, no waste out' });
  put('lav.cab',   'cabinet', [42, 15], 0,  [20, 18, 20],  { hollow: true, why: 'vanity carcass' });
  put('lav',       'sink',    [42, 15], 11, [16, 14, 8],   { material: 'tile', system: 'water', host: 'lav.cab', why: 'basin dropped into the vanity' });
  put('shower.pan','shower',  [80, 24], 0,  [34, 36, 3],   { material: 'tile', system: 'waste', why: '34 x 36 pan in the corner' });

  // --- galley, y 68..114, along the east wall ------------------------------
  put('cab.galley','cabinet', [86, 91],  0,    [23, 46, 20.5], { hollow: true, why: 'the base run, stopped short of the wheel well at y=115' });
  put('top.galley','counter', [86, 91],  20.5, [23, 46, 1.5],  { material: 'stone', why: 'worktop over the run' });
  put('sink',      'sink',    [86, 84],  12,   [16, 20, 8],    { material: 'steel', system: 'water', host: 'cab.galley', why: 'under the galley window' });
  put('fridge',    'fridge',  [86, 104], 1,    [18, 16, 18],   { material: 'steel', system: 'power', host: 'cab.galley', why: '12 V drawer fridge, off-grid sized' });
  put('cooktop',   'range',   [86, 104], 22,   [16, 14, 2],    { material: 'steel', system: 'power', why: 'two burners set on the worktop' });

  // --- dinette, y 118..178, inboard of the wheel wells ---------------------
  // Built clear of the well's face at x=12, not over it: the tyre comes up to 26 in
  // and reaches 5 in past the wall, so a bench at the wall line runs into it.
  // The well cap, at exactly this height, becomes the bench's back ledge.
  put('bench.W',  'bench', [21, 148],   0,  [18, 60, 15], { hollow: true, why: 'clear of the tyre, backing onto the well' });
  put('bench.E',  'bench', [80, 148],   0,  [18, 60, 15], { hollow: true, why: 'the same on the east side' });
  put('table',    'table', [50.5, 148], 14, [33, 36, 2],  { why: '50 in of clear floor between the benches' });
  put('table.leg','leg',   [50.5, 148], 0,  [9, 9, 14],   { why: 'a slab with nothing under it is not a table' });

  // --- bed, y 184..236 -----------------------------------------------------
  put('bed.base', 'bed',      [50.5, 210], 0,  [75, 52, 16], { hollow: true, why: 'platform with storage under' });
  put('mattress', 'mattress', [50.5, 210], 16, [75, 52, 8],  { material: 'fabric', why: '52 in is what the axle left' });
  return log;
}

/**
 * Stage 4 — the services, as a connected system.
 *
 * The sheet lists WATER 65 GAL and POWER OFF-GRID and no grey capacity at all,
 * which is itself a specification: grey water leaves the building. The drain main
 * therefore has to thread the floor joists while falling, and falling is what eats
 * its edge distance.
 *
 * 65 gal is 15,015 cu in. The bed platform gives 15 in of height, so the tank has
 * to be 44 x 24 x 15 to hold it — the requirement sized the tank, not the drawing.
 */
export function services(w, log = []) {
  const D = w.datum.deckTop;

  // The legal band for a bore, computed from the rule rather than guessed at.
  // A 2 in edge is required top and bottom, so a pipe of diameter d may only be
  // centred between these two heights. Everything below is laid inside that band:
  // the constraint generates the design instead of being repaired into it.
  const jTop = D - 0.75;
  const jDepth = SECTIONS[SHELL.joistSection][1];
  const jBot = jTop - jDepth;
  const band = (dia) => [jBot + BORE.joistMinEdge + dia / 2, jTop - BORE.joistMinEdge - dia / 2];

  // A riser cannot come up through a joist; it comes up between them. The bay
  // centres are read off the floor that was actually built, so the pipes follow the
  // framing rather than the framing having to dodge the pipes.
  const joistY = w.all({ kind: 'joist' })
    .map(j => ({ lo: j.box.p[1] - j.box.s[1] / 2, hi: j.box.p[1] + j.box.s[1] / 2 }))
    .sort((a, b) => a.lo - b.lo);
  const bay = (nearY) => {
    let best = nearY, d = Infinity;
    for (let i = 0; i < joistY.length - 1; i++) {
      const mid = (joistY[i].hi + joistY[i + 1].lo) / 2;
      if (joistY[i + 1].lo - joistY[i].hi < 3) continue;
      if (Math.abs(mid - nearY) < d) { d = Math.abs(mid - nearY); best = +mid.toFixed(2); }
    }
    return best;
  };
  // the same reading, for the studs of a wall: blocking has to span bay to bay
  const studBay = (wall, nearY) => {
    const us = w.all({ kind: ['stud', 'king', 'jack'] })
      .filter(e => e.meta.wall === wall)
      .map(e => ({ lo: e.box.p[1] - e.box.s[1] / 2, hi: e.box.p[1] + e.box.s[1] / 2 }))
      .sort((a, b) => a.lo - b.lo);
    let best = null, d = Infinity;
    for (let i = 0; i < us.length - 1; i++) {
      const lo = us[i].hi, hi = us[i + 1].lo;
      if (hi - lo < 6) continue;
      const mid = (lo + hi) / 2;
      if (Math.abs(mid - nearY) < d) { d = Math.abs(mid - nearY); best = { lo, hi, mid }; }
    }
    return best;
  };

  const Y_LAV = bay(15), Y_BATHTEE = bay(24), Y_SINK = bay(84), Y_SHOWER = bay(26),
        Y_TANK = bay(202), Y_PUMP = bay(196), Y_FRIDGE = bay(104), Y_BATT = bay(228);

  const [cLo, cHi] = band(0.75);
  const COLD = +(cHi - 0.15).toFixed(2);           // cold trunk rides high in the band
  const HOT  = +(cLo + 0.15).toFixed(2);           // hot below it, so the two never meet
  const [dLo, dHi] = band(1.5);
  const FALL = 0.25 / 12;                          // per inch of run
  const drainAt = (fromY, toY, startZ) => +(startZ - Math.abs(fromY - toY) * FALL).toFixed(2);
  const MAIN_HI = +dHi.toFixed(2);
  const MAIN_LO = drainAt(84, 24, MAIN_HI);        // the exit end, 60 in forward

  log.push(step(w, 'note', {
    text: `bore band for 1.5 in: z ${dLo.toFixed(2)}..${dHi.toFixed(2)} (${(dHi - dLo).toFixed(2)} in of freedom); ` +
          `the main needs ${(60 * FALL).toFixed(2)} in of fall and runs ${MAIN_HI} -> ${MAIN_LO}`
  }, 'the floor was deepened to 2x8 to make this band exist at all'));

  // --- sources and plant ---------------------------------------------------
  log.push(step(w, 'source', { id: 'tank.fresh', system: 'water', at: [42, 202, D + 8.5],
    size: [44, 24, 15], layer: 'interior', hostedBy: 'bed.base' }, '65 gal is 15,015 cu in; 15 in of platform makes that 44 x 24'));
  // A tank is water in a shell. Weighed as a solid it came out at 4,492 lb.
  w.get('tank.fresh').meta.gallons = 65;
  log.push(step(w, 'fixture', { id: 'pump', kind: 'pump', system: 'water', at: [70, 196, D + 5],
    size: [8, 8, 8], layer: 'interior', material: 'steel', hostedBy: 'bed.base' }, '12 V on-demand pump'));
  log.push(step(w, 'fixture', { id: 'heater', kind: 'heater', system: 'water', at: [94.5, 118, 50],
    size: [6, 12, 20], layer: 'interior', material: 'steel' }, 'tankless, hung on the galley wall, per the diagram'));
  log.push(step(w, 'source', { id: 'grey.out', system: 'waste', at: [50, 22, MAIN_LO] },
    'grey leaves the building — the sheet lists no grey tank'));
  // a shower is two connections, not one: a valve that takes water and a pan that gives it back
  const SB = studBay('E', Y_SHOWER);
  log.push(step(w, 'place', { id: 'block.shower', kind: 'blocking', layer: 'frame',
    at: [w.walls.E.at, SB.mid, 45], size: [3.5, SB.hi - SB.lo, 5.5], material: 'treated_wood', section: '2x6' },
    'a valve in a stud bay has nothing to screw to until you put blocking between the studs'));
  log.push(step(w, 'fixture', { id: 'shower.valve', kind: 'valve', system: 'water',
    at: [95.5, SB.mid, 45], size: [4, 6, 8], layer: 'interior', material: 'steel' }, 'mixer at 45 in, screwed to the blocking'));

  // --- cold: tank -> pump -> trunk -> fixtures and heater ------------------
  const TEE = [70, 120, COLD];
  log.push(step(w, 'route', { system: 'water', run: 'cold.main', dia: 0.75,
    path: [[42, Y_TANK, D + 8.5], [70, Y_PUMP, D + 5], [70, bay(190), COLD], TEE] }, 'cold trunk forward in the joist bay'));
  log.push(step(w, 'route', { system: 'water', run: 'cold.sink', dia: 0.5,
    path: [TEE, [86, 100, COLD], [86, Y_SINK, COLD], [86, Y_SINK, D + 12]] }, 'cold up to the galley sink'));
  log.push(step(w, 'route', { system: 'water', run: 'cold.heater', dia: 0.5,
    path: [TEE, [94.5, 118, COLD], [94.5, 118, 42]] }, 'cold to the tankless heater'));
  const BATH_TEE = [42, Y_BATHTEE, COLD];
  log.push(step(w, 'route', { system: 'water', run: 'cold.bath', dia: 0.5,
    path: [TEE, [70, 40, COLD], BATH_TEE, [42, Y_LAV, COLD], [42, Y_LAV, D + 15]] }, 'cold on to the vanity'));
  log.push(step(w, 'route', { system: 'water', run: 'cold.shower', dia: 0.5,
    path: [BATH_TEE, [95.5, SB.mid, COLD], [95.5, SB.mid, 44]] }, 'cold to the shower'));

  // --- hot: heater -> the three fixtures -----------------------------------
  log.push(step(w, 'route', { system: 'water', run: 'hot.sink', dia: 0.5,
    path: [[94.5, 118, 50], [86, 100, 50], [86, Y_SINK, 50], [86, Y_SINK, D + 14]] }, 'hot back to the galley sink'));
  const HOT_TEE = [42, Y_BATHTEE, HOT];
  log.push(step(w, 'route', { system: 'water', run: 'hot.bath', dia: 0.5,
    path: [[94.5, 118, 50], [94.5, 118, HOT], [60, 40, HOT], HOT_TEE, [42, Y_LAV, HOT], [42, Y_LAV, D + 15]] }, 'hot forward to the vanity'));
  log.push(step(w, 'route', { system: 'water', run: 'hot.shower', dia: 0.5,
    path: [HOT_TEE, [95.5, SB.mid, HOT], [95.5, SB.mid, 44]] }, 'hot to the shower'));

  // --- waste: everything falls forward to the exit -------------------------
  log.push(step(w, 'route', { system: 'waste', run: 'drain.main', dia: 1.5,
    path: [[50, Y_SINK, MAIN_HI], [50, 22, MAIN_LO]] }, `main drain falling ${(60 * FALL).toFixed(2)} in through the joist bay`));
  log.push(step(w, 'route', { system: 'waste', run: 'drain.sink', dia: 1.5,
    path: [[86, Y_SINK, D + 12], [86, Y_SINK, MAIN_HI], [50, Y_SINK, MAIN_HI]] }, 'galley sink down and across'));
  log.push(step(w, 'route', { system: 'waste', run: 'drain.lav', dia: 1.25,
    path: [[42, Y_LAV, D + 11], [42, Y_LAV, drainAt(Y_LAV, 22, MAIN_LO)], [50, 22, MAIN_LO]] }, 'vanity to the exit'));
  log.push(step(w, 'route', { system: 'waste', run: 'drain.shower', dia: 1.5,
    path: [[80, Y_SHOWER, D], [80, Y_SHOWER, drainAt(80, 50, MAIN_LO)], [50, 22, MAIN_LO]] }, 'the shower pan is the lowest fixture on the trailer'));

  // --- power: battery -> the loads -----------------------------------------
  const DC = [86, bay(120), COLD - 1.5];
  log.push(step(w, 'route', { system: 'power', run: 'dc.galley', dia: 0.5,
    path: [[40, 226, D + 8], [40, bay(226), D + 8], [40, bay(226), COLD - 1.5], [40, bay(200), COLD - 1.5], DC, [86, Y_FRIDGE, D + 8]] }, 'DC to the fridge — dropping in a bay first, not slicing across the joists'));
  log.push(step(w, 'route', { system: 'power', run: 'dc.cooktop', dia: 0.5,
    path: [DC, [86, Y_FRIDGE, D + 21]] }, 'ignition for the burners'));
  log.push(step(w, 'route', { system: 'power', run: 'dc.pump', dia: 0.5,
    path: [[40, 226, D + 8], [70, Y_PUMP, D + 5]] }, 'DC to the pump'));
  return log;
}

/**
 * Stage 5 — the repairs the world asked for.
 *
 * Nothing here was written into the design. Each move is the proposal attached to
 * a condition the building raised, applied until it stops making progress.
 */
export function repair(w, log = [], maxPasses = 12) {
  let before = w.conditions.length;
  for (let pass = 0; pass < maxPasses; pass++) {
    const c = (w.conditions || []).find(x => x.repair);
    if (!c) break;
    let r;
    if (c.repair.op === 'reroute') {
      r = step(w, 'reroute', c.repair.args, c.code);
    } else if (c.repair.op === 'route' && c.repair.args.to) {
      // a branch that stops short of its fixture is re-planned to reach it
      const target = w.get(c.repair.args.to);
      const sys = c.repair.args.system;
      const feed = w.all({ kind: 'source' }).find(s2 => s2.system === sys)
        || w.all({ kind: 'fixture' }).find(s2 => s2.system === sys && s2.meta.role === 'heater');
      if (!target || !feed) break;
      r = step(w, 'route', {
        system: sys, run: `${sys}.${target.id}.fix`, dia: 0.5,
        path: planPath(w, feed.box.p, target.box.p)
      }, c.code);
    } else {
      r = step(w, c.repair.op, c.repair.args, c.code);
    }
    log.push(r);
    if (!r.ok) break;
    if (w.conditions.length >= before && !r.closed.length) break;   // no progress
    before = w.conditions.length;
  }
  return log;
}

/**
 * Stage 4b — traps and vents.
 *
 * A drain that reaches the exit is not plumbed. Without a trap the line vents
 * into the room; without a vent the trap seal siphons out and it stops draining.
 * IPC 909.1 caps how far a trap arm may run before it is vented.
 */
export function venting(w, log = []) {
  for (const f of ['sink', 'lav', 'shower.pan'])
    log.push(step(w, 'trap', { fixture: f, size: f === 'lav' ? 1.25 : 1.5 }, 'a fixture without a trap is open to the drain'));
  for (const [t, host] of [['trap.sink', 'cab.galley'], ['trap.lav', 'lav.cab']]) {
    const el = w.get(t); if (el) el.meta.hostedBy = host;   // a trap under a sink is inside the cabinet
  }
  log.push(step(w, 'vent', { near: 'trap.sink', id: 'vent.stack', at: [w.walls.E.at, 104], size: 2 },
    'the stack goes up the wall cavity, clear of the galley window header'));
  return log;
}

/**
 * Stage 4c — propane.
 *
 * Off-grid, cooking and hot water are not electric: a 2 kW tankless on a 12 V bank
 * is not a thing you can do. The bottle lives on the tongue, outside the envelope.
 */
export function propane(w, log = []) {
  const D = w.datum.deckTop;
  // The bottle stands on the tongue platform and the regulator stands on the
  // bottle. Both used to be given round coordinates near the tongue, which put
  // the bottle in mid-air and drove the regulator half an inch into the south skin.
  const TONGUE_TOP = 8.0;
  log.push(step(w, 'source', { id: 'lpg.bottle', system: 'propane', at: [50.5, -16, TONGUE_TOP + 12],
    size: [24, 14, 24], layer: 'services' }, '20 lb bottle standing on the tongue platform'));
  w.get('lpg.bottle').meta.lb = 37;      // a 20 lb bottle full weighs 37; as solid steel it weighed 2,287
  log.push(step(w, 'fixture', { id: 'lpg.reg', kind: 'regulator', system: 'propane',
    at: [50.5, -16, TONGUE_TOP + 24 + 2.5],
    size: [5, 5, 5], layer: 'services', material: 'steel' }, 'two-stage regulator on the bottle'));
  log.push(step(w, 'route', { system: 'propane', run: 'lpg.main', dia: 0.5,
    path: [[50.5, -16, TONGUE_TOP + 12], [50.5, -16, TONGUE_TOP + 26], [50.5, -4, D - 4], [50.5, 8, D - 4], [86, 8, D - 4], [86, 100, D - 4]] },
    'copper along the frame, outside the floor cavity'));
  log.push(step(w, 'route', { system: 'propane', run: 'lpg.cooktop', dia: 0.375,
    path: [[86, 100, D - 4], [86, 104, D + 21]] }, 'up to the burners'));
  log.push(step(w, 'route', { system: 'propane', run: 'lpg.heater', dia: 0.375,
    path: [[86, 100, D - 4], [94.5, 112, D - 4], [94.5, 112, 42]] }, 'and to the water heater'));
  // A horizontal concentric vent through the side wall protrudes past the skin and
  // put the trailer at 104.3 in overall — wider than the road allows. It goes up.
  const roofTop = (w.get('roof.cover') || {}).hi ? w.get('roof.cover').hi[2] : w.walls.E.wallTop + 12;
  log.push(step(w, 'fixture', { id: 'flue.heater', kind: 'flue', system: 'flue',
    at: [94.5, 121, 63], size: [4, 4, 4], layer: 'services', material: 'steel', hostedBy: 'chase.flue' },
    'flue take-off above the heater — exhaust is not gas supply, so it is its own system'));
  const chaseTop = w.walls.E.wallTop;
  log.push(step(w, 'place', { id: 'chase.flue', kind: 'chase', layer: 'interior',
    at: [94.5, 121, (60 + chaseTop) / 2], size: [6, 8, chaseTop - 60], material: 'plywood' },
    'boxed chase against the wall: a 4 in flue removes 114% of a 3.5 in top plate, so it cannot go up inside one'));
  Object.assign(w.get('chase.flue').meta, { hollow: true });
  // The terminal sits on the roof it comes through. Two inches above it, it was
  // a chimney cap floating over the trailer.
  log.push(step(w, 'source', { id: 'flue.out', system: 'flue', at: [94.5, 121, roofTop + 2], size: [5, 5, 4], layer: 'services' },
    'the terminal, seated on the roof it comes through'));
  w.get('flue.out').box.p[2] = (w.get('roof.cover') ? w.get('roof.cover').hi[2] : roofTop) + 2;
  log.push(step(w, 'route', { system: 'flue', run: 'flue.stack', dia: 4,
    path: [[94.5, 121, 63], [94.5, 121, roofTop]] },
    'up the chase and out of the roof, in the rafter bay — a side vent put the trailer at 104.3 in, wider than the road allows'));
  return log;
}

/**
 * Stage 4d — the electrical system, off-grid.
 *
 * Not three cables to three appliances. Array, controller, bank, inverter, two
 * distribution points, and the loads that actually run a day.
 */
export function electrical(w, log = []) {
  const D = w.datum.deckTop;
  const ROOF = w.walls.W.wallTop + 7;
  const put = (id, kind, at, size, meta, why) =>
    log.push(step(w, 'fixture', { id, kind, at, size, layer: meta.layer || 'services',
      system: 'power', material: meta.material || 'steel', hostedBy: meta.host }, why));

  // Equipment is placed where its support is. Every one of these coordinates used
  // to be a round number chosen for looks, and every one of them left the thing
  // hanging in the air: the panels 1.3 in above the roof they are bolted to, the
  // pucks 3 in below the rafters, the outlets a quarter inch off the studs.
  // Nothing in the model asked what held them, so nothing in the model held them.
  // Read off the roof that was actually built. Written as constants, they were
  // right until the roof was pitched, and then the PV panels were bolted to a
  // plane 6 in below the one they were sitting on — eight overlaps with the rafters.
  const cover = w.get('roof.cover');
  const RAFTER_SOFFIT = Math.min(...w.all({ kind: 'rafter' }).map(r => r.lo[2]));
  const ROOF_TOP = cover ? cover.hi[2] : 112.5;
  const RAFTER_Y = [0.75, 16.75, 32.75, 48.75, 64.75, 80.75, 96.75, 112.75,
                    128.75, 144.75, 160.75, 176.75, 192.75, 208.75, 224.75, 239.25];
  const WALL_FACE = { W: 3.5, E: 97.5, S: 3.5, N: 236.5 };   // inside face of the studs

  // generation and storage
  for (const [i, x] of [26, 76].entries()) {
    log.push(step(w, 'place', { id: `pv.${i + 1}`, kind: 'panel', layer: 'services',
      at: [x, 70, ROOF_TOP + 0.75], size: [40, 64, 1.5], material: 'polycarbonate' },
      '200 W bolted to the roof, not floating over it'));
    w.get(`pv.${i + 1}`).meta.pvWatts = 200;
    w.get(`pv.${i + 1}`).system = 'power';
  }
  // The end wall is where the bed is. Panels went there because it was a flat
  // surface, and the model then reported 100% of the standing space in front of
  // all three taken by the bed base and the mattress: a fuse box you can only
  // reach by crawling across a mattress. They move to the aisle wall between the
  // bathroom and the dinette, which is the only stretch of this trailer with
  // 36 in of clear floor in front of it.
  // 88.75 is inside the entry door, which is 72 to 108 on this wall. The three of
  // them were mounted in the doorway and the model only said so when a door was
  // cut through the skin and they lost the panel they were screwed to. They stack
  // on the first stud past the door, where the aisle in front of them is the
  // clear floor NEC asks for — in a 8'-6" trailer the circulation space is the
  // only 36 in of clear floor there is.
  put('mppt', 'controller', [WALL_FACE.W + 1.5, 112.75, 82], [3, 8, 10], {}, 'MPPT charge controller, stacked on stud.W.113');
  for (const [i, x] of [22, 40].entries()) {
    log.push(step(w, 'source', { id: `battery.${i + 1}`, system: 'power', at: [x, 226, D + 8],
      size: [13, 7, 9], layer: 'interior', hostedBy: 'bed.base' }, '100 Ah LiFePO4'));
    w.get(`battery.${i + 1}`).meta.ah = 100;
    w.get(`battery.${i + 1}`).meta.volts = 12;
  }
  put('inverter', 'inverter', [62, 226, D + 8], [12, 7, 8], { layer: 'interior', host: 'bed.base' }, '2 kW pure sine');
  put('dc.panel', 'panel', [WALL_FACE.W + 1.5, 112.75, 60], [3, 9, 7], {}, '12 V fuse block, with the aisle in front of it');
  put('ac.panel', 'panel', [WALL_FACE.W + 1.5, 112.75, 70], [3, 9, 7], {}, '120 V breakers above it');

  // loads
  // A puck screws to the underside of a rafter. It therefore lives under a rafter.
  const lightY = [16.75, 48.75, 80.75, 128.75, 176.75, 208.75];
  lightY.forEach((y, i) => {
    put(`light.${i + 1}`, 'light', [50.5, y, RAFTER_SOFFIT - 0.75], [5, 5, 1.5], { material: 'paint' },
        i ? '' : 'six DC pucks up the centre, each on a rafter');
    Object.assign(w.get(`light.${i + 1}`).meta, { watts: 3, hoursPerDay: 4 });
  });
  // A box is screwed to the side of a stud, so it sits at a stud, on the inside face.
  // 64.75 is where the bathroom partition lands. An outlet on that stud is an
  // outlet inside a wall — the world said so twice before these moved.
  [['W', 48.75], ['E', 144.75], ['W', 192.75], ['E', 160.75]].forEach(([side, y], i) => {
    const x = side === 'W' ? WALL_FACE.W + 0.75 : WALL_FACE.E - 0.75;
    put(`outlet.${i + 1}`, 'outlet', [x, y, D + 20], [1.5, 4, 4], { material: 'paint' },
        i ? '' : 'four AC outlets, each on a stud');
    Object.assign(w.get(`outlet.${i + 1}`).meta, { watts: 15, hoursPerDay: 4 });
  });
  put('fan.bath', 'fan', [80, 16.75, RAFTER_SOFFIT - 2], [10, 10, 4], { material: 'steel' }, 'extract over the shower, hung on rafter.17');
  Object.assign(w.get('fan.bath').meta, { watts: 15, hoursPerDay: 3 });
  Object.assign(w.get('fridge').meta, { watts: 45, hoursPerDay: 8 });
  Object.assign(w.get('pump').meta, { watts: 60, hoursPerDay: 0.5 });

  // Hang it before you wire it. Placing every fixture, routing to where it was,
  // and only then discovering it was never fastened means each mount pulls the
  // conductor off its own fixture. Six lights fell 85 in in the model for months
  // because nothing in this file ever asked what held them.
  log.push(step(w, 'mountAll', {}, 'hang the equipment before pulling wire to it'));

  // wiring — deliberately gauged the way it would be guessed, so the drop can answer
  const R = (run, path, dia, amps, awg, why, volts) =>
    log.push(step(w, 'route', { system: 'power', run, path, dia, amps, awg, volts: volts || 12 }, why));
  R('pv.string', [[26, 70, ROOF_TOP], [76, 70, ROOF_TOP], [76, 104.75, ROOF_TOP], [5, 104.75, ROOF_TOP], [5, 104.75, 82], [5, 112.75, 82]], 0.5, 17, '10', 'across both panels, then down through a rafter bay — dropped on the rafter line it bored 0.5 in from its edge');
  R('mppt.bank', [[5, 112.75, 82], [40, 226, D + 8]], 0.6, 30, '8', 'controller to the bank');
  R('bank.inverter', [[40, 226, D + 8], [62, 226, D + 8]], 1.0, 167, '8', 'bank to the inverter');
  R('bank.dc', [[40, 226, D + 8], [5, 112.75, 60]], 0.6, 40, '8', 'bank to the fuse block');
  R('inv.ac', [[62, 226, D + 8], [5, 112.75, 70]], 0.5, 17, '12', 'inverter to the breakers', 120);
  R('dc.lights', [[5, 112.75, 60], [50.5, 208.75, 104], [50.5, 16.75, 104]], 0.3, 1.5, '18', 'one run down the centre for the pucks');
  R('dc.fridge', [[5, 112.75, 60], [86, 120, 100], [86, 104, D + 8]], 0.3, 3.8, '14', 'fridge circuit');
  R('dc.pumpfeed', [[5, 112.75, 60], [70, 196, D + 5]], 0.3, 5, '14', 'pump circuit');
  R('dc.fan', [[5, 112.75, 60], [80, 30, 100], [80, 16.75, 104]], 0.3, 1.3, '18', 'bath extract');
  R('ac.outlets', [[5, 112.75, 70], [4.25, 192.75, D + 20], [4.25, 48.75, D + 20]], 0.3, 3, '14', 'outlet ring west, at socket height', 120);
  R('ac.outlets.e', [[5, 112.75, 70], [96.75, 160.75, D + 20], [96.75, 144.75, D + 20]], 0.3, 3, '14', 'and east', 120);
  return log;
}

/**
 * The brief, kept alive during execution. Each line is a thing that was asked for;
 * while it is unmet the world reports REQUIREMENT_FAILED and the loop answers it.
 * This is what makes the trailer get built rather than get scripted.
 */
export const BRIEF = [
  { id: 'openings', hard: true, stage: 'openings', want: 'a way in and daylight',
    met: (w) => w.all({ kind: 'opening' }).length >= 5 && w.all({ kind: 'header' }).length >= 5 },
  { id: 'rooms', hard: true, stage: 'interior', want: 'a bath, a galley, somewhere to sit and somewhere to sleep',
    met: (w) => ['wc', 'sink', 'bed.base', 'table'].every(id => w.get(id)) },
  { id: 'water', hard: true, stage: 'services', want: '65 gal of water, hot and cold, and a way out for the grey',
    met: (w) => !!w.get('tank.fresh') && !!w.get('heater') && !!w.get('grey.out') },
  { id: 'venting', hard: true, stage: 'venting', want: 'traps and vents, so the drains work and the room does not smell',
    met: (w) => w.all({ kind: 'trap' }).length >= 3 && w.all({ kind: 'vent' }).length >= 1 },
  { id: 'gas', hard: true, stage: 'propane', want: 'gas to cook and to heat the water',
    met: (w) => !!w.get('lpg.bottle') && !!w.get('flue.heater') },
  { id: 'power', hard: true, stage: 'electrical', want: 'off-grid power: array, bank, and something to run',
    met: (w) => !!w.get('mppt') && !!w.get('battery.1') && w.all().filter(e => e.meta.watts).length >= 8 },
  { id: 'fastening', hard: true, stage: 'nail', want: 'the whole of it nailed together',
    met: (w) => w.joints.size > 300 }
];

/** The stages the loop can call when a requirement is unmet. */
export const STAGES = {
  openings, interior, services, venting, propane, electrical,
  nail: (w, log) => { log.push(commit(w, 'nailOff', {}, 'REQUIREMENT_FAILED')); return log; }
};

/**
 * The whole making. Not a list of calls in a fixed order any more: a seed, a brief,
 * and a loop that reads what the world says and answers the difference that makes
 * the most difference, until nothing is asking for anything.
 */
export function build({ budget = 60 } = {}) {
  const w = shell();
  const log = [];
  const result = runLoop(w, { brief: BRIEF, stages: STAGES, budget, log });
  return { world: w, log, loop: result };
}
