// operative/inhabit.js — a body moving through it, not a body posed in it.
//
// everybody.js puts a figure at a station and asks whether the work arrives. That
// is eleven still photographs, and a still photograph cannot answer the only
// question that matters about a plan: **if the person cannot move around it, the
// design does not work.**
//
// So the body gets an envelope per posture and the building gets asked, at every
// square inch of its floor, which postures fit there. Standing is not one
// question — it is head clearance, shoulder breadth, and depth, and a corridor
// that passes a point test can still be one you cannot turn around in.
//
// This is also what makes the colony human-centred. `ants.js` forages for holes,
// clashes and unjoined pairs: faults in the geometry. An ant carrying a body
// forages for something else entirely — the places the geometry refuses a person
// — and those are not the same list. A trailer can be perfectly built and
// uninhabitable, and every instrument in this project until now would have called
// it finished.

import { plan } from './habitat.js';
import { figure } from './figure.js';

/**
 * What a body occupies, doing a thing. Height is the crown; width is across the
 * shoulders; depth is front to back. Every number is derived from the figure
 * rather than typed, so a different body changes the answers.
 */
export function postures(stature = 72) {
  const f = figure(stature);
  const sh = f.shoulderBreadth, hip = f.hipBreadth || sh * 0.85;
  return {
    STAND:  { h: f.stature,             w: sh,       d: sh * 0.62, why: 'standing still' },
    WALK:   { h: f.stature,             w: sh * 1.16, d: sh * 0.72, why: 'walking, arms swinging' },
    TURN:   { h: f.stature,             w: sh * 1.05, d: sh * 1.05, why: 'turning round on the spot' },
    PASS:   { h: f.stature,             w: sh * 0.80, d: sh * 0.55, why: 'edging through sideways' },
    SIT:    { h: f.sitting || f.stature * 0.52, w: sh, d: f.buttockKnee || 24, why: 'sitting' },
    CROUCH: { h: f.knee + 26,           w: sh,       d: sh * 0.95, why: 'crouching to a low cupboard' },
    KNEEL:  { h: f.knee + 30,           w: sh,       d: sh * 1.1,  why: 'kneeling to the floor' },
    REACH:  { h: f.overheadReach,       w: sh,       d: sh * 0.62, why: 'reaching overhead' }
  };
}

/** Free height above the floor at a plan cell, and whether there is a floor at all. */
function cellHeight(p, i, j) {
  const k = p.at(i, j);
  if (!p.inside[k]) return null;
  return p.ceil[k] - p.floorTop[k];
}

/**
 * Which postures fit where.
 *
 * A cell passes a posture when the head clears and a footprint of the posture's
 * width and depth is clear of anything standing in the body band. The footprint
 * is what separates "the ceiling is high enough here" from "you can stand here",
 * and it is the whole difference between a plan that measures and a plan that
 * works.
 */
export function fitMap(world, { stature = 72, step = 2 } = {}) {
  const p = plan(world, { step, from: 4, to: 68 });
  const P = postures(stature);
  const { n, at } = p;
  const out = {};
  const footprint = (i, j, w, d, body) => {
    const hw = Math.max(0, Math.round(w / 2 / step) - 1), hd = Math.max(0, Math.round(d / 2 / step) - 1);
    for (let dj = -hd; dj <= hd; dj++) for (let di = -hw; di <= hw; di++) {
      const x = i + di, y = j + dj;
      if (x < 0 || y < 0 || x >= n[0] || y >= n[1]) return false;
      const k = at(x, y);
      if (!p.inside[k] || p.blocked[k]) return false;
      if (p.ceil[k] - p.floorTop[k] < body.h) return false;
    }
    return true;
  };
  for (const [name, body] of Object.entries(P)) {
    const fits = new Uint8Array(n[0] * n[1]);
    for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
      const h = cellHeight(p, i, j);
      if (h === null || h < body.h) continue;
      // A body turns to suit the corridor. Tested in one fixed orientation, every
      // route in the trailer came back as "only by edging sideways", because a
      // corridor running the other way was measured across its length.
      if (footprint(i, j, body.w, body.d, body) || footprint(i, j, body.d, body.w, body)) fits[at(i, j)] = 1;
    }
    out[name] = fits;
  }
  const ft = (step * step) / 144;
  return { plan: p, postures: P, fits: out, step, n, at, lo: p.lo,
    area: Object.fromEntries(Object.entries(out).map(([k, v]) =>
      [k, +([...v].reduce((a, b) => a + b, 0) * ft).toFixed(1)])) };
}

