// operative/checks.js — deterministic resistance.
//
// A check is not a debugger message. It is the world reporting that the last
// operation met a condition it could not absorb. Every check returns measurable
// evidence, so the difference can be described in operational language and used
// to choose the next move.
import { separation, overlapVolume, aabb, containsFully } from './poly.js';
import { referenceConditions } from './reference.js';
import { scheduleFor, required, joinKey, scheduleForPair, sortOf } from './joints.js';
import { habitat, CODE as HABIT } from './habitat.js';
import { fitMap, errands as bodyErrands } from './inhabit.js';
import { ACTIVITIES, attempt, obstacles as obstaclesOf, solve as solvePose, place as placeBody } from './everybody.js';
import { floorUnder, mountsFor, workspaceOf, intrusion, blockage, daylightOf, CLEARANCE } from './gravity.js';
import { shake } from './loads.js';
import { rain, MIN_SLOPE, MIN_OVERHANG } from './weather.js';
import { daylight, artificial, GLAZING_FRACTION, MIN_FC, TARGET_FC } from './light.js';
import { occludersOf, emittersFor, scan as raysThrough, clusters as leakClusters, around as leakAround } from './radiography.js';

export const SEVERITY = { blocking: 3, serious: 2, open: 1, note: 0 };

// --- allowable clear spans, inches. Basis: IRC-style tables, No.2 SPF, 16" o.c.
// Approximate on purpose, and labelled as such wherever it is reported.
export const SPAN_TABLE = {
  floor:  { '2x6': 117, '2x8': 151, '2x10': 185, '2x12': 214 },
  rafter: { '2x6': 156, '2x8': 198, '2x10': 242, '2x12': 281 },
  // headers are doubled members with a spacer, filling the 3.5 in wall thickness
  header: { '(2)2x6': 62, '(2)2x8': 78, '(2)2x10': 96 }
};

// --- boring / notching limits, inches. Basis: IRC R602.6 (studs, plates), R502.8 (joists).
export const BORE = {
  studBearingMaxFrac: 0.40,
  studNonBearingMaxFrac: 0.60,
  studNotchBearingMaxFrac: 0.25,
  studNotchNonBearingMaxFrac: 0.40,
  minEdgeDistance: 0.625,
  plateMaxFrac: 0.50,          // beyond this a top plate needs a steel tie
  joistMaxFrac: 1 / 3,
  joistMinEdge: 2.0
};

export const ENVELOPE = { maxHeight: 162, maxWidth: 102, note: 'road-legal towing envelope' };

// --- plumbing. Basis: IPC 909.1 — maximum developed length of a trap arm, by size.
export const VENT = { 1.25: 60, 1.5: 72, 2: 96, 3: 144 };

// --- electrical. Copper resistivity 10.4 ohm-cmil/ft; circular mils and ampacity
// by size, smallest first. Ampacity is NEC 310.16, 75 C copper.
//
// The first version of this table stopped at 1/0 and the checks only asked about
// voltage drop. A 167 A inverter feed was then "repaired" to 6 AWG — which passes
// the drop test over 1.8 ft and would melt, because 6 AWG carries about 65 A. A
// conductor has to be able to carry the current *and* deliver the voltage.
export const CONDUCTORS = [
  { awg: '18', cmil: 1620, amps: 10 }, { awg: '16', cmil: 2580, amps: 13 },
  { awg: '14', cmil: 4110, amps: 20 }, { awg: '12', cmil: 6530, amps: 25 },
  { awg: '10', cmil: 10380, amps: 35 }, { awg: '8', cmil: 16510, amps: 50 },
  { awg: '6', cmil: 26240, amps: 65 }, { awg: '4', cmil: 41740, amps: 85 },
  { awg: '2', cmil: 66360, amps: 115 }, { awg: '1/0', cmil: 105600, amps: 150 },
  { awg: '2/0', cmil: 133100, amps: 175 }, { awg: '4/0', cmil: 211600, amps: 230 }
];
export const CMIL = Object.fromEntries(CONDUCTORS.map(c => [c.awg, c.cmil]));
export const AMPACITY = Object.fromEntries(CONDUCTORS.map(c => [c.awg, c.amps]));
export const DROP_LIMIT = 0.03;          // 3% to the load is the usual off-grid target

/** Two-way voltage drop on a run, in volts. */
export function voltageDrop({ lengthFt, amps, awg, volts }) {
  const cmil = CMIL[String(awg)];
  if (!cmil || !amps || !lengthFt) return 0;
  return (2 * lengthFt * amps * 10.4) / cmil;
}

/** The smallest conductor that both carries the current and holds the drop. */
export function sizeConductor({ lengthFt, amps, volts }) {
  return CONDUCTORS.find(c =>
    c.amps >= amps &&
    voltageDrop({ lengthFt, amps, awg: c.awg, volts }) / volts <= DROP_LIMIT) || null;
}

const cond = (code, severity, message, elements, measure, repair) =>
  ({ code, severity, message, elements, measure: measure || {}, repair: repair || null });

/** Clear span of a member between the things that actually carry it. */
export function clearSpan(world, el, graph) {
  const axis = el.meta.spanAxis === 'x' ? 0 : el.meta.spanAxis === 'y' ? 1 : 2;
  // A half-inch of sheathing edge is not a bearing. Members carry members.
  const supports = (graph.under.get(el.id) || []).filter(s => s.via === 'bear' && s.area >= 2);
  if (supports.length < 2) return null;
  const centers = supports.map(s => {
    const b = aabb(world.get(s.id).poly());
    return (b.lo[axis] + b.hi[axis]) / 2;
  }).sort((a, b) => a - b);
  let worst = 0;
  for (let i = 1; i < centers.length; i++) worst = Math.max(worst, centers[i] - centers[i - 1]);
  return { span: worst, supports: supports.map(s => s.id), axis: 'xyz'[axis] };
}

