// operative/reach.js — the puppet reaches for the thing, instead of being told it did.
//
// `everybody.js` poses a figure from hand-authored euler angles and then asks
// whether its hand happens to be near the worktop. That is backwards, and it shows:
// the cook's hand came back ten inches above the hob and the answer "the hob is ten
// inches too low" was a statement about my typing, not about the trailer. A pose is
// an assertion. A reach is a question.
//
// So this module keeps the body and throws the arms away. It stands the figure
// where a body can actually stand — the cells `inhabit.js` already proved a body
// fits in — turns it to face the thing, and then *solves* the arm: two links off
// the acromion, lengths taken from the anthropometry rather than from the rig,
// elbow dropped, hand put on the point that has to be touched. Then everything the
// solved arm passes through is named.
//
// Three answers come out of that and they are different answers:
//   - CAN'T STAND: there is nowhere to put a body near the thing at all.
//   - CAN'T REACH: the body is there and the point is outside its arm.
//   - IN THE WAY:  the hand arrives, and the arm goes through the flue chase.
// A design that confuses them cannot be fixed, because each one is fixed
// somewhere else: the plan, the height, the services.
//
// The rig's own arm is short — shoulder joint to fingertip measures 24 in on a six
// foot figure where Drillis & Contini put it at 32. The rig was validated on
// standing heights, and arm length is not a height, so nobody noticed. Reaches are
// therefore solved with figure.js's arm and drawn with the rig's radii: the length
// comes from the anthropometry, the thickness from the mesh.

import { figure } from './figure.js';
import { solve, place, obstacles, arm, solveArm } from './everybody.js';
import { fitMap } from './inhabit.js';

export { arm, solveArm };

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return mulS(a, 1 / l); };

/**
 * The posture a target height forces on a standing body.
 *
 * Anything at or above knuckle height is picked up standing. Below that you fold,
 * and folding is a cost the plan is not allowed to hide: a daily job that can only
 * be done from a crouch is a fault in the design, not a quirk of the user.
 */
export function stoopFor(stature, z, floor = 0) {
  const f = figure(stature);
  const h = z - floor;
  if (h >= f.knee + 2) return { posture: 'STAND', fold: false };
  if (h >= f.knee - 6) return { posture: 'STOOP', fold: true, why: 'bend at the waist' };
  if (h >= 6) return { posture: 'CROUCH', fold: true, why: 'squat down to it' };
  return { posture: 'KNEEL', fold: true, why: 'kneel on the floor' };
}

// ------------------------------------------------------------ where to stand
/** Neutral standing pose: arms down, because the arms are about to be solved. */
const AT_EASE = { leftUpperArm: [0, 0, -74], rightUpperArm: [0, 0, 74],
                  leftLowerArm: [0, -8, -4], rightLowerArm: [0, 8, 4] };

/**
 * The stances a body will take to get at something, in the order it will take them.
 *
 * A person asked to reach a flush handle at three feet does not stand rigid and
 * report failure; they bend. Measured upright only, half this trailer came back
 * unreachable, which was a fact about the instrument. Measured from any stance at
 * all, everything comes back fine, which would be a fact about nothing. So the
 * ladder is climbed in order and the rung is reported: a job that needs a crouch is
 * done, and is also a job that needs a crouch. Daily jobs are not allowed to.
 */
