// operative/checks.js — deterministic resistance.
//
// A check is not a debugger message. It is the world reporting that the last
// operation met a condition it could not absorb. Every check returns measurable
// evidence, so the difference can be described in operational language and used
// to choose the next move.
import { separation, overlapVolume, aabb, containsFully } from './poly.js';
import { referenceConditions } from './reference.js';

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
      if (a.meta.allowOverlap === b.id || b.meta.allowOverlap === a.id) continue;
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

  // 2. every solid needs a load path to the ground.
  // Service equipment is strapped to framing rather than stacked, so it is asked
  // for continuity (check 6) instead of for a gravity path.
  for (const e of solids) {
    if (e.layer === 'services') continue;
    if (graph.seen.has(e.id)) continue;
    out.push(cond('UNSUPPORTED', SEVERITY.blocking,
      `${e.id} carries no load path to the ground`, [e.id], { z: +e.lo[2].toFixed(2) }, null));
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

  // 8. the drawing gets a say
  if (world.reference) out.push(...referenceConditions(world));

  out.sort((a, b2) => b2.severity - a.severity);
  return out;
}

/** Connectivity of one building service, from its sources outward. */
export function systemReach(world, system) {
  const nodes = world.all().filter(e => e.system === system && (e.kind === 'run' || e.kind === 'fixture' || e.kind === 'source'));
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
        || (cur.kind !== 'run' && ends(n).some(q => gap(q, cur) <= 1.0));
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