export function checkAll(world) {
  const out = [];
  const graph = world.grounded();
  const solids = world.solids();
  const polys = new Map(solids.map(e => [e.id, e.poly()]));

  // 1. solids may not occupy the same space
  for (let i = 0; i < solids.length; i++) {
    for (let j = i + 1; j < solids.length; j++) {
      const a = solids[i], b = solids[j];
      const allows = (x, y) => {
        const v = x.meta.allowOverlap;
        return Array.isArray(v) ? v.includes(y.id) : v === y.id;
      };
      if (allows(a, b) || allows(b, a)) continue;
      const sep = separation(polys.get(a.id), polys.get(b.id), 0.06);
      if (!sep) continue;
      // A cabinet is a carcass with a void in it. A sink dropped into that void is
      // housed, not in collision — but a sink that only half fits is a real problem,
      // so partial entry is reported rather than waved through.
      const host = a.meta.hollow ? a : (b.meta.hollow ? b : null);
      const guest = host === a ? b : (host === b ? a : null);
      if (host && guest && guest.meta.hostedBy === host.id) {
        if (containsFully(polys.get(host.id), polys.get(guest.id))) continue;
        out.push(cond('PROTRUDES', SEVERITY.serious,
          `${guest.id} does not fit inside ${host.id} — part of it is outside the carcass`,
          [guest.id, host.id], { depth: +sep.depth.toFixed(2) }, null));
        continue;
      }
      // Flashing is sheet metal, not a solid. An apron goes under the roofing on
      // the upslope side and under whatever is bolted through it, which is the
      // entire point of an apron; reported as interpenetration, every flashing
      // the loop installed immediately opened an overlap and was walked back.
      if (a.kind === 'flashing' || b.kind === 'flashing') continue;
      // Tape is the same argument and it earns the same exemption, but narrowly:
      // only against the members it was created to seal, which it records. A
      // membrane laps by definition — that is the whole of what it is — and the
      // alternative was oscillating between two boundary conditions, because tape
      // sitting proud takes this trailer to 102.01 in and breaks the towing
      // envelope while tape sitting flush interpenetrates by exactly the 0.06 in
      // this check tolerates and trips it on the last bit of the float.
      const seals = (x, y) => x.kind === 'tape' && Array.isArray(x.meta.seals) && x.meta.seals.includes(y.id);
      if (seals(a, b) || seals(b, a)) continue;
      const vol = overlapVolume(polys.get(a.id), polys.get(b.id));
      if (vol < 0.5) continue;
      out.push(cond('OVERLAP', SEVERITY.blocking,
        `${a.id} and ${b.id} occupy the same ${sep.depth.toFixed(2)} in of space`,
        [a.id, b.id], { depth: +sep.depth.toFixed(3), volume: +vol.toFixed(1) },
        // deliberately no proposed repair: sliding one of two colliding members by
        // the penetration depth is almost never the move, and a confident wrong
        // proposal is worse than none.
        null));
    }
  }

  // 2. every solid needs a load path to the ground — services included.
  //
  // This check used to skip `layer === 'services'`, on the reasoning that
  // equipment is strapped to framing rather than stacked. That exempted exactly
  // the things that were floating: six ceiling lights 85 in up, two distribution
  // panels, a charge controller, four outlets — 23 solids held by nothing, and
  // the world never said a word, because it had been told not to look.
  //
  // A light is not stacked. It is screwed to a rafter. That is a joint, and the
  // answer is to mount it, not to excuse it.
  for (const e of solids) {
    if (graph.seen.has(e.id)) continue;
    const fall = +(e.lo[2] - floorUnder(world, e, solids)).toFixed(1);
    const near = mountsFor(world, e);
    out.push(cond('FLOATING', SEVERITY.blocking,
      `${e.id} is held by nothing; switch gravity on and it falls ${fall} in`,
      [e.id], { fall, z: +e.lo[2].toFixed(2),
                within: near.slice(0, 3).map(m => `${m.id} at ${m.gap} in`) },
      near.length ? { op: 'mount', args: { id: e.id, to: near[0].id } }
                  : { op: 'blocking', args: { id: e.id } }));
  }

  // 3. spans
  for (const e of solids) {
    const table = e.kind === 'joist' ? SPAN_TABLE.floor
      : e.kind === 'rafter' ? SPAN_TABLE.rafter
      : e.kind === 'header' ? SPAN_TABLE.header : null;
    if (!table || !e.section) continue;
    const allow = table[e.section];
    if (!allow) continue;
    const cs = clearSpan(world, e, graph);
    if (!cs) {
      const bear = (graph.under.get(e.id) || []).filter(s2 => s2.via === 'bear' && s2.area >= 2);
      if (bear.length === 1) {
        out.push(cond('ONE_END_BEARING', SEVERITY.blocking,
          `${e.id} bears at one end only (on ${bear[0].id}); the other end is in the air`,
          [e.id, bear[0].id], { bearings: 1, required: 2 },
          { op: 'pitch', args: {} }));
      }
      continue;
    }
    if (cs.span > allow + 0.5) {
      out.push(cond('SPAN_EXCEEDED', SEVERITY.serious,
        `${e.id} (${e.section}) spans ${cs.span.toFixed(1)} in; allowable is about ${allow} in`,
        [e.id], { span: +cs.span.toFixed(1), allowable: allow, over: +(cs.span - allow).toFixed(1), basis: 'IRC-style table, approximate' },
        { op: 'upsize', args: { id: e.id } }));
    }
  }

  // 4. an opening that cut studs needs a header, and the header needs jacks
  for (const op of world.all({ kind: 'opening' })) {
    const cut = op.meta.cutStuds || [];
    // An opening cannot be taller than the wall it is cut in. On this trailer the
    // stud wall is 57.5 in, so a standard 80 in door head lands above the plate.
    const wall = world.walls ? world.walls[op.meta.wall] : null;
    const plate = wall ? wall.topPlateBot : (world.datum ? world.datum.topPlateBot : Infinity);
    // An opening needs room for its head *and* for the header that carries it.
    // Reported without the header allowance, the first raise was always 4-6 in
    // short and the header refused a second time.
    const span = op.meta.to - op.meta.from;
    const sec = Object.entries(SPAN_TABLE.header).filter(([, a]) => a >= span).sort((a, b) => a[1] - b[1])[0];
    const headerDepth = sec ? { '(2)2x6': 5.5, '(2)2x8': 7.25, '(2)2x10': 9.25 }[sec[0]] : 9.25;
    const needTop = op.meta.head + (cut.length ? headerDepth : 0);
    if (needTop > plate + 0.01) {
      const over = needTop - plate;
      out.push(cond('OPENING_ABOVE_PLATE', SEVERITY.blocking,
        `${op.id} needs ${needTop.toFixed(1)} in (head plus a ${sec ? sec[0] : 'deep'} header) but wall ${op.meta.wall}'s plate is at ${plate.toFixed(1)} in — ${over.toFixed(1)} in short`,
        [op.id], { head: +op.meta.head.toFixed(1), headerDepth, topPlate: +plate.toFixed(1), over: +over.toFixed(1), wallStud: +(plate - world.datum.soleTop).toFixed(1) },
        // all four walls, not just this one: the shed roof bears on W and E and the
        // end walls have to come with it. Raising the single wall drove its studs
        // straight through the roof and opened thirteen conflicts.
        { op: 'raise', args: { by: Math.ceil(over) } }));
    }
    const header = solids.find(e => e.kind === 'header' && e.meta.opening === op.id);
    if (cut.length && !header) {
      out.push(cond('OPENING_UNHEADED', SEVERITY.blocking,
        `${op.id} interrupted ${cut.length} stud${cut.length > 1 ? 's' : ''} with nothing carrying the load over it`,
        [op.id, ...cut], { studsCut: cut.length, width: +op.box.s[op.meta.axis === 'y' ? 1 : 0].toFixed(1) },
        { op: 'header', args: { opening: op.id } }));
      continue;
    }
    if (!header) continue;
    const jacks = solids.filter(e => e.kind === 'jack' && e.meta.opening === op.id);
    if (jacks.length < 2) {
      out.push(cond('NO_BEARING', SEVERITY.blocking,
        `${header.id} has ${jacks.length} jack stud${jacks.length === 1 ? '' : 's'}; a header bears at both ends`,
        [header.id, op.id], { jacks: jacks.length, required: 2 },
        { op: 'header', args: { opening: op.id } }));
    }
  }

  // 5. penetrations: what a service run did to the member it went through
  for (const e of solids) {
    for (const pen of e.meta.penetrations || []) {
      const depth = pen.memberDepth;
      const bearing = e.meta.bearing !== false;
      if (e.kind === 'stud') {
        const frac = pen.dia / depth;
        const limit = bearing ? BORE.studBearingMaxFrac : BORE.studNonBearingMaxFrac;
        if (pen.kind === 'bore' && frac > limit + 1e-6) {
          out.push(cond('BORE_OVERSIZE', SEVERITY.serious,
            `${pen.dia.toFixed(2)} in bore in ${e.id} is ${(frac * 100).toFixed(0)}% of a ${depth} in ${bearing ? 'bearing' : 'non-bearing'} stud; limit is ${(limit * 100).toFixed(0)}%`,
            [e.id, pen.run], { dia: pen.dia, depth, fraction: +frac.toFixed(3), limit, basis: 'IRC R602.6' },
            { op: 'reroute', args: { run: pen.run } }));
        }
        if (pen.edge !== undefined && pen.edge < BORE.minEdgeDistance - 1e-6) {
          out.push(cond('EDGE_CLEARANCE', SEVERITY.serious,
            `bore in ${e.id} leaves ${pen.edge.toFixed(2)} in of stud edge; ${BORE.minEdgeDistance} in is the minimum`,
            [e.id, pen.run], { edge: +pen.edge.toFixed(3), minimum: BORE.minEdgeDistance, basis: 'IRC R602.6' },
            { op: 'reroute', args: { run: pen.run } }));
        }
      } else if (e.kind === 'plate') {
        const frac = pen.dia / depth;
        if (frac > BORE.plateMaxFrac + 1e-6 && !e.meta.tied) {
          out.push(cond('PLATE_TIE_REQUIRED', SEVERITY.open,
            `${pen.dia.toFixed(2)} in bore removes ${(frac * 100).toFixed(0)}% of ${e.id}; a plate cut past ${(BORE.plateMaxFrac * 100)}% needs a steel tie`,
            [e.id, pen.run], { dia: pen.dia, depth, fraction: +frac.toFixed(3), basis: 'IRC R602.6.1' },
            { op: 'strap', args: { id: e.id } }));
        }
      } else if (e.kind === 'joist' || e.kind === 'rafter') {
        const frac = pen.dia / depth;
        if (frac > BORE.joistMaxFrac + 1e-6) {
          out.push(cond('BORE_OVERSIZE', SEVERITY.serious,
            `${pen.dia.toFixed(2)} in bore in ${e.id} exceeds one third of its ${depth} in depth`,
            [e.id, pen.run], { dia: pen.dia, depth, fraction: +frac.toFixed(3), basis: 'IRC R502.8' },
            { op: 'reroute', args: { run: pen.run } }));
        }
        if (pen.edge !== undefined && pen.edge < BORE.joistMinEdge - 1e-6) {
          out.push(cond('EDGE_CLEARANCE', SEVERITY.serious,
            `bore in ${e.id} sits ${pen.edge.toFixed(2)} in from the edge; joists need ${BORE.joistMinEdge} in`,
            [e.id, pen.run], { edge: +pen.edge.toFixed(2), minimum: BORE.joistMinEdge, basis: 'IRC R502.8' },
            { op: 'reroute', args: { run: pen.run } }));
        }
      }
    }
  }

  // 6. building services must actually reach a source
  for (const sys of ['power', 'water']) {
    const reach = systemReach(world, sys);
    for (const f of world.all({ kind: 'fixture', system: sys })) {
      if (!reach.connected.has(f.id)) {
        out.push(cond('SERVICE_ORPHAN', SEVERITY.serious,
          `${f.id} is not connected to any ${sys} source`, [f.id],
          { system: sys, nearestGap: +reach.gapFor(f).toFixed(1) },
          { op: 'route', args: { system: sys, to: f.id } }));
      }
    }
    for (const r of world.all({ kind: 'run', system: sys })) {
      if (!reach.connected.has(r.id)) {
        out.push(cond('SERVICE_ORPHAN', SEVERITY.open,
          `${r.id} is a dead ${sys} run: nothing upstream of it`, [r.id], { system: sys }, null));
      }
    }
  }

  // 7. towing envelope
  const b = aabb({ c: [0, 0, 0], a: [0, 0, 0], b: [0, 0, 0], c3: [0, 0, 0] });
  let hiZ = -Infinity, loX = Infinity, hiX = -Infinity;
  for (const e of solids) { const bb = aabb(polys.get(e.id)); hiZ = Math.max(hiZ, bb.hi[2]); loX = Math.min(loX, bb.lo[0]); hiX = Math.max(hiX, bb.hi[0]); }
  if (hiZ > ENVELOPE.maxHeight) out.push(cond('ENVELOPE', SEVERITY.serious,
    `overall height ${hiZ.toFixed(1)} in exceeds the ${ENVELOPE.maxHeight} in towing envelope`, [], { height: +hiZ.toFixed(1), limit: ENVELOPE.maxHeight }, null));
  if (hiX - loX > ENVELOPE.maxWidth) out.push(cond('ENVELOPE', SEVERITY.serious,
    `overall width ${(hiX - loX).toFixed(1)} in exceeds the ${ENVELOPE.maxWidth} in towing envelope`, [], { width: +(hiX - loX).toFixed(1), limit: ENVELOPE.maxWidth }, null));

  // 7b. every drain fixture needs a trap, and every trap needs a vent it can reach
  for (const f of world.all({ kind: 'fixture' }).filter(e => e.system === 'waste')) {
    const trap = world.all({ kind: 'trap' }).find(t => t.meta.serves === f.id);
    if (!trap) {
      out.push(cond('NO_TRAP', SEVERITY.serious,
        `${f.id} drains straight to the line with no trap — sewer gas has a clear path into the room`,
        [f.id], { basis: 'IPC 1002.1' }, { op: 'trap', args: { fixture: f.id } }));
      continue;
    }
    const vents = world.all({ kind: 'vent' });
    const limit = VENT[trap.meta.size] || 72;
    let best = Infinity, nearest = null;
    for (const v of vents) {
      const d = Math.hypot(...v.box.p.map((c, i) => c - trap.box.p[i]));
      if (d < best) { best = d; nearest = v.id; }
    }
    if (best > limit) {
      // where it should go, not just that it is missing: the nearest wall cavity
      // inside the trap-arm limit. Proposed without one, the stack rose straight
      // out of the trap and through the shower pan and the floor.
      let spot = null, spotD = Infinity;
      for (const wl of Object.values(world.walls || {})) {
        const at = wl.axis === 'y' ? [wl.at, trap.box.p[1]] : [trap.box.p[0], wl.at];
        const d = Math.hypot(at[0] - trap.box.p[0], at[1] - trap.box.p[1]);
        if (d < spotD && d <= limit) { spotD = d; spot = at; }
      }
      out.push(cond('UNVENTED_TRAP', SEVERITY.serious,
        `${trap.id} is ${best === Infinity ? 'unvented' : best.toFixed(0) + ' in'} from the nearest vent; a ${trap.meta.size} in trap arm may run ${limit} in`,
        [trap.id, f.id], { developedLength: best === Infinity ? null : +best.toFixed(1), limit, size: trap.meta.size, nearest,
                           proposedAt: spot, armLength: spot ? +spotD.toFixed(1) : null, basis: 'IPC 909.1' },
        spot ? { op: 'vent', args: { near: trap.id, at: spot, size: trap.meta.size } } : null));
    }
  }

  // 7c. a circuit has to deliver its load at the far end, not just reach it
  for (const [runId, rec] of Object.entries(world.runs || {})) {
    if (rec.system !== 'power' || !rec.amps) continue;
    const segs = world.all({ kind: 'run' }).filter(r => r.meta.run === runId);
    if (!segs.length) continue;
    const lengthIn = segs.reduce((a, r) => a + Math.hypot(...r.meta.to.map((v, i) => v - r.meta.from[i])), 0);
    const ft = lengthIn / 12;
    const drop = voltageDrop({ lengthFt: ft, amps: rec.amps, awg: rec.awg, volts: rec.volts });
    const pct = drop / (rec.volts || 12);
    const carries = AMPACITY[String(rec.awg)] || 0;
    const want = sizeConductor({ lengthFt: ft, amps: rec.amps, volts: rec.volts });
    if (carries < rec.amps) {
      out.push(cond('UNDERSIZED_CONDUCTOR', SEVERITY.blocking,
        `${runId} carries ${rec.amps} A on ${rec.awg} AWG, which is rated ${carries} A`,
        [segs[0].id], { amps: rec.amps, awg: rec.awg, ampacity: carries, suggest: want && want.awg, basis: 'NEC 310.16' },
        want ? { op: 'regauge', args: { run: runId, awg: want.awg } } : null));
    } else if (pct > DROP_LIMIT) {
      out.push(cond('VOLTAGE_DROP', SEVERITY.serious,
        `${runId}: ${rec.amps} A over ${ft.toFixed(1)} ft of ${rec.awg} AWG drops ${drop.toFixed(2)} V (${(pct * 100).toFixed(1)}% of ${rec.volts} V); 3% is the limit`,
        [segs[0].id], { drop: +drop.toFixed(2), percent: +(pct * 100).toFixed(1), awg: rec.awg, amps: rec.amps, lengthFt: +ft.toFixed(1), suggest: want && want.awg },
        want ? { op: 'regauge', args: { run: runId, awg: want.awg } } : null));
    }
  }

  // 7d. off-grid: the bank and the array have to carry the day's load
  const loads = world.all().filter(e => e.meta.watts && e.meta.hoursPerDay);
  if (loads.length) {
    const wh = loads.reduce((a, e) => a + e.meta.watts * e.meta.hoursPerDay, 0);
    const bank = world.all().filter(e => e.meta.ah).reduce((a, e) => a + e.meta.ah * (e.meta.volts || 12), 0);
    const usable = bank * 0.8;                                  // LiFePO4 to 80% depth
    const pv = world.all().filter(e => e.meta.pvWatts).reduce((a, e) => a + e.meta.pvWatts, 0) * 4 * 0.75;
    if (wh > usable || wh > pv) {
      out.push(cond('POWER_BUDGET', SEVERITY.open,
        `the day needs ${wh.toFixed(0)} Wh; the bank gives ${usable.toFixed(0)} Wh usable and the array makes about ${pv.toFixed(0)} Wh` ,
        [], { dailyWh: +wh.toFixed(0), usableWh: +usable.toFixed(0), pvWhPerDay: +pv.toFixed(0),
              shortfall: +(wh - Math.min(usable, pv)).toFixed(0),
              loads: loads.map(e => `${e.id} ${e.meta.watts}W x ${e.meta.hoursPerDay}h`) }, null));
    }
  }

  // 7d-bis. things you have to reach need somewhere to stand.
  //
  // "we have hanging shelves that cover things". A model that only asks whether
  // parts collide will never say this: the bed is not touching the fuse panel,
  // it is parked in front of it, and every geometric check passes while the panel
  // is unreachable. NEC 110.26(A) is 30 in wide, 36 in deep and 78 in high of
  // clear floor, and a trailer is exactly where that gets built over.
  for (const e of world.all()) {
    const space = workspaceOf(world, e);
    if (!space) continue;
    // Equipment inside a hollow carcass is reached by opening the carcass. A
    // battery box under a bed platform with a lift-up lid is serviceable; the
    // rule is about standing room, and you do not stand inside the box.
    if (e.meta.hostedBy) {
      const host = world.get(e.meta.hostedBy);
      if (host && host.meta.hollow) continue;
    }
    const b = blockage(world, space, new Set([e.id]));
    if (b.fraction <= 0.25) continue;
    out.push(cond('ACCESS_BLOCKED', SEVERITY.serious,
      `${(b.fraction * 100).toFixed(0)}% of the space you have to stand in to reach ${e.id} is taken by ` +
      `${b.by.slice(0, 2).map(x => x.id).join(' and ')}; ${space.rule.why}`,
      [e.id, ...b.by.slice(0, 2).map(x => x.id)],
      { fraction: b.fraction, needs: `${space.rule.width} x ${space.rule.depth} x ${space.rule.height} in`,
        by: b.by.slice(0, 4), basis: space.rule.basis },
      null));
  }

  // 7d-ter. the road, and the weather.
  //
  // 436 fasteners existed for a while before anything ever *loaded* one. A
  // schedule you never check is a schedule you are trusting, which is the same
  // mistake as the support check that skipped services. A house is shaken by wind
  // once in its life; a trailer is shaken every mile.
  for (const f of shake(world, undefined, graph).failures) {
    out.push(cond('SHAKE_FAILURE', SEVERITY.serious,
      `${f.id} carries ${f.carries} lb; in a ${f.label} that is ${f.demand} lb against ` +
      `${f.capacity === 0 ? 'nothing holding it down' : `${f.capacity} lb of fastener`} (${f.ratio}x)`,
      [f.id, ...f.sample], { carries: f.carries, demand: f.demand, capacity: f.capacity,
        ratio: f.ratio, case: f.case, joints: f.joints, basis: f.basis },
      { op: f.joints ? 'refasten' : 'nailOff', args: f.joints ? { id: f.id } : {} }));
  }

  // Rain is the cheapest physics there is: it falls, it runs downhill, and every
  // place it stops or gets in is somewhere the building fails slowly instead of
  // all at once. This roof was dead flat for the whole life of the project and no
  // check ever mentioned it, because no check was ever about water.
  const wet = rain(world);
  if (wet.drip && wet.drip.slope < MIN_SLOPE - 1e-6) {
    out.push(cond('PONDING', SEVERITY.serious,
      `${wet.drip.roof} falls ${wet.drip.slope.toFixed(2)} in per foot; below ${MIN_SLOPE} the water sits on it`,
      [wet.drip.roof], { slope: wet.drip.slope, minimum: MIN_SLOPE, basis: 'IRC R905.10.1' },
      // A shed roof's pitch is not a free parameter — it is whatever the two
      // bearing walls make it. On walls of equal height `pitch` reseats the roof
      // dead flat and reports success, so proposing it alone put the loop in a
      // circle: pitch, still ponding, pitch, still ponding. To tilt the roof you
      // raise a wall, and then you reseat it.
      { op: 'raise', args: { wall: 'E', by: 6 },
        chain: [{ op: 'raise', args: { wall: 'E', by: 6 } }, { op: 'pitch', args: {} }] }));
  }
  if (wet.drip && typeof wet.drip.overhang === 'number' && wet.drip.overhang < MIN_OVERHANG &&
      !world.all({ kind: 'flashing' }).some(f => f.meta.role === 'drip edge')) {
    out.push(cond('NO_DRIP_EDGE', SEVERITY.open,
      `the roof projects ${wet.drip.overhang.toFixed(2)} in past ${wet.drip.over || 'the wall'}; ` +
      `everything that lands on it runs down the cladding`,
      [wet.drip.roof, wet.drip.over].filter(Boolean),
      { overhang: wet.drip.overhang, minimum: MIN_OVERHANG, basis: 'IRC R905.2.8.5' }, null));
  }
  for (const p of wet.penetrations) {
    if (p.flashed) continue;
    out.push(cond('UNFLASHED', SEVERITY.serious,
      `${p.id} comes through ${p.through} with no flashing; that is a hole in the only surface keeping water out`,
      [p.id, p.through], { through: p.through, basis: 'IRC R903.2' },
      { op: 'flash', args: { id: p.id, through: p.through } }));
  }

  // 7d-quater. can you see in here?
  //
  // Six pucks and five headed openings, and until there was a check about light
  // nothing in the model knew whether any of it reached the floor. The power
  // budget had passed all along, because 18 W is easy on a battery — the
  // electrical system had been optimised against a constraint that rewarded
  // being dim.
  const day = daylight(world);
  if (day && day.floorArea > 20) {
    if (day.glazingFraction < GLAZING_FRACTION - 1e-6) {
      out.push(cond('NO_DAYLIGHT', SEVERITY.serious,
        `${day.glazingArea} sq ft of glazing for ${day.floorArea} sq ft of floor is ` +
        `${(day.glazingFraction * 100).toFixed(1)}%; habitable space wants ${GLAZING_FRACTION * 100}%`,
        [], { glazing: day.glazingArea, floor: day.floorArea, needs: day.needs,
              fraction: day.glazingFraction, basis: 'IRC R303.1' }, null));
    }
    if (day.dark > day.points * 0.25) {
      out.push(cond('NO_VIEW_OUT', SEVERITY.open,
        `${day.dark} of ${day.points} floor samples cannot see a window from where a person sits`,
        [], { dark: day.dark, points: day.points, at: day.darkest }, null));
    }
  }
  const night = artificial(world);
  if (night && night.lamps && night.average < MIN_FC - 1e-6) {
    out.push(cond('UNLIT', SEVERITY.serious,
      `${night.lamps} lamps totalling ${night.watts} W average ${night.average} foot-candles; ` +
      `${MIN_FC} is the floor and ${night.target} is habitable — it wants about ${night.wattsNeeded} W`,
      night.darkest.length ? [] : [], { watts: night.watts, average: night.average,
        target: night.target, needs: night.wattsNeeded, darkest: night.darkest.slice(0, 3),
        basis: 'lumen method, CU 0.5, LLF 0.9' },
      { op: 'relamp', args: {} }));
  }

  // 7d-quinquies. fill it with light and see where the light gets out.
  //
  // Every check above had to know what it was looking for. This one asks nothing:
  // a ray does not need to know what a wall is, only to not hit one. Anywhere a
  // ray escapes that is not a window is a hole, whether or not anyone ever wrote
  // a rule about that kind of hole.
  //
  // Coarse on purpose — it runs on every commit, so it is a thirty-millisecond
  // sweep rather than the half-second survey `tools/scan.mjs` does. It finds the
  // shape of a leak; the survey measures it.
  if (world.all({ kind: 'sheathing' }).length > 2) {
    // Tuned by removing a wall panel and checking that it comes back. At step 40
    // with 96 rays a missing 101 x 34 in panel produced twenty-two escapes spread
    // over sixteen one-ray clusters, every one of them under the threshold — the
    // check ran, cost time, and reported nothing. A blind check is worse than no
    // check, because it looks like a clean bill of health.
    const beam = raysThrough(occludersOf(world), emittersFor(world, { step: 32 }), { rays: 128 });
    for (const c of leakClusters(beam.escapes, 12)) {
      if (c.n < 3) continue;                            // one or two rays is not yet a finding
      const near = leakAround(world, c.at, 8);
      out.push(cond('LEAK', SEVERITY.serious,
        `${c.n} rays got out at ${c.at.join(', ')} on the ${c.face} face — ` +
        `a ${c.extent.filter(e => e > 0).map(e => e.toFixed(0)).join(' x ')} in hole ` +
        `between ${near.slice(0, 2).map(n => n.id).join(' and ')}`,
        near.slice(0, 3).map(n => n.id),
        { rays: c.n, at: c.at, face: c.face, extent: c.extent,
          of: beam.cast, viaOpenings: beam.viaOpening.length,
          bounded: near.map(n => `${n.id} ${n.d.toFixed(1)} in`),
          // The instrument's own specification, carried with the finding: this
          // sweep sees a missing wall panel and does not see two missing blocks
          // in a thirty-foot eave. `node tools/scan.mjs` sees both.
          resolution: 'coarse sweep: finds a missing panel, misses a missing block' },
        near.length >= 2 && near[0].d < 1 && near[1].d < 1
          ? { op: 'tape', args: { a: near[0].id, b: near[1].id } } : null));
    }
  }

  // 7e. what is touching is not joined until it is nailed
  //
  // Face contact, not the load path. This walked `graph.under` and so could only
  // ever report the joints `nailOff` could make — and nailOff walked the same
  // graph. One assumption shared by the op and its own check, which is why a
  // finished trailer with an unfastened hitch coupler reported zero conditions.
  // A colony of ants, which walks contact rather than support, found it.
  const unjoined = [];
  const edgeOnly = [];
  for (const c of world.contacts({ minFace: 0 })) {
    if (world.joints.has(joinKey(c.a, c.b))) continue;
    const A = world.get(c.a), B = world.get(c.b);
    if (!A || !B) continue;
    const rule = scheduleForPair(A, B);
    if (!rule) continue;
    // Two members meeting along a line have no face to put a fastener through.
    // That is not a missing nail — nailing it would assert a connection that
    // cannot exist — but it is not automatically a defect either.
    if (c.face < 1) edgeOnly.push({ a: c.a, b: c.b, rule });
    else unjoined.push({ a: c.a, b: c.b, rule });
  }
  // A member abutting another is only a problem if it is not tied to it *somehow*.
  // Reported flat, this fired on 49 pairs and 32 of them were fine: the panel
  // beside a door abuts the sole plate along a line, and the strip below the door
  // laps the plate and is nailed to both, so the shear path exists. Two hops of
  // asserted joints, and what survives is the real thing — the gable sheathing,
  // which sits on the top plate and is tied to nothing but the roof above it.
  const unlapped = edgeOnly.filter(u => !linkedWithin(world, u.a, u.b, 2));
  if (unlapped.length) {
    const sample = unlapped.slice(0, 3).map(u => `${u.a}/${u.b}`).join(', ');
    out.push(cond('UNLAPPED', SEVERITY.serious,
      `${unlapped.length} pair${unlapped.length === 1 ? '' : 's'} the schedule says to fasten meet edge to edge ` +
      `with no face to nail and no joint within two hops (${sample}${unlapped.length > 3 ? ', …' : ''})`,
      unlapped.slice(0, 8).flatMap(u => [u.a, u.b]),
      { count: unlapped.length, abutting: edgeOnly.length,
        basis: 'IRC R602.3.2 — top plate laps; R602.10 — sheathing transfers shear to the plate it bears on',
        // The instrument's own specification, carried with the finding.
        resolution: 'says a pair is tied together somewhere within two joints; it does not say the tie is adequate, ' +
                    'and it cannot tell a member that should have lapped from one that is meant to abut' },
      null));
  }
  if (unjoined.length) {
    const sample = unjoined.slice(0, 3).map(u => `${u.a}/${u.b}`).join(', ');
    out.push(cond('UNJOINED', SEVERITY.blocking,
      `${unjoined.length} contact${unjoined.length === 1 ? ' is' : 's are'} touching but not nailed (${sample}${unjoined.length > 3 ? ', …' : ''})`,
      unjoined.slice(0, 8).flatMap(u => [u.a, u.b]),
      { count: unjoined.length, basis: 'IRC R602.3(1)' },
      { op: 'nailOff', args: {} }));
  }
  // and a joint below its schedule is not a joint either
  for (const j of world.joints.values()) {
    if (j.count >= j.required) continue;
    out.push(cond('UNDER_NAILED', SEVERITY.serious,
      `${j.a} to ${j.b}: ${j.count} ${j.size} where the schedule wants ${j.required} (${j.schedule})`,
      [j.a, j.b], { has: j.count, wants: j.required, size: j.size, basis: 'IRC R602.3(1)' },
      { op: 'join', args: { a: j.a, b: j.b, count: j.required } }));
  }

  // 7f. can a person use it
  //
  // Thirty condition codes before this one and not a single one was about a body.
  // The model would tell you a conductor was undersized and a plate bored past
  // half its depth, and had no opinion at all about whether you could get to the
  // bed. You could not: the dinette runs the full width of the trailer — bench,
  // table, bench, wheel well to wheel well — leaving two four-inch slots, and
  // everything aft of it is unreachable from the door.
  {
    // Only once it claims to be a building. A frame with no openings cut in it has
    // no egress and no headroom by these measures, and saying so is true and
    // useless — it is not a failed dwelling, it is an unfinished one. Asked of a
    // bare seed frame this reported NO_EGRESS and LOW_HEADROOM at severity 3 and
    // buried four structural tests in habitability noise.
    const claimsToBeARoom = world.all({ kind: 'opening' }).length > 0;
    const h = claimsToBeARoom ? habitat(world) : null;
    if (h && h.headroom.floor > 20) {
      const short = h.headroom.floor - h.headroom.coach;
      if (short > 8) out.push(cond('LOW_HEADROOM', SEVERITY.serious,
        `${short.toFixed(0)} of ${h.headroom.floor.toFixed(0)} sq ft has less than ${HABIT.headroom.coach} in of headroom`,
        [], { over84: h.headroom.habitable, over78: h.headroom.coach, floor: h.headroom.floor,
              basis: HABIT.headroom.basis }, null));
      for (const p of h.paths) {
        if (p.bottleneck === null) out.push(cond('UNREACHABLE', SEVERITY.blocking,
          `${p.id} cannot be reached from the door at all`, [p.id],
          { basis: HABIT.aisle.basis }, null));
        else if (p.bottleneck < HABIT.aisle.min) out.push(cond('AISLE_TOO_NARROW', SEVERITY.blocking,
          `the best route from the door to ${p.id} narrows to ${p.bottleneck} in; ${HABIT.aisle.min} in is the minimum`,
          [p.id], { bottleneck: p.bottleneck, wants: HABIT.aisle.min, basis: HABIT.aisle.basis,
                    resolution: 'the widest available route at torso height, on a 2 in grid' }, null));
      }
      for (const c of h.clearances) if (!c.ok) out.push(cond('NO_CLEARANCE', SEVERITY.serious,
        `${c.clear} in of floor in front of ${c.id}; ${c.need} in is the minimum`,
        [c.id], { clear: c.clear, wants: c.need, basis: c.basis }, null));
      // A body moving through it, not a body posed in it. Standing room is not the
      // question a plan has to answer — turning round is, and so is whether the
      // errand can be done at all once you get there.
      const fm = fitMap(world);
      const cannotTurn = +(fm.area.STAND - fm.area.TURN).toFixed(1);
      if (fm.area.TURN < fm.area.STAND * 0.55 && cannotTurn > 6) out.push(cond('CANNOT_TURN', SEVERITY.serious,
        `${cannotTurn} of ${fm.area.STAND} sq ft you can stand in, you cannot turn round in`,
        [], { stand: fm.area.STAND, turn: fm.area.TURN,
              basis: 'shoulder breadth swept as a circle; NFPA 1192 4.5 for the aisle it implies',
              resolution: 'a 2 in grid, and a body that turns to suit the corridor' }, null));
      for (const e of bodyErrands(world).errands) {
        if (e.ok) continue;
        // A trailer with no sink in it yet cannot be blamed for your not being able
        // to wash up. That the fixture is missing is the brief's business; this
        // check is about whether a body can use the ones that are there.
        if (!world.get(e.at)) continue;
        out.push(cond('CANNOT_DO_IT', SEVERITY.blocking,
          `you cannot ${e.id}: ${e.why}`, [e.at],
          { errand: e.id, at: e.at, posture: e.posture, room: e.room,
            basis: 'the body has to get there, fit there, and reach it' }, null));
      }
      if (!h.egress.ok) out.push(cond('NO_EGRESS', SEVERITY.blocking,
        h.egress.door && h.egress.door.ok
          ? 'no window big enough or low enough to climb out of'
          : 'no exit door of the required size',
        [], { door: h.egress.door, basis: HABIT.egressWindow.basis }, null));
    }
  }

  // 8. the fabric, and whether a person can get at any of it
  //
  // These four are the plain questions that a decade of clever instruments never
  // asked, because each of them measures a *body meeting a thing* and all four
  // faults are about the thing on its own.
  // These four are about a *finished* building, and firing them on anything else is
  // over-claiming. A bare frame with ten joists and no heater in it is not a heated
  // envelope with nothing in its cavities — it is a frame, and saying "nothing in
  // the floor" of a thing that has no floor yet is the check being wrong rather
  // than the building. The gate is the same one the habitability block already
  // uses: is there a room in here at all.
  const finished = world.all({ kind: 'opening' }).length > 0 &&
    world.all().some(e => e.layer === 'interior');
  const heated = finished && world.all().some(e =>
    ['heater', 'stove', 'furnace'].includes(e.meta.role) || e.meta.system === 'propane');

  const bare = finished ? bareRuns(world) : { bare: 0, length: 0, worst: [] };
  if (bare.bare > 12) out.push(cond('BARE_RUN', SEVERITY.serious,
    `${bare.bare} in of the ${bare.length} in of pipe and cable in this trailer runs through open room air` +
    (bare.worst.length ? ` — worst ${bare.worst[0].id}, ${bare.worst[0].exposed} in of it` : ''),
    bare.worst.slice(0, 6).map(w => w.id),
    { bare: bare.bare, of: bare.length, worst: bare.worst.slice(0, 8),
      basis: 'a run belongs in a joist bay, a stud bay, over the ceiling, or in a carcass',
      resolution: 'sampled every 2 in along each segment' }, null));

  const ins = heated ? insulation(world) : { parts: [] };
  for (const p of ins.parts) {
    if (!p.members || p.filled) continue;
    out.push(cond('UNINSULATED', SEVERITY.serious,
      `nothing in the ${p.id}: ${p.members} members and no insulation between any of them — ${p.why}`,
      [], { part: p.id, members: p.members, basis: 'a heated envelope has something in its cavities' }, null));
  }

  for (const a of (finished ? apertures(world) : [])) {
    if (a.open) continue;
    out.push(cond('NO_APERTURE', SEVERITY.blocking,
      `${a.id} is a ${a.kind} you use from above and ${a.lidded} covers ${a.covered}% of it — there is no hole cut`,
      [a.id, a.lidded], { covered: a.covered, over: a.lidded,
        basis: 'a bowl under an uncut worktop is a void, not a sink' }, null));
  }

  const seenSeat = new Set();
  for (const [id, A] of Object.entries(ACTIVITIES)) {
    if (!finished || !A.seated || !world.get(A.at)) continue;
    // Two activities sit on the same bench; the seat is one seat and gets one
    // verdict, not one per thing you might do in it.
    if (seenSeat.has(A.at)) continue;
    seenSeat.add(A.at);
    const g = getIn(world, A.at);
    if (g && !g.ok) out.push(cond('CANNOT_GET_IN', SEVERITY.blocking,
      `${A.at}: ${g.why}`, [A.at, ...g.blocked],
      { seat: A.at, blocked: g.blocked,
        basis: 'sitting down is sliding in along the seat and being able to stand up again' }, null));
  }

  // 9. the drawing gets a say
  if (world.reference) out.push(...referenceConditions(world));

  out.sort((a, b2) => b2.severity - a.severity);
  return out;
}