export const STANCES = [
  { id: 'UPRIGHT', why: 'standing', pose: AT_EASE },
  // A real stoop, not a nod. Thirty degrees at the spine drops the shoulder two and
  // a half inches and the flush handle still came back "out of reach" — which is
  // what you get for modelling bending down as looking down. Most of what a stoop
  // buys is not height, it is the fourteen inches of travel that puts the shoulder
  // out over the thing.
  { id: 'STOOP', why: 'bent at the waist', pose: { ...AT_EASE,
      spine: [55, 0, 0], chest: [16, 0, 0], neck: [-34, 0, 0], head: [-22, 0, 0],
      leftUpperLeg: [10, 0, 0], rightUpperLeg: [10, 0, 0] } },
  { id: 'CROUCH', why: 'squatting down to it', pose: { ...AT_EASE,
      leftUpperLeg: [-96, 0, -8], rightUpperLeg: [-96, 0, 8],
      leftLowerLeg: [104, 0, 0], rightLowerLeg: [104, 0, 0],
      leftFoot: [-24, 0, 0], rightFoot: [-24, 0, 0],
      spine: [26, 0, 0], chest: [10, 0, 0] } },
  { id: 'KNEEL', why: 'kneeling on the floor', pose: { ...AT_EASE,
      leftUpperLeg: [-92, 0, -8], rightUpperLeg: [-92, 0, 8],
      leftLowerLeg: [88, 0, 0], rightLowerLeg: [88, 0, 0],
      spine: [22, 0, 0], chest: [10, 0, 0] } }
];

const ARM_BONES = new Set(['leftShoulder', 'leftUpperArm', 'leftLowerArm', 'leftHand',
                           'rightShoulder', 'rightUpperArm', 'rightLowerArm', 'rightHand']);

/**
 * The best cell to work from: near enough to touch it, far enough to stand in.
 *
 * Scored on the reach it demands rather than on distance, because the nearest cell
 * to a wall cupboard is the one with your nose against the door.
 */
export function stationFrom(fm, target, { stature = 72, posture = 'STAND', within = 40,
                                          inside = null, take = 14 } = {}) {
  const { n, at, step, lo } = fm;
  const f = figure(stature);
  const grid = fm.fits[posture] || fm.fits.STAND;
  const found = [];
  for (let j = 0; j < n[1]; j++) for (let i = 0; i < n[0]; i++) {
    const k = at(i, j);
    const x = lo[0] + (i + 0.5) * step, y = lo[1] + (j + 0.5) * step;
    // Some things you work from inside: a shower valve is turned by someone standing
    // in the tray. Asked from outside it, the answer is a man leaning through a wall.
    const within_it = inside && x > inside.lo[0] && x < inside.hi[0] && y > inside.lo[1] && y < inside.hi[1];
    if (!grid[k] && !within_it) continue;
    const flat = Math.hypot(x - target[0], y - target[1]);
    if (flat > within) continue;
    const floor = fm.plan.floorTop[k];
    const shoulder = floor + f.shoulder;
    const need = Math.hypot(flat, target[2] - shoulder);
    // Standing off is a comfort, not a requirement; a wall-hung thing is worked at
    // arm's length and a low one is worked over your toes.
    const score = need + Math.max(0, 8 - flat) * 0.8;
    found.push({ score, at: [+x.toFixed(1), +y.toFixed(1)], floor, need: +need.toFixed(1), flat: +flat.toFixed(1) });
  }
  found.sort((a, b) => a.score - b.score);
  // Several places to try, not one. Scored on reach alone the best cell is often the
  // one with the body's shoulder inside the cupboard — a spot the fit map passes
  // because it shrinks the footprint by a cell, and the collision test then blames
  // the cupboard. Give the body somewhere else to go and it goes there.
  const out = [];
  for (const c of found) {
    if (out.some(o => Math.hypot(o.at[0] - c.at[0], o.at[1] - c.at[1]) < 4)) continue;
    out.push(c);
    if (out.length >= take) break;
  }
  return out;
}

/**
 * The obstacles as plain boxes, once.
 *
 * `Element.lo` and `Element.hi` are getters that rebuild the part's polygon and
 * take its bounding box every time they are read. Fine for a check that reads them
 * once; this module reads them a few million times, and the report took ninety
 * seconds to say what a snapshot says in ten.
 */
export function snapshot(world) {
  return obstacles(world).map(e => ({ id: e.id, kind: e.kind, lo: e.lo, hi: e.hi,
                                      role: (e.meta || {}).role || null }));
}