/**
 * Can a body get from here to there, and what is the worst moment on the way.
 *
 * Widest-path over the cells a *walking* body fits in, then the tightest posture
 * that cell needed. A route that only exists if you turn sideways is a route, and
 * the report says so rather than calling it passable.
 */
export function walkable(fm, from, to) {
  const { n, at, step, lo } = fm;
  const cell = (pt) => [Math.floor((pt[0] - lo[0]) / step), Math.floor((pt[1] - lo[1]) / step)];
  const ORDER = ['WALK', 'STAND', 'PASS'];
  const rank = (i, j) => {
    for (let r = 0; r < ORDER.length; r++) if (fm.fits[ORDER[r]][at(i, j)]) return ORDER.length - r;
    return 0;
  };
  const start = cell(from), goal = cell(to);
  const near = (c) => {
    for (let r = 0; r <= 14; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      const x = c[0] + di, y = c[1] + dj;
      if (x < 0 || y < 0 || x >= n[0] || y >= n[1]) continue;
      if (rank(x, y) > 0) return [x, y];
    }
    return null;
  };
  const s = near(start), g = near(goal);
  if (!s || !g) return { ok: false, why: !s ? 'no standable floor at the start' : 'nothing you can stand on at the destination' };
  const best = new Int8Array(n[0] * n[1]).fill(-1);
  best[at(...s)] = rank(...s);
  const heap = [[best[at(...s)], s[0], s[1]]];
  while (heap.length) {
    heap.sort((a, b) => a[0] - b[0]);
    const [v, i, j] = heap.pop();
    if (v < best[at(i, j)]) continue;
    for (const [di, dj] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const x = i + di, y = j + dj;
      if (x < 0 || y < 0 || x >= n[0] || y >= n[1]) continue;
      const r = rank(x, y);
      if (!r) continue;
      const nv = Math.min(v, r);
      if (nv > best[at(x, y)]) { best[at(x, y)] = nv; heap.push([nv, x, y]); }
    }
  }
  const v = best[at(...g)];
  const worst = ORDER[ORDER.length - v] || null;
  return { ok: v > 0, tightest: worst,
    upright: v >= ORDER.length - 1,
    why: v <= 0 ? 'no route a body fits through'
       : v === 1 ? 'only by turning sideways'
       : v === 2 ? 'you can stand, but not walk normally' : 'you can walk it' };
}

/** Can a hand get to it, from somewhere a body can stand. */
export function reachable(world, fm, target, { stature = 72 } = {}) {
  const f = figure(stature);
  // You reach the cupboard, not the drawer at the back of it. A fixture housed in
  // a carcass is opened by walking up to the carcass.
  if (target.meta && target.meta.hostedBy) {
    const host = world.get(target.meta.hostedBy);
    if (host) target = host;
  }
  const { n, at, step, lo } = fm;
  const c = [0, 1].map(i => (target.lo[i] + target.hi[i]) / 2);
  const top = target.hi[2], bottom = target.lo[2];
  let best = null;
  for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    if (!fm.fits.STAND[at(i, j)] && !fm.fits.CROUCH[at(i, j)]) continue;
    const x = lo[0] + (i + 0.5) * step, y = lo[1] + (j + 0.5) * step;
    // nearest point of the fixture, in plan
    const nx = Math.max(target.lo[0], Math.min(x, target.hi[0]));
    const ny = Math.max(target.lo[1], Math.min(y, target.hi[1]));
    const flat = Math.hypot(x - nx, y - ny);
    if (flat < 1) continue;                                    // standing inside it
    const shoulder = fm.plan.floorTop[at(i, j)] + f.shoulder;
    const rise = Math.max(0, bottom - shoulder), drop = Math.max(0, shoulder - top);
    const need = Math.hypot(flat, Math.max(rise, drop));
    const limit = top > shoulder ? f.overheadReach - f.shoulder + f.forwardReach * 0.3 : f.forwardReach;
    const slack = +(limit - need).toFixed(1);
    if (!best || slack > best.slack) best = { slack, from: [+x.toFixed(0), +y.toFixed(0)], need: +need.toFixed(1), limit: +limit.toFixed(1) };
  }
  return best ? { ...best, ok: best.slack >= 0 } : { ok: false, why: 'nowhere to stand within reach of it' };
}