/**
 * Are these two tied together by asserted joints within `hops`?
 *
 * Not the support graph — joints only. The question is whether a connection was
 * *made*, not whether the geometry could carry a load.
 */
function linkedWithin(world, a, b, hops) {
  const adj = new Map();
  for (const j of world.joints.values()) {
    if (!adj.has(j.a)) adj.set(j.a, new Set());
    if (!adj.has(j.b)) adj.set(j.b, new Set());
    adj.get(j.a).add(j.b); adj.get(j.b).add(j.a);
  }
  let front = new Set([a]);
  const seen = new Set([a]);
  for (let h = 0; h < hops; h++) {
    const next = new Set();
    for (const x of front) for (const y of adj.get(x) || []) {
      if (y === b) return true;
      if (!seen.has(y)) { seen.add(y); next.add(y); }
    }
    front = next;
  }
  return false;
}

/** Connectivity of one building service, from its sources outward. */
export function systemReach(world, system) {
  // Anything carrying the system's label is on its graph. Restricting this to
  // run/fixture/source left traps, vents and the PV panels outside it — parts of
  // the system that the system could not see.
  const nodes = world.all().filter(e => e.system === system);
  const ends = (e) => e.kind === 'run' ? [e.meta.from, e.meta.to] : [e.box.p];
  // A pipe that arrives inside a fixture's body is connected to it. Measuring
  // centre to centre called a riser landing in the middle of a vanity "not
  // connected" because the basin's centre was 5 in away.
  const boxOf = (e) => e.kind === 'run' ? null
    : { lo: e.box.p.map((v, i) => v - e.box.s[i] / 2), hi: e.box.p.map((v, i) => v + e.box.s[i] / 2) };
  const gap = (p, e) => {
    const b = boxOf(e);
    if (!b) return Infinity;
    let d2 = 0;
    for (let i = 0; i < 3; i++) {
      const over = Math.max(b.lo[i] - p[i], 0, p[i] - b.hi[i]);
      d2 += over * over;
    }
    return Math.sqrt(d2);
  };
  const near = (a, b, t) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= t;
  // Distance from a point to a run's line, not just to its ends. A lighting circuit
  // is one cable with six pucks tapped off it; measured end to end, four of them
  // reported themselves unpowered.
  const toSegment = (p, r) => {
    const a = r.meta.from, b = r.meta.to;
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    if (!L2) return Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
    let t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1] + (p[2] - a[2]) * d[2]) / L2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t, p[2] - a[2] - d[2] * t);
  };
  const TOL_RUN = 1.5, TOL_FIX = 4.0;
  const connected = new Set();
  const queue = [];
  for (const s of nodes) if (s.kind === 'source') { connected.add(s.id); queue.push(s); }
  while (queue.length) {
    const cur = queue.pop();
    for (const n of nodes) {
      if (connected.has(n.id)) continue;
      const t = (cur.kind === 'fixture' || n.kind === 'fixture' || cur.kind === 'source' || n.kind === 'source') ? TOL_FIX : TOL_RUN;
      const hit = ends(cur).some(p => ends(n).some(q => near(p, q, t)))
        || (n.kind !== 'run' && ends(cur).some(p => gap(p, n) <= 1.0))
        || (cur.kind !== 'run' && ends(n).some(q => gap(q, cur) <= 1.0))
        || (cur.kind === 'run' && n.kind !== 'run' && toSegment(n.box.p, cur) <= TOL_FIX)
        || (n.kind === 'run' && cur.kind !== 'run' && toSegment(cur.box.p, n) <= TOL_FIX);
      if (hit) { connected.add(n.id); queue.push(n); }
    }
  }
  const gapFor = (f) => {
    let best = Infinity;
    for (const n of nodes) {
      if (!connected.has(n.id)) continue;
      for (const p of ends(f)) for (const q of ends(n)) best = Math.min(best, Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]));
      if (n.kind === 'run') for (const q of ends(n)) best = Math.min(best, gap(q, f));
    }
    return best === Infinity ? -1 : best;
  };
  return { connected, gapFor, nodes };
}