/**
 * What a reach is allowed to pass through.
 *
 * Touching a thing is not colliding with it, and neither is reaching *into* one.
 * A hand in the sink goes over the worktop, because the worktop is the rim of the
 * hole the sink is in; an arm in a cupboard passes the shelf edge; a finger on a
 * recessed valve is inside the wall by definition. Counted flat, all three come
 * back as the building obstructing a person from using the building.
 *
 * So: the thing itself, whatever carries it, whatever it carries, any door hung in
 * it, anything the target point is actually inside, and anything sitting directly
 * over the target within the thing's own footprint — that last one is the rim.
 * Everything else in the trailer is a genuine obstruction and is named.
 */
export function permitted(world, el, target, extra = []) {
  const ig = new Set([el.id, ...extra]);
  if (el.meta && (el.meta.hostedBy || el.meta.host)) ig.add(el.meta.hostedBy || el.meta.host);
  for (const e of world.all()) {
    const m = e.meta || {};
    if (m.hostedBy === el.id || m.host === el.id) ig.add(e.id);
    if (e.kind === 'leaf' && (m.opening === el.id || e.id.includes(el.id))) ig.add(e.id);
    const inside = [0, 1, 2].every(i => target[i] >= e.lo[i] - 0.5 && target[i] <= e.hi[i] + 0.5);
    if (inside) ig.add(e.id);
    // A cable that lands in the panel is in the panel. The last leg of the bank feed
    // stops inside the breaker box it feeds, and counting the overlap made "you
    // cannot get at the breakers because of the wire going into the breakers".
    if (e.kind === 'run' && [0, 1, 2].every(i => e.hi[i] > el.lo[i] && e.lo[i] < el.hi[i])) ig.add(e.id);
    const overPlan = [0, 1].every(i => e.hi[i] > el.lo[i] && e.lo[i] < el.hi[i]);
    if (overPlan && e.lo[2] >= target[2] - 0.5 && ['fixture', 'counter', 'shelf'].includes(e.kind)) ig.add(e.id);
  }
  return ig;
}

/**
 * Stand there, face it, put a hand on it, and report what the arm went through.
 *
 * The swivel is searched rather than assumed: twenty-four elbow positions round the
 * line of reach, and the one taken is the one that hits least. That is not the
 * instrument being lenient — it is the instrument doing what a person does, which
 * is to move their elbow out of the way. What survives all twenty-four is a thing
 * you cannot get your arm past at all, and that is worth reporting.
 */