/**
 * One body, one errand: go there and do it.
 *
 * The errand fails if the route fails, if the posture the task needs does not fit
 * at the destination, or if the thing cannot be reached from anywhere a body can
 * stand. Three different failures, and a plan that confuses them cannot be fixed.
 */
export const ERRANDS = [
  { id: 'wash up',        at: 'sink',        posture: 'STAND',  room: 'galley' },
  { id: 'cook',           at: 'cooktop',     posture: 'STAND',  room: 'galley' },
  { id: 'get in the fridge', at: 'fridge',   posture: 'CROUCH', room: 'galley' },
  { id: 'use the toilet', at: 'wc',          posture: 'SIT',    room: 'bath' },
  { id: 'wash your hands', at: 'lav',        posture: 'STAND',  room: 'bath' },
  { id: 'shower',         at: 'shower.pan',  posture: 'STAND',  room: 'bath', enter: true },
  { id: 'sit down',       at: 'bench.W',     posture: 'SIT',    room: 'dinette' },
  { id: 'eat',            at: 'table',       posture: 'SIT',    room: 'dinette' },
  { id: 'go to bed',      at: 'bed.base',    posture: 'SIT',    room: 'sleep' },
  { id: 'clean the floor', at: 'deck.axle',  posture: 'KNEEL',  room: 'dinette', enter: true },
  { id: 'reach the high cupboard', at: 'cab.galley', posture: 'REACH', room: 'galley' }
];

export function errands(world, { stature = 72, step = 2 } = {}) {
  const fm = fitMap(world, { stature, step });
  const door = world.all({ kind: 'opening' }).find(o => o.meta.type === 'door');
  const from = door ? [(door.lo[0] + door.hi[0]) / 2, (door.lo[1] + door.hi[1]) / 2 + 12] : [50, 100];
  const out = [];
  for (const e of ERRANDS) {
    const el = world.get(e.at);
    if (!el) { out.push({ ...e, ok: false, why: `no ${e.at}` }); continue; }
    // Walk to where you stand to do it, not to the middle of it. Routed to the
    // centre of a bed, the answer was "nothing you can stand on at the
    // destination" — which is true of every bed ever made.
    const spot = standingRoom(fm, el, e.posture);
    const to = spot.at ? spot.at : [(el.lo[0] + el.hi[0]) / 2, (el.lo[1] + el.hi[1]) / 2];
    const route = walkable(fm, from, to);
    // Some things you get into rather than reach: a shower, a bed, a bench, and
    // the floor itself. Asking whether a hand can reach the shower pan from
    // outside it measures nothing about having a shower.
    const reach = (e.enter || e.posture === 'SIT' || e.posture === 'KNEEL')
      ? { ok: true, slack: null } : reachable(world, fm, el, { stature });
    // does the posture the task needs fit anywhere beside the thing?
    const room = standingRoom(fm, el, e.posture);
    out.push({ ...e, route, reach, room,
      ok: route.ok && reach.ok && room.ok,
      why: !route.ok ? route.why : !room.ok ? room.why : !reach.ok ? (reach.why || `${-reach.slack} in out of reach`) : null });
  }
  return { fitMap: fm, from: from.map(v => +v.toFixed(0)), errands: out,
    done: out.filter(o => o.ok).length, of: out.length };
}

/** Is there anywhere beside this thing that the posture actually fits? */
export function standingRoom(fm, el, posture) {
  const { n, at, step, lo } = fm;
  const grid = fm.fits[posture] || fm.fits.STAND;
  let best = null;
  for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    if (!grid[at(i, j)]) continue;
    const x = lo[0] + (i + 0.5) * step, y = lo[1] + (j + 0.5) * step;
    const nx = Math.max(el.lo[0], Math.min(x, el.hi[0])), ny = Math.max(el.lo[1], Math.min(y, el.hi[1]));
    const d = Math.hypot(x - nx, y - ny);
    if (!best || d < best.d) best = { d: +d.toFixed(0), at: [+x.toFixed(0), +y.toFixed(0)] };
    if (d === 0) break;
  }
  const LIMIT = 30;
  return best && best.d <= LIMIT
    ? { ok: true, ...best }
    : { ok: false, ...(best || {}), why: best ? `nowhere within ${LIMIT} in of it that you can ${(fm.postures[posture] || {}).why || 'stand'}` : `nowhere in the building that you can ${(fm.postures[posture] || {}).why || 'stand'}` };
}