// ---------------------------------------------------------------- the fabric
/**
 * A run in open room air.
 *
 * Every collision instrument in this project asks whether a *body* meets a wire,
 * and a body is one posture in one place. Nobody asked the plainer question: is
 * this cable in the room? Forty-eight feet of it were — a conductor at chest
 * height across the bedroom, a riser standing free above the worktop from the
 * counter to the ceiling, four pipes three inches off the wall face down the whole
 * galley — and every one of them passed, because no body happened to be standing
 * where it was.
 *
 * The rule is the trade's own: a run belongs in a joist bay, a stud bay, above the
 * ceiling plane, or inside a carcass or chase. Anything else is exposed, and the
 * measure is how many inches of it.
 *
 * Sampled every two inches rather than by the box, because the interesting runs are
 * the ones that start in a cavity and come out of it — a riser wholly inside a
 * cabinet and a riser that leaves the cabinet at the counter have the same bounding
 * box and are not the same thing at all.
 */
export const BARE = { step: 2, pad: 0.4, allow: 4 };

export function bareRuns(world, { step = BARE.step, pad = BARE.pad } = {}) {
  const runs = world.all({ kind: 'run' });
  if (!runs.length) return { runs: 0, length: 0, bare: 0, worst: [] };
  const cover = world.all().filter(e => !['run', 'opening', 'port'].includes(e.kind))
    .map(e => ({ id: e.id, lo: e.lo, hi: e.hi }));
  const D = world.datum || {};
  const deck = D.deckTop != null ? D.deckTop : 0;
  // The ceiling is the underside of the rafters, not the top of the wall plus a
  // guess. Guessed, the lighting circuit in the rafter bay came back as 192 in of
  // cable slung through the room, which is a fact about the guess.
  const raf = world.all({ kind: 'rafter' });
  const ceil = raf.length ? Math.min(...raf.map(e => e.lo[2]))
    : (D.wallTop != null ? D.wallTop : 1e9);
  const W = world.walls || {};
  const inx = [W.W ? W.W.at + 1.75 : -1e9, W.E ? W.E.at - 1.75 : 1e9];
  const iny = [W.S ? W.S.at + 1.75 : -1e9, W.N ? W.N.at - 1.75 : 1e9];
  const covered = (p) => cover.some(e =>
    p[0] >= e.lo[0] - pad && p[0] <= e.hi[0] + pad &&
    p[1] >= e.lo[1] - pad && p[1] <= e.hi[1] + pad &&
    p[2] >= e.lo[2] - pad && p[2] <= e.hi[2] + pad);
  let total = 0, bare = 0;
  const worst = [];
  for (const r of runs) {
    const s = [0, 1, 2].map(i => r.hi[i] - r.lo[i]);
    const k = s.indexOf(Math.max(...s));
    const L = s[k];
    const n = Math.max(2, Math.ceil(L / step));
    let out = 0;
    for (let t = 0; t < n; t++) {
      const p = [0, 1, 2].map(i => i === k ? r.lo[i] + (t + 0.5) / n * L : (r.lo[i] + r.hi[i]) / 2);
      const inRoom = p[0] > inx[0] && p[0] < inx[1] && p[1] > iny[0] && p[1] < iny[1] &&
                     p[2] > deck + 0.1 && p[2] < ceil;
      if (inRoom && !covered(p)) out++;
    }
    total += L;
    const ex = L * out / n;
    bare += ex;
    if (ex > BARE.allow) worst.push({ id: r.id, run: r.meta.run || null, exposed: +ex.toFixed(1),
      at: [r.lo, r.hi].map(v => v.map(x => +x.toFixed(1))) });
  }
  worst.sort((a, b) => b.exposed - a.exposed);
  return { runs: runs.length, length: +total.toFixed(0), bare: +bare.toFixed(0), worst };
}