export function operate(world, { target, stand, floor = 0, stature = 72, hand = 'right',
                                 stance = STANCES[0], ignore = new Set(), slack = 0.5,
                                 obs = null } = {}) {
  const A = arm(stature);
  const facing = Math.atan2(target[1] - stand[1], target[0] - stand[0]) - Math.PI / 2;
  const body = place(solve(stance.pose), { stature, at: stand, floor, facing });
  const shoulder = body.bone[hand === 'left' ? 'leftUpperArm' : 'rightUpperArm'];
  const world_obs = (obs || snapshot(world)).filter(e => !ignore.has(e.id));
  const FEET = new Set(['leftFoot', 'rightFoot', 'leftLowerLeg', 'rightLowerLeg']);
  const GROUND = new Set(['deck', 'joist', 'plate', 'chassis', 'wellcap']);
  const boxOf = (g) => ({ lo: [0, 1, 2].map(i => Math.min(g.a[i], g.b[i]) - g.r),
                          hi: [0, 1, 2].map(i => Math.max(g.a[i], g.b[i]) + g.r) });
  const hitsOf = (segs) => {
    const out = [];
    for (const g of segs) {
      const b = boxOf(g);
      for (const e of world_obs) {
        // A toe kick is a hole cut in a cupboard for the front of your foot. Counting
        // it as an obstruction reports the one detail in the galley that exists
        // purely so a body can get closer, as the reason a body cannot get closer.
        if (FEET.has(g.bone) && (GROUND.has(e.kind) || e.role === 'plinth')) continue;
        const ov = [0, 1, 2].map(i => Math.min(b.hi[i], e.hi[i]) - Math.max(b.lo[i], e.lo[i]));
        if (ov.some(o => o <= slack)) continue;
        out.push({ bone: g.bone, id: e.id, kind: e.kind, depth: +Math.min(...ov).toFixed(1) });
      }
    }
    return out;
  };
  // The body as posed minus the arms it was posed with. Leaving the authored arms
  // in reports the pose colliding with the room and calls it the reach.
  const trunk = body.segments.filter(g => !ARM_BONES.has(g.bone));
  const trunkHits = hitsOf(trunk);
  let best = null;
  for (let k = 0; k < 24; k++) {
    const sol = solveArm(shoulder, target, A, (k / 24) * 2 * Math.PI);
    const limb = [
      { bone: `${hand}UpperArm`, a: sol.shoulder, b: sol.elbow, r: A.rUpper },
      { bone: `${hand}LowerArm`, a: sol.elbow, b: sol.hand, r: A.rFore },
      { bone: `${hand}Hand`, a: sol.hand, b: sol.hand, r: A.rHand }
    ];
    const h = hitsOf(limb);
    // Least obstructed first; among equals, the elbow that hangs lowest, which is
    // the one an unbraced arm actually takes.
    const cost = h.reduce((a, x) => a + x.depth, 0) * 100 + h.length * 10 + sol.elbow[2] * 0.01;
    if (!best || cost < best.cost) best = { cost, sol, limb, h };
  }
  return { body: { ...body, segments: trunk.concat(best.limb) }, arm: best.sol, facing,
           stance: stance.id, stand, floor,
           trunk: trunkHits.sort((a, b) => b.depth - a.depth),
           arms: best.h.sort((a, b) => b.depth - a.depth),
           hits: best.h.concat(trunkHits).sort((a, b) => b.depth - a.depth) };
}

// ------------------------------------------------------------ the stations
/**
 * The points a body has to touch to live here.
 *
 * Not fixtures — *points on* fixtures. "Can he reach the sink" is not a question:
 * a sink is two feet wide and the tap is at the back of it, so the answer depends
 * entirely on which bit you mean. Every station below names the actual inch that
 * has to be got at, on the side it is got at from, and says whether it is a thing
 * you do every day. A once-a-year reach into the back of a locker is allowed to be
 * awkward; making the coffee is not.
 *
 * `on` is the element the point belongs to — it and its host are ignored in the
 * collision test, because touching a thing is not colliding with it.
 */
const mid = (el, i) => (el.lo[i] + el.hi[i]) / 2;

/**
 * The point on the face a person stands in front of.
 *
 * A breaker panel's centre is inside the panel, and the panel is screwed to a stud,
 * so a fingertip put at the centre is inside the stud and the report reads "the arm
 * goes through stud.W.113" — which is the switch being on a wall, described as an
 * obstruction. You touch the front of a thing, and its front is the shallow side
 * that faces the room.
 */
export function roomFace(el, { at = null } = {}) {
  const dx = el.hi[0] - el.lo[0], dy = el.hi[1] - el.lo[1];
  const i = dx <= dy ? 0 : 1;
  const centre = i === 0 ? 50 : 120;
  const p = [mid(el, 0), mid(el, 1), at === null ? mid(el, 2) : at];
  p[i] = mid(el, i) < centre ? el.hi[i] : el.lo[i];
  return p;
}

