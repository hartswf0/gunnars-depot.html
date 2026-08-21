// operative/figure.js — a six foot man, to scale, who can be put in the room.
//
// Every habitability number so far has been a floor area or a corridor width, and
// those are the easy half. The hard half is the questions a tape measure answers
// only if you know what to measure against: is the sink at the right height, can
// you get your knees under the table, does the conduit hang into the space where
// a head goes, can you actually reach the shelf.
//
// The model that answers those is NOT a character mesh. A downloaded GLB of a
// person is a shape with no joints you can query and no provenance for its
// dimensions — you cannot ask it where its elbow is, and if you could you would
// not know whose elbow it was. What is needed is an anthropometric manikin:
// segment lengths derived from stature by published proportion, named landmarks,
// and reach envelopes. Then every ergonomic question is arithmetic against a
// person whose measurements are cited.
//
// Proportions: Drillis & Contini (1966), the standard segment-length fractions of
// stature used throughout biomechanics. Reach envelopes: NASA-STD-3000 vol. I
// §3.3. Recommended working heights: elbow-relative, per Grandjean. All of them
// approximations of a population, and labelled as such wherever they are reported.

/** Fractions of stature. Drillis & Contini (1966) unless noted. */
export const PROPORTION = {
  eye:            0.936,
  shoulder:       0.818,   // acromion height
  elbow:          0.630,
  wrist:          0.485,
  fingertip:      0.377,
  hip:            0.530,   // greater trochanter
  knee:           0.285,
  ankle:          0.039,
  shoulderBreadth:0.259,   // biacromial
  hipBreadth:     0.191,
  bodyDepth:      0.174,   // chest, front to back
  headHeight:     0.130,
  headBreadth:    0.129,
  // seated, measured from the seat surface up
  sittingHeight:  0.520,
  sittingEye:     0.442,
  popliteal:      0.250,   // underside of knee: the height a seat should be
  buttockKnee:    0.334,   // how far the knees stick out: knee clearance depth
  thighClearance: 0.085,   // top of thigh above the seat: minimum under-table gap
  elbowRest:      0.130,   // above the seat: sets the right table height
  // functional reach. NASA-STD-3000.
  forwardReach:   0.440,   // thumb-tip, shoulder held still
  overheadReach:  1.170    // standing, grip
};

/** Shoes, and the fact that people do not stand flush to a wall. */
export const ALLOWANCE = { shoe: 1.0, headClearance: 2.0, wallStandoff: 2.0 };

/** A person, in inches. Default is a six foot man — around the 95th percentile US male. */
export function figure(stature = 72) {
  const f = { stature };
  for (const [k, v] of Object.entries(PROPORTION)) f[k] = +(stature * v).toFixed(1);
  f.shoulderBreadthWithSlack = +(f.shoulderBreadth + 4).toFixed(1);  // moving, not standing to attention
  return f;
}

/**
 * Recommended heights for this body. Not preferences — the heights at which the
 * work happens at the elbow instead of at the shoulder or the lumbar spine.
 */
export function heights(f) {
  return {
    counter:   { want: +(f.elbow - 4).toFixed(0),  range: [+(f.elbow - 6).toFixed(0), +(f.elbow - 2).toFixed(0)],
                 what: 'light standing work — a sink or a worktop', basis: 'Grandjean: elbow height less 2-6 in' },
    sinkRim:   { want: +(f.elbow - 2).toFixed(0),  range: [+(f.elbow - 4).toFixed(0), +(f.elbow).toFixed(0)],
                 what: 'a sink rim, because the work happens at the bottom of the bowl',
                 basis: 'Grandjean: the working surface is the basin, not the rim' },
    seat:      { want: +f.popliteal.toFixed(0),    range: [+(f.popliteal - 2).toFixed(0), +(f.popliteal + 1).toFixed(0)],
                 what: 'a seat, so the feet reach the floor and the thigh is not compressed',
                 basis: 'popliteal height' },
    table:     { want: +(f.popliteal + f.elbowRest).toFixed(0),
                 range: [+(f.popliteal + f.elbowRest - 2).toFixed(0), +(f.popliteal + f.elbowRest + 2).toFixed(0)],
                 what: 'a table to sit at', basis: 'seat height plus seated elbow rest' },
    kneeGap:   { want: +(f.popliteal + f.thighClearance + 1).toFixed(0),
                 what: 'clear height under a table, or your thighs do not fit', basis: 'popliteal + thigh clearance' },
    kneeDepth: { want: +f.buttockKnee.toFixed(0), what: 'clear depth under a table', basis: 'buttock-knee length' },
    shelf:     { want: +f.shoulder.toFixed(0), max: +(f.fingertip + f.overheadReach - f.fingertip).toFixed(0),
                 what: 'the top of comfortable storage', basis: 'shoulder height; above it is a stretch' },
    headroom:  { want: +(f.stature + ALLOWANCE.shoe + ALLOWANCE.headClearance).toFixed(0),
                 what: 'ceiling, with shoes on and without ducking', basis: 'stature + shoe + clearance' }
  };
}

/**
 * The space this body actually occupies, as boxes, in a pose.
 *
 * Three boxes rather than one: legs, torso, head. A single body-sized block says
 * a conduit at 78 in is a collision when it passes beside the shoulder, and says
 * nothing at all about one at 68 in that goes straight through the chest.
 */