/**
 * A heated building with nothing in its cavities.
 *
 * This trailer has a water heater, a 65 gallon tank and a pipe run in the floor
 * bay, and not one inch of insulation anywhere in it: no batts between the studs,
 * nothing over the ceiling, nothing under the deck. The joist bay the cold trunk
 * runs through is open to the road. In an unheated week the first thing that
 * happens is the trunk splits, and the second is the deck.
 *
 * The measure is cavity volume with something in it. A cavity is the clear space
 * between two members of the same wall or floor; something in it is any element
 * whose material insulates.
 */
export const INSULATING = new Set(['foam', 'mineral_wool', 'fibreglass', 'wool', 'cellulose', 'polyiso', 'xps', 'eps']);

export function insulation(world) {
  const parts = [];
  const has = (kind, where) => {
    const ins = world.all().filter(e => INSULATING.has(e.material));
    return ins.filter(e => where(e)).length;
  };
  const D = world.datum || {};
  const joists = world.all({ kind: 'joist' });
  const studs = world.all({ kind: 'stud' });
  const rafters = world.all({ kind: 'rafter' });
  const ins = world.all().filter(e => INSULATING.has(e.material));
  const near = (e, set, axis) => set.some(m =>
    [0, 1, 2].every(i => e.hi[i] > m.lo[i] - 24 && e.lo[i] < m.hi[i] + 24));
  parts.push({ id: 'floor', members: joists.length, filled: ins.filter(e => near(e, joists)).length,
    why: 'the joist bay carries the cold trunk and is open to the road' });
  parts.push({ id: 'walls', members: studs.length, filled: ins.filter(e => near(e, studs)).length,
    why: 'a heated box with nothing between the studs' });
  parts.push({ id: 'roof', members: rafters.length, filled: ins.filter(e => near(e, rafters)).length,
    why: 'where the heat goes' });
  return { parts, any: ins.length, ok: parts.every(p => !p.members || p.filled > 0) };
}