export const STATIONS = [
  { id: 'tap', what: 'the tap over the sink', room: 'galley', daily: true, needs: 'tap',
    on: 'tap.galley', orOn: 'sink',
    at: (w, e) => e.kind === 'tap' ? [mid(e, 0), mid(e, 1), e.hi[2] - 1]
      : [e.hi[0] - 2, mid(e, 1), (w.get('top.galley') || e).hi[2] + 5] },
  { id: 'basin', what: 'the bottom of the sink bowl', room: 'galley', daily: true,
    on: 'sink', at: (w, e) => [mid(e, 0), mid(e, 1), e.lo[2] + 1] },
  { id: 'hob.back', what: 'the far burner', room: 'galley', daily: true,
    on: 'cooktop', at: (w, e) => [e.hi[0] - 4, mid(e, 1), e.hi[2] + 1] },
  { id: 'hob.pan', what: 'a pan handle on the near burner', room: 'galley', daily: true,
    on: 'cooktop', at: (w, e) => [e.lo[0] + 4, mid(e, 1), e.hi[2] + 4] },
  { id: 'worktop.back', what: 'the back of the worktop', room: 'galley', daily: true,
    // The clear end of the run, not its middle: the middle of this one has the hob
    // in it, and reaching across a hob to the wall behind it is a different question
    // — one worth asking, but not this one.
    on: 'top.galley', at: (w, e) => [e.hi[0] - 2, e.hi[1] - 1, e.hi[2] + 1] },
  { id: 'fridge.door', what: 'the fridge door', room: 'galley', daily: true,
    on: 'fridge', at: (w, e) => [e.lo[0], mid(e, 1), mid(e, 2)] },
  { id: 'fridge.back', what: 'the back of the fridge', room: 'galley', daily: true,
    // It is a drawer, so its back comes to you: measured at the carcass face, plus
    // the drawer front standing proud of it. Measured where the box sits when it is
    // shut, the answer is "seven inches out of reach", which is true of the back of
    // every drawer ever fitted and says nothing about this trailer.
    on: 'fridge', at: (w, e) => [e.lo[0] - 2, mid(e, 1), e.lo[2] + 3] },
  { id: 'cupboard', what: 'the top shelf of the galley cupboard', room: 'galley', daily: true,
    on: 'cab.galley', at: (w, e) => [mid(e, 0), mid(e, 1), e.hi[2] - 4] },
  { id: 'wc.flush', what: 'the flush', room: 'bath', daily: true, needs: 'flush',
    on: 'handle.wc', orOn: 'wc',
    at: (w, e) => e.kind === 'flush' ? [mid(e, 0), mid(e, 1), e.hi[2]]
      : [mid(e, 0), e.hi[1] - 2, e.hi[2] + 2] },
  { id: 'paper', what: 'the toilet roll, sitting down', room: 'bath', daily: true, needs: 'paper',
    seated: 'wc', on: 'holder.paper', orOn: 'wc',
    at: (w, e) => [mid(e, 0), mid(e, 1), mid(e, 2)] },
  { id: 'rose', what: 'the shower rose', room: 'bath', daily: true, needs: 'rose',
    inside: 'shower.pan', on: 'rose.shower', orOn: 'shower.valve',
    at: (w, e) => roomFace(e) },
  { id: 'switch', what: 'the light switch by the door', room: 'entry', daily: true, needs: 'switch',
    on: 'switch.entry', orOn: 'door.entry', at: (w, e) => roomFace(e) },
  { id: 'lav.tap', what: 'the basin tap', room: 'bath', daily: true, needs: 'lav.tap',
    on: 'tap.lav', orOn: 'lav',
    at: (w, e) => e.kind === 'tap' ? [mid(e, 0), mid(e, 1), e.hi[2] - 1]
      : [mid(e, 0), e.hi[1] - 2, e.hi[2] + 5] },
  { id: 'shower.valve', what: 'the shower valve, standing in the tray', room: 'bath',
    daily: true, inside: 'shower.pan',
    on: 'shower.valve', at: (w, e) => roomFace(e) },
  { id: 'door.handle', what: 'the door handle', room: 'entry', daily: true, needs: 'handle',
    on: 'handle.door', orOn: 'door.entry',
    at: (w, e) => e.kind === 'handle' ? roomFace(e) : [mid(e, 0), e.lo[1] + 3, e.lo[2] + 36] },
  { id: 'dc.panel', what: 'the DC breakers', room: 'services', daily: false,
    on: 'dc.panel', at: (w, e) => roomFace(e) },
  { id: 'ac.panel', what: 'the AC breakers', room: 'services', daily: false,
    on: 'ac.panel', at: (w, e) => roomFace(e) },
  { id: 'water.pump', what: 'the water pump, to switch it off', room: 'services', daily: false,
    on: 'pump', at: (w, e) => [mid(e, 0), mid(e, 1), e.hi[2]] },
  { id: 'heater', what: 'the heater controls', room: 'services', daily: true,
    on: 'heater', at: (w, e) => roomFace(e, { at: e.hi[2] - 4 }) }
];