export const POSES = {
  stand: (f) => [
    { part: 'legs',  z: [0, f.hip],              w: f.hipBreadth,      d: f.bodyDepth * 0.8 },
    { part: 'torso', z: [f.hip, f.shoulder],     w: f.shoulderBreadth, d: f.bodyDepth },
    { part: 'head',  z: [f.shoulder, f.stature], w: f.headBreadth,     d: f.headBreadth }
  ],
  // seated on a surface at `seat`, added by `place`
  sit: (f) => [
    { part: 'legs',  z: [0, f.popliteal],                          w: f.hipBreadth,      d: f.buttockKnee, offset: f.buttockKnee / 2 },
    { part: 'torso', z: [f.popliteal, f.popliteal + f.sittingHeight - f.headHeight], w: f.shoulderBreadth, d: f.bodyDepth },
    { part: 'head',  z: [f.popliteal + f.sittingHeight - f.headHeight, f.popliteal + f.sittingHeight], w: f.headBreadth, d: f.headBreadth }
  ],
  crouch: (f) => [
    { part: 'legs',  z: [0, f.knee],                     w: f.hipBreadth * 1.3, d: f.bodyDepth },
    { part: 'torso', z: [f.knee, f.knee + f.sittingHeight - f.headHeight], w: f.shoulderBreadth, d: f.bodyDepth },
    { part: 'head',  z: [f.knee + f.sittingHeight - f.headHeight, f.knee + f.sittingHeight], w: f.headBreadth, d: f.headBreadth }
  ]
};

/** Put the figure at a point on the floor, facing +x or +y, and get its boxes. */
export function place(f, { at, pose = 'stand', facing = 'y', floor = 0, seat = null } = {}) {
  const parts = (POSES[pose] || POSES.stand)(f);
  const base = seat === null ? floor : seat;
  return parts.map(p => {
    const halfW = p.w / 2, halfD = p.d / 2;
    const off = p.offset || 0;
    // width is across the facing, depth is along it
    const dx = facing === 'y' ? halfW : halfD, dy = facing === 'y' ? halfD : halfW;
    const cx = at[0] + (facing === 'y' ? 0 : off), cy = at[1] + (facing === 'y' ? off : 0);
    return { part: p.part,
      lo: [cx - dx, cy - dy, base + p.z[0]],
      hi: [cx + dx, cy + dy, base + p.z[1]] };
  });
}

/** What the body runs into. Names the member and the part of the person. */
export function collides(world, boxes, { ignore = null } = {}) {
  const hits = [];
  for (const e of world.solids()) {
    if (ignore && ignore.has(e.id)) continue;
    for (const b of boxes) {
      const ov = [0, 1, 2].map(i => Math.min(b.hi[i], e.hi[i]) - Math.max(b.lo[i], e.lo[i]));
      if (ov.some(o => o <= 0.25)) continue;
      hits.push({ id: e.id, kind: e.kind, layer: e.layer, part: b.part,
        depth: +Math.min(...ov).toFixed(1),
        into: +(ov[0] * ov[1] * ov[2]).toFixed(0) });
    }
  }
  return hits.sort((a, b) => b.into - a.into);
}

/** Is this fixture at a height this body can work at? */
export function worksAt(f, el, kind = 'counter', floorZ = 0) {
  const h = heights(f)[kind];
  if (!h) return null;
  const top = +(el.hi[2] - floorZ).toFixed(0);
  const [lo, hi] = h.range || [h.want - 2, h.want + 2];
  return { id: el.id, is: top, want: h.want, range: [lo, hi], ok: top >= lo && top <= hi,
    off: +(top - h.want).toFixed(0), what: h.what, basis: h.basis };
}

/** Can this body sit at that table on that seat? */
export function sitsAt(f, seat, table, floorZ = 0) {
  const H = heights(f);
  const seatH = +(seat.hi[2] - floorZ).toFixed(0);
  const tableH = +(table.hi[2] - floorZ).toFixed(0);
  const gap = +(table.lo[2] - seat.hi[2]).toFixed(0);            // seat surface to table underside
  const reach = Math.min(
    Math.abs(table.lo[0] - seat.hi[0]), Math.abs(seat.lo[0] - table.hi[0]),
    Math.abs(table.lo[1] - seat.hi[1]), Math.abs(seat.lo[1] - table.hi[1]));
  return {
    seat: seat.id, table: table.id,
    seatHeight: { is: seatH, want: H.seat.want, ok: Math.abs(seatH - H.seat.want) <= 2 },
    tableHeight: { is: tableH, want: H.table.want, ok: Math.abs(tableH - H.table.want) <= 2 },
    kneeGap: { is: gap, want: +(H.kneeGap.want - H.seat.want).toFixed(0),
               ok: gap >= H.kneeGap.want - H.seat.want },
    kneeDepth: { is: +reach.toFixed(0), want: H.kneeDepth.want, ok: reach >= H.kneeDepth.want * 0.6 },
    basis: 'popliteal height, seated elbow rest, thigh clearance and buttock-knee length'
  };
}

/** Can this body get through there? Shoulders, moving, not standing to attention. */
export function passes(f, width) {
  return { width: +width.toFixed(0), shoulders: f.shoulderBreadth,
    moving: f.shoulderBreadthWithSlack,
    ok: width >= f.shoulderBreadthWithSlack,
    sideways: width >= f.bodyDepth + 2,
    basis: 'biacromial breadth plus 4 in for movement; sideways is body depth' };
}

/**
 * Walk the figure along a line and report everything it hits.
 *
 * This is the test the corridor-width number cannot do: a 30 in aisle is fine
 * until something at head height crosses it.
 */
export function walkThrough(world, f, from, to, { step = 6, pose = 'stand', floorZ = 0 } = {}) {
  const n = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / step));
  const facing = Math.abs(to[0] - from[0]) > Math.abs(to[1] - from[1]) ? 'x' : 'y';
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const at = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
    const hits = collides(world, place(f, { at, pose, facing, floor: floorZ }));
    if (hits.length) out.push({ at: at.map(v => +v.toFixed(0)), hits: hits.slice(0, 4) });
  }
  return out;
}