/**
 * A fixture you use from above, with something solid over it.
 *
 * The galley sink is a bowl hung under a continuous worktop with no hole cut in
 * it. Sealed. The reach test called it fine, because I had told the reach test to
 * ignore anything above a working surface within its own footprint — the rule that
 * lets a hand into an undermount bowl also lets it through the slab that should
 * have had a hole in it. An exemption that hides the thing it was written to
 * measure is worse than no test.
 *
 * So this one asks the plain question separately: standing over this fixture and
 * dropping straight down, do you meet it, or do you meet a worktop?
 */
export const OPEN_FROM_ABOVE = new Set(['sink', 'toilet', 'shower', 'range', 'hob', 'basin']);

export function apertures(world) {
  const out = [];
  for (const f of world.all()) {
    // Every one of these is `kind: 'fixture'`; what it *is* lives in meta.role.
    // Matched on kind, the test found no sinks in a building with two and passed.
    const role = (f.meta && f.meta.role) || f.kind;
    if (!OPEN_FROM_ABOVE.has(role)) continue;
    const over = world.all().filter(e => e.id !== f.id && e.kind !== 'run' && e.kind !== 'opening' &&
      e.lo[2] >= f.hi[2] - 0.2 && e.lo[2] < f.hi[2] + 36 &&
      e.hi[0] > f.lo[0] + 0.5 && e.lo[0] < f.hi[0] - 0.5 &&
      e.hi[1] > f.lo[1] + 0.5 && e.lo[1] < f.hi[1] - 0.5);
    // How much of the fixture's mouth is left open by whatever sits over it.
    const area = (f.hi[0] - f.lo[0]) * (f.hi[1] - f.lo[1]);
    let worst = null;
    for (const e of over) {
      const ov = Math.max(0, Math.min(e.hi[0], f.hi[0]) - Math.max(e.lo[0], f.lo[0])) *
                 Math.max(0, Math.min(e.hi[1], f.hi[1]) - Math.max(e.lo[1], f.lo[1]));
      if (ov / area > 0.5 && (!worst || ov > worst.ov)) worst = { id: e.id, ov };
    }
    out.push({ id: f.id, kind: role, open: !worst,
      lidded: worst ? worst.id : null,
      covered: worst ? +(100 * worst.ov / area).toFixed(0) : 0 });
  }
  return out;
}