/**
 * Fittings a person operates that this building does not contain.
 *
 * A tap is not decoration: it is the thing your hand goes to, it stands five inches
 * proud of the worktop, and if it is not modelled then every reach into that corner
 * is measured against a hole in the drawing. The same goes for a flush, a door
 * handle, a shower rose. They are missing from this trailer, and the honest thing
 * is to say so next to the reach that assumed them.
 */
export const FITTINGS = [
  { id: 'tap', what: 'a tap at the galley sink', kinds: ['tap'], near: 'sink' },
  { id: 'lav.tap', what: 'a tap at the basin', kinds: ['tap'], near: 'lav' },
  { id: 'flush', what: 'a flush or trap handle on the WC', kinds: ['flush', 'cistern'], near: 'wc' },
  { id: 'rose', what: 'a shower rose', kinds: ['rose', 'showerhead'] },
  { id: 'handle', what: 'a handle and a latch on the entry door', kinds: ['handle', 'latch'] },
  { id: 'switch', what: 'light switches', kinds: ['switch'] },
  { id: 'paper', what: 'somewhere to put the toilet roll', kinds: ['holder', 'roll'] },
  { id: 'grab', what: 'a grab handle at the door', kinds: ['grab', 'rail'] },
  { id: 'door', what: 'a door on the galley carcass', kinds: ['leaf'], near: 'cab.galley' }
];

/**
 * A fitting counts only where it is.
 *
 * Asked "is there a tap in this building", a vanity mixer answers yes on behalf of
 * a galley that has none. `near` pins each fitting to the fixture it belongs to:
 * within two feet of it, or it is a tap somewhere else.
 */
export function missingFittings(world) {
  return FITTINGS.filter(F => {
    const anchor = F.near ? world.get(F.near) : null;
    return !world.all().some(e => {
      if (!F.kinds.includes(e.kind)) return false;
      if (!anchor) return true;
      return [0, 1, 2].every(i => e.hi[i] > anchor.lo[i] - 24 && e.lo[i] < anchor.hi[i] + 24);
    });
  }).map(F => ({ id: F.id, what: F.what }));
}

/**
 * Every station, worked, by one body that is allowed to move its feet.
 *
 * For each point: up to fourteen places to stand and four stances at each, tried
 * cheapest first, and the first combination that gets a hand on it with nothing in
 * the way wins. If none is clean, the least bad one is reported along with what it
 * hit — because "he could do it if he stood over there and bent down" and "he
 * cannot do it at all" are different sentences and only one of them is a fault.
 */