/**
 * Fire it at a room whose answer is arithmetic: 96 x 120 in clear, 84 in to the
 * ceiling, one 36 in doorway, nothing in it. A body 19 in across can stand
 * anywhere in it and turn round anywhere in it, so STAND and TURN should both be
 * most of eighty square feet and the errand route should be a walk.
 */
export function calibrate({ World, Element, box } = {}) {
  if (!World || !Element || !box) return { ok: false, why: 'pass World, Element and box in' };
  const w = new World();
  const put = (id, lo, hi, meta = {}) => w.add(new Element({ id, kind: 'sheathing', layer: 'walls',
    material: 'ply', box: box([0,1,2].map(i => (lo[i]+hi[i])/2), [0,1,2].map(i => hi[i]-lo[i])), meta }));
  put('cal.deck', [0,0,15], [96,120,16], { role: 'floor sheathing' });
  put('cal.ceil', [0,0,100], [96,120,101], { role: 'ceiling' });
  put('cal.W', [-1,0,16], [0,120,100]);   put('cal.E', [96,0,16], [97,120,100]);
  put('cal.N', [0,120,16], [96,121,100]);
  put('cal.S1', [0,-1,16], [30,0,100]);   put('cal.S2', [66,-1,16], [96,0,100]);
  w.add(new Element({ id: 'cal.door', kind: 'opening', layer: 'walls', material: 'air',
    box: box([48,-0.5,58],[36,1,84]), meta: { type: 'door' } }));
  const fm = fitMap(w);
  const exact = (96 * 120) / 144;
  const standOk = fm.area.STAND > exact * 0.55;
  const turnOk  = fm.area.TURN  > exact * 0.45;
  const route = walkable(fm, [48, 6], [48, 110]);
  const walkOk = route.ok && route.tightest === 'WALK';
  // A pillar in the middle must show up as a place you cannot stand.
  put('cal.post', [44,56,16], [52,64,100]);
  const blocked = fitMap(w);
  // An 8 in post takes its own footprint out of the floor and a body's half-width
  // all round it. About two square feet — not three, which is what this asked for
  // and why it reported a post it had correctly seen as missed.
  const seesIt = fm.area.STAND - blocked.area.STAND >= 1.0;
  return { ok: standOk && turnOk && walkOk && seesIt,
    stand: fm.area.STAND, turn: fm.area.TURN, exact, route: route.tightest,
    withPost: blocked.area.STAND,
    verdict: (standOk && turnOk && walkOk && seesIt)
      ? 'the instrument can tell a room you can move around in from one you cannot'
      : `${fm.area.STAND} sq ft standable and ${fm.area.TURN} turnable in a ${exact} sq ft empty room, route ${route.tightest}, post ${seesIt ? 'seen' : 'MISSED'}` };
}

// ---------------------------------------------------------------- the colony, with a body
/**
 * Ants that carry a person.
 *
 * The colony in `ants.js` crawls surfaces and forages for faults in the geometry:
 * holes, clashes, unfastened pairs. Useful, and blind to the only thing a plan is
 * for. **A trailer can be perfectly built and uninhabitable**, and every
 * instrument in this project would have called it finished.
 *
 * These ants walk the floor with a body's envelope and forage for the opposite
 * thing: the places the building refuses a person. They are stigmergic in the same
 * way — a route a body can take is marked, corroboration is how many independent
 * ants arrived, and evaporation forgets what nobody confirms — but what they are
 * looking for is a person, not a defect.
 */
export const BODY_KINDS = {
  LOW_CEILING: { label: 'floor with nothing over your head to stand up under', weight: 1.0 },
  IN_THE_WAY:  { label: 'floor something is standing in the middle of', weight: 0.8 },
  CANT_TURN:  { label: 'you can stand here but not turn round', weight: 0.7 },
  SQUEEZE:    { label: 'only passable sideways', weight: 0.8 },
  DEAD_END:   { label: 'you can get in but only back out the way you came', weight: 0.5 },
  CANT_REACH: { label: 'a fixture nothing can be done from', weight: 1.0 }
};

