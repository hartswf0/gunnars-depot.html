// operative/checks.js — deterministic resistance.
//
// A check is not a debugger message. It is the world reporting that the last
// operation met a condition it could not absorb. Every check returns measurable
// evidence, so the difference can be described in operational language and used
// to choose the next move.
import { separation, overlapVolume, aabb, containsFully } from './poly.js';
import { referenceConditions } from './reference.js';
import { scheduleFor, required, joinKey, scheduleForPair, sortOf } from './joints.js';
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
  const unjoined = [];
  const seenContact = new Set();
  for (const [id, ups] of graph.under) {
    for (const u of ups) {
      const k = joinKey(id, u.id);
      if (world.joints.has(k)) continue;
      if (seenContact.has(k)) continue;   // the graph records both directions; a contact is one contact
      seenContact.add(k);
      const A = world.get(id), B = world.get(u.id);
      if (!A || !B) continue;
      const rule = scheduleForPair(A, B);
      if (!rule) continue;
      unjoined.push({ a: id, b: u.id, rule });
    }
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

  // 8. the drawing gets a say
  if (world.reference) out.push(...referenceConditions(world));

  out.sort((a, b2) => b2.severity - a.severity);
  return out;
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