export function reachAll(world, { stature = 72, step = 2, fm = null } = {}) {
  const map = fm || fitMap(world, { stature, step });
  const f = figure(stature);
  const missing = missingFittings(world);
  const gone = new Set(missing.map(m => m.id));
  const OBS = snapshot(world);
  const out = [];
  for (const S of STATIONS) {
    const el = world.get(S.on) || (S.orOn ? world.get(S.orOn) : null);
    if (!el) { out.push({ ...S, ok: false, verdict: 'NOT THERE', why: `no ${S.on} in this building` }); continue; }
    const target = S.at(world, el);
    const inside = S.inside ? world.get(S.inside) : null;
    const spots = stationFrom(map, target, { stature, inside });
    if (!spots.length) {
      out.push({ ...S, target, ok: false, verdict: 'CAN\'T STAND',
                 why: 'nowhere within reach of it that a body fits standing up' });
      continue;
    }
    const ignore = permitted(world, el, target, (S.past || []).concat(S.inside ? [S.inside] : []));
    let best = null;
    outer:
    for (let si = 0; si < STANCES.length; si++) {
      for (const spot of spots) {
        const r = operate(world, { target, stand: spot.at, floor: spot.floor, stature,
                                   stance: STANCES[si], ignore, obs: OBS });
        const cost = (r.arm.reached ? 0 : 1000 + r.arm.short * 10)
          + r.hits.reduce((a, h) => a + h.depth, 0) * 5 + r.hits.length * 3 + si * 2;
        if (!best || cost < best.cost) best = { cost, r, spot, stance: STANCES[si] };
        if (r.arm.reached && !r.hits.length) break outer;
      }
    }
    const { r, spot, stance } = best;
    const through = [...new Set(r.hits.map(h => h.id))];
    // Bending is not a fault; a person bends. Squatting and kneeling are, for
    // something you do every day — which is the whole of the instruction "assume
    // they shouldn't crouch", and the line between a fit-out that works and one
    // that is merely survivable.
    const FOLDED = stance.id === 'CROUCH' || stance.id === 'KNEEL';
    const verdict = !r.arm.reached ? 'CAN\'T REACH'
      : r.trunk.length ? 'NO ROOM'
      : r.arms.length ? 'IN THE WAY'
      : (FOLDED && S.daily) ? 'ONLY BY ' + stance.id
      : 'OK';
    out.push({ ...S, target: target.map(v => +v.toFixed(1)), from: spot.at,
               verdict, ok: verdict === 'OK', stance: stance.id,
               reached: r.arm.reached, short: r.arm.short, effort: r.arm.effort,
               through, wires: [...new Set(r.hits.filter(h => h.kind === 'run').map(h => h.id))],
               missing: S.needs && gone.has(S.needs) ? S.needs : null,
               why: !r.arm.reached ? `${r.arm.short} in short of it, from every place a body fits`
                 : r.trunk.length ? `no room to stand to it — you are in ${[...new Set(r.trunk.map(h => h.id))].join(', ')}`
                 : r.arms.length ? `arm goes through ${[...new Set(r.arms.map(h => h.id))].join(', ')}`
                 : (FOLDED && S.daily) ? stance.why : null });
  }
  return { stature, reach: +arm(stature).span.toFixed(1), shoulder: +f.shoulder.toFixed(1),
           stations: out, ok: out.filter(s => s.ok).length, of: out.length,
           missing, fitMap: map };
}

/**
 * Fire the arm at answers you can do on paper.
 *
 * Nothing in this module is believed until it has passed this. The IK is a cosine
 * rule and a cross product, which is exactly the sort of thing that returns
 * plausible numbers while being wrong by a sign — the elbow-down heuristic it
 * replaced returned plausible numbers for a fortnight.
 *
 * A shoulder at the origin, a six foot man's arm of 31.8 in:
 *   - a point 20 in away is inside it and the hand must land exactly on it;
 *   - a point 45 in away is not, and the shortfall must be 13.2;
 *   - swinging the swivel right round must actually move the elbow, by roughly
 *     twice the radius of the solution circle.
 */
export function calibrate({ stature = 72 } = {}) {
  const A = arm(stature);
  const sh = [0, 0, 0];
  const near = solveArm(sh, [20, 0, 0], A, 0);
  const far = solveArm(sh, [45, 0, 0], A, 0);
  const onTarget = Math.hypot(near.hand[0] - 20, near.hand[1], near.hand[2]);
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < 24; k++) {
    const e = solveArm(sh, [20, 0, 0], A, (k / 24) * 2 * Math.PI).elbow;
    for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], e[i]); hi[i] = Math.max(hi[i], e[i]); }
  }
  const swing = Math.max(hi[1] - lo[1], hi[2] - lo[2]);
  return { arm: A, near, far, onTarget: +onTarget.toFixed(4), swing,
    ok: near.reached && !far.reached && onTarget < 1e-3 && swing > 8 };
}