/**
 * A seat you cannot get into.
 *
 * Fitting in a seat and getting into it are different questions, and only the first
 * one was being asked. The dinette's table support was split into two end fins to
 * get it out of a sitter's hips — which worked, and walled the seat in: nine inches
 * of upstand at each end of a bench whose front is entirely under a thirty inch
 * table. The body fitted perfectly, in a box it could only have been lowered into.
 *
 * So: take the seated body, slide it along the seat and out, and see whether it
 * ever gets somewhere it can stand up. That is what sitting down is.
 */
export function getIn(world, seatId, { stature = 72 } = {}) {
  const seat = world.get(seatId);
  if (!seat) return null;
  const act = Object.entries(ACTIVITIES).find(([, A]) => A.at === seatId && A.seated);
  if (!act) return null;
  const [name, A] = act;
  const posed = attempt(world, name, { stature });
  if (!posed || !posed.body) return null;
  // Two different obstacle sets, because they are two different questions. Seated,
  // your thighs are under the table and the table is not in your way. Standing up,
  // it is the first thing you meet. Sharing one exemption between them, the bench
  // reported "slide four inches and stand up" into the underside of the tabletop.
  const all = obstaclesOf(world).map(e => ({ id: e.id, kind: e.kind, lo: e.lo, hi: e.hi }));
  const obs = all.filter(e => e.id !== seatId && e.id !== A.partner);
  const upObs = all.filter(e => e.id !== seatId);
  const FEET = new Set(['leftFoot', 'rightFoot', 'leftLowerLeg', 'rightLowerLeg']);
  const GROUND = new Set(['deck', 'joist', 'plate', 'chassis', 'wellcap']);
  const clear = (segs, dx, dy, against = obs) => {
    for (const g of segs) {
      const lo = [Math.min(g.a[0], g.b[0]) - g.r + dx, Math.min(g.a[1], g.b[1]) - g.r + dy, Math.min(g.a[2], g.b[2]) - g.r];
      const hi = [Math.max(g.a[0], g.b[0]) + g.r + dx, Math.max(g.a[1], g.b[1]) + g.r + dy, Math.max(g.a[2], g.b[2]) + g.r];
      for (const e of against) {
        if (FEET.has(g.bone) && GROUND.has(e.kind)) continue;
        const ov = [0, 1, 2].map(i => Math.min(hi[i], e.hi[i]) - Math.max(lo[i], e.lo[i]));
        if (ov.every(o => o > 0.5)) return e.id;
      }
    }
    return null;
  };
  // Standing up is not "the seated body, six inches higher". It is a standing body,
  // on the floor, at that spot. Tested as a lift, every seat in the trailer passed
  // on the first two inches, including one walled in at both ends.
  const deck = world.all().filter(e => e.meta.role === 'floor sheathing' || e.kind === 'deck');
  const floorZ = deck.length ? Math.max(...deck.map(e => e.hi[2])) : 0;
  const upPose = solvePose(ACTIVITIES['STANDING IN THE DOOR'].pose);
  const along = (seat.hi[0] - seat.lo[0]) > (seat.hi[1] - seat.lo[1]) ? 0 : 1;
  const hips = posed.body.bone.hips;
  const canStandAt = (x, y) => {
    const b = placeBody(upPose, { stature, at: [x, y], floor: floorZ, facing: 0 });
    return !clear(b.segments, 0, 0, upObs);
  };
  const segs = posed.body.segments;
  const reach = (seat.hi[along] - seat.lo[along]) + 36;
  const tried = [];
  for (const sign of [1, -1]) {
    for (let d = 0; d <= reach; d += 2) {
      const dx = along === 0 ? sign * d : 0, dy = along === 1 ? sign * d : 0;
      const hit = clear(segs, dx, dy);
      if (hit) { tried.push({ dir: sign, at: d, by: hit }); break; }
      if (d >= 4 && canStandAt(hips[0] + dx, hips[1] + dy))
        return { ok: true, seat: seatId, slide: d, dir: sign,
                 why: d ? `slide ${d} in along the seat and stand up` : 'stand straight up out of it' };
    }
  }
  const by = [...new Set(tried.map(t => t.by))];
  return { ok: false, seat: seatId, blocked: by, tried,
    why: by.length
      ? `you cannot get into it: sliding either way along the seat runs into ${by.join(' and ')}`
      : 'you cannot get into it: nowhere along the seat can a body stand up' };
}