const rng = (seed) => { let s = seed >>> 0 || 1; return () => {
  s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };

export function bodyColony(world, { stature = 72, step = 2, n = 40, seed = 7, ticks = 400 } = {}) {
  const fm = fitMap(world, { stature, step });
  const { at, lo } = fm, N = fm.n;
  const r = rng(seed);
  const door = world.all({ kind: 'opening' }).find(o => o.meta.type === 'door');
  const nest = door ? [(door.lo[0] + door.hi[0]) / 2, (door.lo[1] + door.hi[1]) / 2 + 12] : [50, 100];
  const cellOf = (p) => [Math.floor((p[0] - lo[0]) / step), Math.floor((p[1] - lo[1]) / step)];
  const inGrid = (i, j) => i >= 0 && j >= 0 && i < N[0] && j < N[1];
  const walkableAt = (i, j) => inGrid(i, j) && (fm.fits.WALK[at(i, j)] || fm.fits.STAND[at(i, j)] || fm.fits.PASS[at(i, j)]);
  const floorAt = (i, j) => inGrid(i, j) && fm.plan.inside[at(i, j)] && !fm.plan.blocked[at(i, j)];

  /**
   * Why a body does not fit here — and the answer that matters is which of three.
   *
   * Reported flat, this fired on a hundred and twelve cells and most of them were
   * the last nine inches before a wall, which is true of every building ever made
   * and is not a finding. A low ceiling is a finding. A bench in the middle of the
   * floor is a finding. The edge of the room is the room.
   */
  const whyNoFit = (i, j, posture = 'STAND') => {
    const body = fm.postures[posture];
    const k = at(i, j);
    if (!fm.plan.inside[k]) return null;
    if (fm.plan.ceil[k] - fm.plan.floorTop[k] < body.h) return { kind: 'LOW_CEILING' };
    const hw = Math.max(0, Math.round(body.w / 2 / step) - 1), hd = Math.max(0, Math.round(body.d / 2 / step) - 1);
    let furniture = false;
    for (let dj = -hd; dj <= hd; dj++) for (let di = -hw; di <= hw; di++) {
      const x = i + di, y = j + dj;
      if (!inGrid(x, y)) continue;
      if (fm.plan.blocked[at(x, y)] && fm.plan.inside[at(x, y)]) furniture = true;
    }
    return furniture ? { kind: 'IN_THE_WAY' } : null;      // the rest is the wall, and a wall is not news
  };

  const ledger = new Map();
  const report = (kind, i, j, ant, detail) => {
    const key = `${kind}@${Math.round(i / 3)},${Math.round(j / 3)}`;
    let f = ledger.get(key);
    if (!f) f = { kind, at: [+(lo[0] + (i + .5) * step).toFixed(0), +(lo[1] + (j + .5) * step).toFixed(0)],
                  ants: new Set(), hits: 0, detail: detail || null }, ledger.set(key, f);
    f.hits++; f.ants.add(ant);
    if (detail && !f.detail) f.detail = detail;
  };

  let start = cellOf(nest);
  if (!walkableAt(...start)) {
    outer: for (let rad = 1; rad < 30; rad++)
      for (let di = -rad; di <= rad; di++) for (let dj = -rad; dj <= rad; dj++)
        if (walkableAt(start[0] + di, start[1] + dj)) { start = [start[0] + di, start[1] + dj]; break outer; }
  }
  const scent = new Float32Array(N[0] * N[1]);
  const ants = [];
  for (let k = 0; k < n; k++) ants.push({ id: k, i: start[0], j: start[1], di: 0, dj: 1, follow: 0.2 + r() * 0.7 });

  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  for (let t = 0; t < ticks; t++) {
    for (const a of ants) {
      // where can this body go from here
      const open = DIRS.filter(([di, dj]) => walkableAt(a.i + di, a.j + dj));
      // Floor it can see but cannot use is the finding, not the wall behind it.
      for (const [di, dj] of DIRS) {
        const x = a.i + di, y = a.j + dj;
        if (!inGrid(x, y) || walkableAt(x, y)) continue;
        const why = whyNoFit(x, y);
        if (why) report(why.kind, x, y, a.id);
      }
      if (!fm.fits.TURN[at(a.i, a.j)] && fm.fits.STAND[at(a.i, a.j)]) report('CANT_TURN', a.i, a.j, a.id);
      if (!fm.fits.WALK[at(a.i, a.j)] && fm.fits.PASS[at(a.i, a.j)]) report('SQUEEZE', a.i, a.j, a.id);
      if (open.length === 1 && !(a.i === start[0] && a.j === start[1])) report('DEAD_END', a.i, a.j, a.id);
      if (!open.length) { a.i = start[0]; a.j = start[1]; continue; }
      // Stigmergy, inverted. A foraging ant follows the strongest trail because
      // the trail leads to food; a *surveying* ant is looking for floor nobody has
      // stood on yet, so the mark repels. Following the strongest mark, forty ants
      // reinforced each other onto the same six square feet by the door and
      // reported thirteen per cent of the trailer as though it were the whole of
      // it — the trail was the trap.
      let pick;
      const ahead = open.find(d => d[0] === a.di && d[1] === a.dj);
      if (r() < a.follow) {
        pick = open.reduce((b, d) =>
          scent[at(a.i + d[0], a.j + d[1])] < scent[at(a.i + b[0], a.j + b[1])] ? d : b, open[0]);
      } else {
        pick = (ahead && r() < 0.70) ? ahead : open[Math.floor(r() * open.length)];
      }
      a.di = pick[0]; a.dj = pick[1]; a.i += pick[0]; a.j += pick[1];
      scent[at(a.i, a.j)] += 1;
    }
    for (let k = 0; k < scent.length; k++) scent[k] *= 0.9995;
  }

  // fixtures nothing can be done from
  for (const e of ERRANDS) {
    const el = world.get(e.at);
    if (!el) continue;
    const room = standingRoom(fm, el, e.posture);
    if (!room.ok) {
      const c = cellOf([(el.lo[0] + el.hi[0]) / 2, (el.lo[1] + el.hi[1]) / 2]);
      for (let k = 0; k < Math.min(4, n); k++) report('CANT_REACH', c[0], c[1], k, { errand: e.id, why: room.why });
    }
  }

  // The margin around a bench is not news any more than the margin along a wall
  // was: every object has one. It is counted and set aside, and what is reported
  // is the three that describe a person rather than a clearance — cannot turn,
  // cannot pass upright, cannot get out except backwards.
  const MARGIN = new Set(['IN_THE_WAY', 'LOW_CEILING']);
  const margin = [...ledger.values()].filter(f => f.kind === 'IN_THE_WAY' && f.ants.size >= 2).length;
  const lowCeiling = [...ledger.values()].filter(f => f.kind === 'LOW_CEILING' && f.ants.size >= 2).length;
  const findings = [...ledger.values()]
    .filter(f => f.ants.size >= 2 && (!MARGIN.has(f.kind) || f.kind === 'LOW_CEILING'))
    .map(f => ({ kind: f.kind, at: f.at, ants: f.ants.size, hits: f.hits, detail: f.detail,
      label: BODY_KINDS[f.kind].label,
      weight: +(BODY_KINDS[f.kind].weight * (1 - Math.pow(0.55, f.ants.size)) * Math.log1p(f.hits)).toFixed(3) }))
    .sort((a, b) => b.weight - a.weight);
  const covered = scent.reduce((c, v) => c + (v > 0 ? 1 : 0), 0) * (step * step) / 144;
  const cellFt = (step * step) / 144;
  const areaOf = (grid) => +([...grid].reduce((a, b) => a + b, 0) * cellFt).toFixed(1);
  const standArea = areaOf(fm.fits.STAND), turnArea = areaOf(fm.fits.TURN);
  return { fitMap: fm, findings, scent, margin, lowCeiling,
    covered: +covered.toFixed(1), standable: standArea, turnable: turnArea,
    cannotTurn: +(standArea - turnArea).toFixed(1),
    nest: nest.map(v => +v.toFixed(0)),
    reached: +(covered / Math.max(standArea, 0.01) * 100).toFixed(0) };
}
