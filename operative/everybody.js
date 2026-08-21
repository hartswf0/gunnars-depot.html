// operative/everybody.js — EVERYBODY, standing in the trailer.
//
// figure.js gives dimensions: a six foot man has his elbow at 45.4 in. That
// answers "is the counter the right height" and cannot answer "can he wash up at
// it" — because washing up is a posture, and a posture puts a hand somewhere the
// dimension list has no opinion about.
//
// EVERYBODY is a VRM-named skinned rig on a T-pose bind: nineteen bones, one
// capsule per body mass. Authored Y-up in metres, facing +Z, standing 5 ft 10.
// This trailer is Z-up in inches. So: forward kinematics is done in the rig's own
// space, where its pose vocabulary was written and is known to work, and only the
// finished points are converted. Rotating a pose library into another coordinate
// convention is how you get an avatar whose left elbow bends backwards.
//
// Scaled by 1.0332 the rig is a six foot man and its landmarks agree with
// figure.js within two inches at every joint, which is the only reason either is
// worth believing.

import { figure } from './figure.js';

const M_TO_IN = 39.3701;
const DEG = Math.PI / 180;

/** name, parent, bind position in rig space (metres, Y up). */
export const RIG = [
  ['hips', null, [0, 0.950, 0]], ['spine', 'hips', [0, 1.060, 0]],
  ['chest', 'spine', [0, 1.200, 0]], ['neck', 'chest', [0, 1.440, 0]],
  ['head', 'neck', [0, 1.520, 0]],
  ['leftShoulder', 'chest', [0.070, 1.400, 0]], ['leftUpperArm', 'leftShoulder', [0.160, 1.400, 0]],
  ['leftLowerArm', 'leftUpperArm', [0.420, 1.400, 0]], ['leftHand', 'leftLowerArm', [0.660, 1.400, 0]],
  ['rightShoulder', 'chest', [-0.070, 1.400, 0]], ['rightUpperArm', 'rightShoulder', [-0.160, 1.400, 0]],
  ['rightLowerArm', 'rightUpperArm', [-0.420, 1.400, 0]], ['rightHand', 'rightLowerArm', [-0.660, 1.400, 0]],
  ['leftUpperLeg', 'hips', [0.092, 0.920, 0]], ['leftLowerLeg', 'leftUpperLeg', [0.092, 0.520, 0]],
  ['leftFoot', 'leftLowerLeg', [0.092, 0.100, 0]],
  ['rightUpperLeg', 'hips', [-0.092, 0.920, 0]], ['rightLowerLeg', 'rightUpperLeg', [-0.092, 0.520, 0]],
  ['rightFoot', 'rightLowerLeg', [-0.092, 0.100, 0]]
];

/** bone, from, to, radius — the mass hung on each bone. */
export const SEGS = [
  ['hips', [-0.05, 0.95, 0], [0.05, 0.95, 0], 0.118], ['spine', [0, 1.06, 0], [0, 1.20, 0], 0.102],
  ['chest', [0, 1.20, 0], [0, 1.35, 0], 0.112], ['neck', [0, 1.42, 0], [0, 1.56, 0], 0.047],
  ['head', [0, 1.605, 0], [0, 1.665, 0], 0.105],
  ['leftShoulder', [0.07, 1.4, 0], [0.15, 1.4, 0], 0.052], ['leftUpperArm', [0.16, 1.4, 0], [0.42, 1.4, 0], 0.048],
  ['leftLowerArm', [0.42, 1.4, 0], [0.66, 1.4, 0], 0.042], ['leftHand', [0.66, 1.4, 0], [0.76, 1.4, 0], 0.055],
  ['rightShoulder', [-0.07, 1.4, 0], [-0.15, 1.4, 0], 0.052], ['rightUpperArm', [-0.16, 1.4, 0], [-0.42, 1.4, 0], 0.048],
  ['rightLowerArm', [-0.42, 1.4, 0], [-0.66, 1.4, 0], 0.042], ['rightHand', [-0.66, 1.4, 0], [-0.76, 1.4, 0], 0.055],
  ['leftUpperLeg', [0.092, 0.92, 0], [0.092, 0.52, 0], 0.064], ['leftLowerLeg', [0.092, 0.52, 0], [0.092, 0.11, 0], 0.052],
  ['leftFoot', [0.092, 0.078, 0], [0.092, 0.078, 0.15], 0.050],
  ['rightUpperLeg', [-0.092, 0.92, 0], [-0.092, 0.52, 0], 0.064], ['rightLowerLeg', [-0.092, 0.52, 0], [-0.092, 0.11, 0], 0.052],
  ['rightFoot', [-0.092, 0.078, 0], [-0.092, 0.078, 0.15], 0.050]
];

const HEAD_TOP = 1.665 + 0.105;                      // metres, as authored
export const scaleFor = (stature) => stature / (HEAD_TOP * M_TO_IN);

// ---------------------------------------------------------------- the work
/**
 * What a person is actually doing. Not "poses" — tasks, each with the posture it
 * takes and what part of the body has to arrive somewhere.
 *
 * `work` names the landmark that must reach the fixture and what it must reach:
 * a hand at a basin, hips on a seat, the whole body on a mattress.
 */
export const ACTIVITIES = {
  'AT THE SINK': {
    at: 'sink', work: { bone: 'rightHand', to: 'top', want: 'basin' },
    face: 'toward', stand: 14,
    pose: { spine: [16, 0, 0], chest: [8, 0, 0], neck: [10, 0, 0],
            leftUpperArm: [-58, -22, -46], leftLowerArm: [-44, -34, 0],
            rightUpperArm: [-58, 22, 46], rightLowerArm: [-44, 34, 0] } },
  'COOKING': {
    at: 'cooktop', work: { bone: 'rightHand', to: 'top', want: 'worktop' },
    face: 'toward', stand: 15,
    pose: { spine: [10, 0, 0], chest: [4, 0, 0],
            leftUpperArm: [-46, -18, -50], leftLowerArm: [-36, -40, 0],
            rightUpperArm: [-52, 26, 46], rightLowerArm: [-40, 30, 0], head: [12, 0, 0] } },
  'AT THE WORKTOP': {
    at: 'top.galley', work: { bone: 'rightHand', to: 'top', want: 'worktop' },
    face: 'toward', stand: 15,
    pose: { spine: [12, 0, 0], chest: [5, 0, 0], neck: [8, 0, 0],
            leftUpperArm: [-50, -20, -48], leftLowerArm: [-40, -36, 0],
            rightUpperArm: [-50, 20, 48], rightLowerArm: [-40, 36, 0] } },
  'ON THE TOILET': {
    at: 'wc', work: { bone: 'hips', to: 'top', want: 'seat' },
    face: 'away', stand: 0, seated: true,
    pose: { hipsShift: [0, -0.42, 0],
            leftUpperLeg: [-84, 0, -4], rightUpperLeg: [-84, 0, 4],
            leftLowerLeg: [84, 0, 0], rightLowerLeg: [84, 0, 0],
            spine: [14, 0, 0], chest: [6, 0, 0],
            leftUpperArm: [-28, -8, -54], leftLowerArm: [-46, -20, 0],
            rightUpperArm: [-28, 8, 54], rightLowerArm: [-46, 20, 0] } },
  'EATING AT THE TABLE': {
    at: 'bench.W', partner: 'table', work: { bone: 'hips', to: 'top', want: 'seat' },
    face: 'partner', stand: 0, seated: true,
    pose: { hipsShift: [0, -0.42, 0],
            leftUpperLeg: [-84, 0, -4], rightUpperLeg: [-84, 0, 4],
            leftLowerLeg: [84, 0, 0], rightLowerLeg: [84, 0, 0],
            spine: [8, 0, 0],
            leftUpperArm: [-40, -14, -50], leftLowerArm: [-52, -46, 0],
            rightUpperArm: [-62, 18, 44], rightLowerArm: [-96, 48, 0], head: [10, 0, 0] } },
  'WORKING AT THE TABLE': {
    at: 'bench.W', partner: 'table', work: { bone: 'hips', to: 'top', want: 'seat' },
    face: 'partner', stand: 0, seated: true,
    pose: { hipsShift: [0, -0.42, 0],
            leftUpperLeg: [-84, 0, -4], rightUpperLeg: [-84, 0, 4],
            leftLowerLeg: [84, 0, 0], rightLowerLeg: [84, 0, 0],
            spine: [14, 0, 0], chest: [6, 0, 0], neck: [10, 0, 0],
            leftUpperArm: [-48, -16, -48], leftLowerArm: [-54, -40, 0],
            rightUpperArm: [-48, 16, 48], rightLowerArm: [-54, 40, 0], head: [14, 0, 0] } },
  'IN BED': {
    at: 'mattress', work: { bone: 'hips', to: 'top', want: 'mattress' },
    face: 'along', stand: 0, lying: true,
    pose: { hipsShift: [0, -0.86, 0],
            leftUpperLeg: [-88, 0, -3], rightUpperLeg: [-88, 0, 3],
            leftLowerLeg: [6, 0, 0], rightLowerLeg: [6, 0, 0],
            spine: [-88, 0, 0], chest: [4, 0, 0], neck: [10, 0, 0],
            leftUpperArm: [0, 0, -76], rightUpperArm: [0, 0, 76],
            leftLowerArm: [0, -18, -8], rightLowerArm: [0, 18, 8] } },
  'SHOWERING': {
    at: 'shower.pan', work: { bone: 'leftFoot', to: 'top', want: 'the pan' },
    face: 'toward', stand: 0,
    pose: { leftUpperArm: [0, 0, 34], leftLowerArm: [0, -70, 40],
            rightUpperArm: [0, 0, -34], rightLowerArm: [0, 70, -40],
            head: [-8, 0, 0], spine: [2, 0, 0] } },
  'CLEANING THE FLOOR': {
    // On your knees. A standing man's hand stops thirty-two inches from his shoulder
    // and his shoulder is fifty-nine inches up, so the floor is a foot beyond him
    // however far he leans: posed upright and stooping, this activity was measuring
    // an impossibility and calling it a fault in the deck. You kneel to wash a floor.
    at: 'deck.fore', work: { bone: 'rightHand', to: 'floor', want: 'the floor' },
    face: 'toward', stand: 0, kneel: 10,
    pose: { hipsShift: [0, -0.42, 0],
            leftUpperLeg: [-92, 0, -8], rightUpperLeg: [-92, 0, 8],
            leftLowerLeg: [88, 0, 0], rightLowerLeg: [88, 0, 0],
            spine: [58, 0, 0], chest: [18, 0, 0],
            leftUpperArm: [-52, -10, -50], leftLowerArm: [-34, -24, 0],
            rightUpperArm: [-128, 10, 46], rightLowerArm: [-26, 22, 0] } },
  'REACHING THE HIGH SHELF': {
    at: 'cab.galley', work: { bone: 'rightHand', to: 'over', want: 'overhead' },
    face: 'toward', stand: 16,
    pose: { rightUpperArm: [0, 0, -168], rightLowerArm: [0, 10, -8],
            leftUpperArm: [0, 0, -64], leftLowerArm: [0, -16, -6],
            spine: [-6, 0, 0], head: [-16, 0, 0] } },
  'STANDING IN THE DOOR': {
    at: 'door.entry', work: null, face: 'along', stand: 0,
    pose: { leftUpperArm: [0, 0, -72], rightUpperArm: [0, 0, 72],
            leftLowerArm: [0, -14, -6], rightLowerArm: [0, 14, 6] } }
};
export const ACTIVITY_NAMES = Object.keys(ACTIVITIES);

// ---------------------------------------------------------------- kinematics
const mul = (A, B) => {
  const C = new Array(9);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++)
    C[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c];
  return C;
};
const apply = (R, v) => [
  R[0] * v[0] + R[1] * v[1] + R[2] * v[2],
  R[3] * v[0] + R[4] * v[1] + R[5] * v[2],
  R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
/** three.js Euler 'XYZ': M = Rx · Ry · Rz. */
function euler(x, y, z) {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(x), Math.sin(x), Math.cos(y), Math.sin(y), Math.cos(z), Math.sin(z)];
  const Rx = [1, 0, 0, 0, cx, -sx, 0, sx, cx];
  const Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
  const Rz = [cz, -sz, 0, sz, cz, 0, 0, 0, 1];
  return mul(mul(Rx, Ry), Rz);
}

/** Forward kinematics in rig space. Returns world rotation and position per bone. */
export function solve(poseAngles = {}) {
  const bind = {}, parent = {};
  for (const [n, p, pos] of RIG) { bind[n] = pos; parent[n] = p; }
  const out = {};
  const shift = poseAngles.hipsShift || [0, 0, 0];
  for (const [n, p] of RIG.map(r => [r[0], r[1]])) {
    const a = poseAngles[n] || [0, 0, 0];
    const R = euler(a[0] * DEG, a[1] * DEG, a[2] * DEG);
    if (!p) {
      out[n] = { R, t: [bind[n][0] + shift[0], bind[n][1] + shift[1], bind[n][2] + shift[2]] };
      continue;
    }
    const off = [bind[n][0] - bind[p][0], bind[n][1] - bind[p][1], bind[n][2] - bind[p][2]];
    const pw = out[p];
    const t = apply(pw.R, off);
    out[n] = { R: mul(pw.R, R), t: [pw.t[0] + t[0], pw.t[1] + t[1], pw.t[2] + t[2]] };
  }
  return out;
}

/** A capsule's two ends and radius, skinned rigidly to its bone. */
export function segments(fk) {
  const bind = {}; for (const [n, , pos] of RIG) bind[n] = pos;
  return SEGS.map(([bone, f, t, r]) => {
    const b = fk[bone], o = bind[bone];
    const put = (p) => {
      const local = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
      const w = apply(b.R, local);
      return [b.t[0] + w[0], b.t[1] + w[1], b.t[2] + w[2]];
    };
    return { bone, a: put(f), b: put(t), r };
  });
}

/**
 * Put the solved figure in the building: scale to stature, turn to face, drop the
 * feet on the floor, and convert rig (Y up, metres) to world (Z up, inches).
 */
export function place(fk, { stature = 72, at = [0, 0], floor = 0, facing = 0, rest = null } = {}) {
  const S = M_TO_IN * scaleFor(stature);
  const c = Math.cos(facing), s = Math.sin(facing);
  const segs = segments(fk);
  // What is holding the body up. Standing, it is the lowest point — the soles. Sitting,
  // it is the underside of the hips, and a seated figure dropped by its lowest point
  // stands *on* the toilet with its feet on the seat, which is what this did.
  let lowest = Infinity;
  if (rest) {
    for (const g of segs) if (g.bone === rest) lowest = Math.min(lowest, g.a[1] - g.r, g.b[1] - g.r);
  }
  if (!isFinite(lowest)) for (const g of segs) lowest = Math.min(lowest, g.a[1] - g.r, g.b[1] - g.r);
  const conv = (p) => {
    const x = p[0] * S, y = p[2] * S, z = (p[1] - lowest) * S + floor;
    return [at[0] + x * c - y * s, at[1] + x * s + y * c, z];
  };
  return {
    segments: segs.map(g => ({ bone: g.bone, a: conv(g.a), b: conv(g.b), r: g.r * S })),
    bone: Object.fromEntries(Object.entries(fk).map(([n, b]) => [n, conv(b.t)])),
    scale: S
  };
}

/** A capsule as a box, which is all the collision test needs at this resolution. */
const boxOf = (g) => ({
  lo: [0, 1, 2].map(i => Math.min(g.a[i], g.b[i]) - g.r),
  hi: [0, 1, 2].map(i => Math.max(g.a[i], g.b[i]) + g.r)
});

/** What the body runs into, named by member and by limb. */
const GROUND = new Set(['deck', 'joist', 'plate', 'chassis', 'wellcap']);
const FEET = new Set(['leftFoot', 'rightFoot', 'leftLowerLeg', 'rightLowerLeg']);

/**
 * Everything a body can walk into — which is not `world.solids()`.
 *
 * `solids()` drops openings, ports and **runs**, and runs are the hundred and
 * thirteen wires and pipes in this trailer. Every collision number in this project
 * was computed against a building with its services deleted: a man could stand
 * with his head through a water main and be reported clear. An opening is genuinely
 * not there; a half-inch PEX line at shoulder height very much is.
 */
export function obstacles(world) {
  return world.all().filter(e => e.kind !== 'opening' && e.kind !== 'port');
}

export function collisions(world, body, { ignore = new Set(), slack = 0.5 } = {}) {
  const hits = [];
  for (const g of body.segments) {
    const b = boxOf(g);
    for (const e of obstacles(world)) {
      if (ignore.has(e.id)) continue;
      // Standing on the floor is not a collision with the floor. Reported flat, a
      // seated figure with its feet on the deck came back clashing with the deck,
      // the joists under it and the sole plate it was standing beside.
      if (FEET.has(g.bone) && GROUND.has(e.kind)) continue;
      const ov = [0, 1, 2].map(i => Math.min(b.hi[i], e.hi[i]) - Math.max(b.lo[i], e.lo[i]));
      if (ov.some(o => o <= slack)) continue;
      hits.push({ bone: g.bone, id: e.id, kind: e.kind, layer: e.layer, depth: +Math.min(...ov).toFixed(1) });
    }
  }
  return hits.sort((a, b) => b.depth - a.depth);
}

// ---------------------------------------------------------------- the arm
/** Arm links from the anthropometry, in inches: acromion-elbow, elbow-fingertip. */
export function arm(stature = 72) {
  const f = figure(stature);
  const upper = +(f.shoulder - f.elbow).toFixed(2);
  const fore = +(f.elbow - f.fingertip).toFixed(2);
  const S = M_TO_IN * scaleFor(stature);
  return { upper, fore, span: +(upper + fore).toFixed(2),
           rUpper: 0.048 * S, rFore: 0.042 * S, rHand: 0.055 * S };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mulS = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return mulS(a, 1 / l); };

/**
 * Two links, one shoulder, one point to touch.
 *
 * The rig's own arm is short: shoulder joint to fingertip measures 24 in on a six
 * foot figure where Drillis & Contini put it at 32. The rig was validated against
 * standing heights and an arm length is not a height, so nobody noticed. Reaches
 * are therefore solved with the anthropometry's arm and drawn with the mesh's
 * radii — the length from figure.js, the thickness from the rig.
 *
 * `swivel` is the elbow's position on the cone of solutions. It is a parameter and
 * not a guess because an arm has a swivel and a person uses it: told to hang the
 * elbow low, the model reached across a worktop by putting its elbow inside the
 * cupboard and then reported the cupboard.
 */
export function solveArm(shoulder, target, { upper, fore }, swivel = 0) {
  const v = sub(target, shoulder);
  const d = len(v);
  const span = upper + fore;
  const short = Math.abs(upper - fore);
  const reached = d <= span + 1e-6 && d >= short - 1e-6;
  // Out of range: the arm points at it, straight, and stops where it stops. The
  // hand's distance from the target is then exactly how far short the reach fell.
  const u = norm(v);
  const dd = Math.min(Math.max(d, short), span);
  const cos = (dd * dd + upper * upper - fore * fore) / (2 * upper * dd);
  const th = Math.acos(Math.min(1, Math.max(-1, cos)));
  // Two axes across the reach direction, so the elbow can be swung anywhere round
  // it. Elbow-down was the first guess and it is wrong the moment the reach is
  // horizontal: reaching across a worktop it put the elbow inside the cupboard and
  // then reported the cupboard as an obstruction. An arm has a swivel. Use it.
  let e1 = sub([0, 0, -1], mulS(u, dot([0, 0, -1], u)));
  if (len(e1) < 0.05) e1 = sub([1, 0, 0], mulS(u, dot([1, 0, 0], u)));
  e1 = norm(e1);
  const e2 = norm([u[1] * e1[2] - u[2] * e1[1], u[2] * e1[0] - u[0] * e1[2], u[0] * e1[1] - u[1] * e1[0]]);
  const off = add(mulS(e1, Math.cos(swivel)), mulS(e2, Math.sin(swivel)));
  const elbow = add(shoulder, add(mulS(u, Math.cos(th) * upper), mulS(off, Math.sin(th) * upper)));
  const hand = reached ? target : add(shoulder, mulS(u, span));
  return { shoulder, elbow, hand, reached, swivel: +swivel.toFixed(2),
           need: +d.toFixed(1), span: +span.toFixed(1),
           short: +Math.max(0, d - span).toFixed(1),
           effort: +Math.min(1, d / span).toFixed(2) };
}


/**
 * Put the working hand on the work, and let the other arm hang.
 *
 * The arms were the last part of this model still being asserted rather than
 * solved, and they were the part doing the most damage: the washing-up pose held a
 * left arm out sideways at forty-six degrees, which at the galley sink put a hand
 * seventeen inches into the bathroom partition and reported the partition. Nobody
 * washes up like that. The hand goes where the work is; the elbow goes wherever it
 * has to; the other arm hangs.
 *
 * The swivel is chosen the same way as in reach.js — the least obstructed of
 * twenty-four — so what survives is a thing you genuinely cannot get an arm past.
 */
export function armsOn(world, body, { stature = 72, work = null, side = 'right',
                                      rest = null, floor = -Infinity, ignore = new Set() } = {}) {
  const A = arm(stature);
  const obs = obstacles(world).filter(e => !ignore.has(e.id))
    .map(e => ({ id: e.id, lo: e.lo, hi: e.hi }));
  const other = side === 'right' ? 'left' : 'right';
  const bones = (sd) => [`${sd}Shoulder`, `${sd}UpperArm`, `${sd}LowerArm`, `${sd}Hand`];
  const keep = new Set([...bones('left'), ...bones('right')]);
  const segs = body.segments.filter(g => !keep.has(g.bone));
  const shoulderSeg = (sd) => body.segments.find(g => g.bone === `${sd}Shoulder`);
  const limbFor = (sd, target) => {
    const sh = body.bone[`${sd}UpperArm`];
    let best = null;
    for (let k = 0; k < 24; k++) {
      const sol = solveArm(sh, target, A, (k / 24) * 2 * Math.PI);
      const limb = [
        { bone: `${sd}UpperArm`, a: sol.shoulder, b: sol.elbow, r: A.rUpper },
        { bone: `${sd}LowerArm`, a: sol.elbow, b: sol.hand, r: A.rFore },
        { bone: `${sd}Hand`, a: sol.hand, b: sol.hand, r: A.rHand }
      ];
      let pen = 0, n = 0;
      for (const g of limb) {
        const lo = [0, 1, 2].map(i => Math.min(g.a[i], g.b[i]) - g.r);
        const hi = [0, 1, 2].map(i => Math.max(g.a[i], g.b[i]) + g.r);
        for (const e of obs) {
          const ov = [0, 1, 2].map(i => Math.min(hi[i], e.hi[i]) - Math.max(lo[i], e.lo[i]));
          if (ov.some(o => o <= 0.5)) continue;
          pen += Math.min(...ov); n++;
        }
      }
      const cost = pen * 100 + n * 10 + sol.elbow[2] * 0.01;
      if (!best || cost < best.cost) best = { cost, sol, limb };
    }
    return best;
  };
  const out = { ...body, segments: segs.slice(), reach: null };
  for (const sd of [side, other]) {
    const sq = shoulderSeg(sd);
    if (sq) out.segments.push(sq);
    // The idle arm hangs: a point a forearm's length below the shoulder and a
    // little forward of it, which is where an arm is when it is not doing anything.
    const knee = body.bone[`${sd}LowerLeg`];
    const t = (sd === side && work) ? work
      : rest === 'knees' && knee ? [knee[0], knee[1], knee[2] + 3]
      : [body.bone[`${sd}UpperArm`][0], body.bone[`${sd}UpperArm`][1],
         // An arm hangs until the floor stops it. On all fours the idle hand hung a
         // full span from a shoulder already close to the deck and finished up
         // inside joist.49 — a man scrubbing the floor with one hand through it.
         Math.max(floor + 2, body.bone[`${sd}UpperArm`][2] - A.span * 0.92)];
    const r = limbFor(sd, t);
    out.segments.push(...r.limb);
    if (sd === side && work) out.reach = r.sol;
  }
  return out;
}

// ---------------------------------------------------------------- the test
/**
 * Do the work and report whether the building let you.
 *
 * Three questions per activity, and they are different questions: does the body
 * fit (collisions), does the hand or the hips arrive where the fixture is (the
 * work), and is there room over your head.
 */
/**
 * The thing you walk up to, which is not always the thing you are using.
 *
 * A hob is sixteen inches by fourteen, so its "narrow side" is a coin toss, and the
 * toss put the cook at the north end of the galley reaching down the length of it.
 * And once the galley top was cut into a run and three rails around the sink, the
 * run's own shortest side became its *south* face — the side the sink is on — so
 * the clearance in front of the worktop came back as one inch.
 *
 * What you actually walk up to is the carcass the thing is set into, whose open
 * face is not in doubt. Height matters as much as plan: a ceiling contains every
 * fixture in the building in plan, and the moment one existed the cook was held to
 * be standing at it, which put him at the front door.
 */
export function carrierOf(world, target, skip = false) {
  if (skip) return null;
  let best = null;
  for (const e of world.all()) {
    if (e.id === target.id || e.layer !== 'interior') continue;
    if (!(e.lo[0] <= target.lo[0] + 0.5 && e.hi[0] >= target.hi[0] - 0.5 &&
          e.lo[1] <= target.lo[1] + 0.5 && e.hi[1] >= target.hi[1] - 0.5)) continue;
    if (e.hi[2] < target.lo[2] - 2 || e.lo[2] > target.hi[2] + 2) continue;
    const area = (e.hi[0] - e.lo[0]) * (e.hi[1] - e.lo[1]);
    if (!best || area > best.area) best = { el: e, area };
  }
  return best ? best.el : null;
}

export function attempt(world, name, { stature = 72 } = {}) {
  const A = ACTIVITIES[name];
  if (!A) return null;
  const target = world.get(A.at);
  if (!target) return { activity: name, ok: false, why: `no ${A.at} in this building` };
  const deck = world.all().filter(e => e.meta.role === 'floor sheathing');
  const floorZ = deck.length ? Math.max(...deck.map(e => e.hi[2])) : 0;
  const partner = A.partner ? world.get(A.partner) : null;

  // You stand off the run, not off the appliance dropped into it.
  //
  // A hob is sixteen inches by fourteen, so its "narrow side" is a coin toss, and
  // the toss put the cook at the north end of the galley reaching down the length
  // of it — arm through the flue chase, hip against the water heater, nine
  // collisions, none of them about the kitchen. What you actually walk up to is the
  // carcass the hob is set in, whose open face is not in doubt.
  const carrier = carrierOf(world, target, A.seated || A.lying);
  const stood = carrier || target;
  // where to stand: in front of the fixture's nearest long face, or on it
  const c = [0, 1].map(i => (target.lo[i] + target.hi[i]) / 2);
  const along = (stood.hi[0] - stood.lo[0]) > (stood.hi[1] - stood.lo[1]) ? 1 : 0;
  const mid = [(world.datum ? 50 : 50), 120];
  const sgn = (stood.lo[along] + stood.hi[along]) / 2 > mid[along] ? -1 : 1;
  const at = c.slice();
  // You stand off a fixture's narrow side and face it. Offsetting in x and then
  // facing along y put the figure beside the galley with its back to the wall and
  // its legs inside the cupboard, which read as seventeen collisions.
  let facing = along === 0 ? (sgn > 0 ? Math.PI / 2 : -Math.PI / 2) : (sgn > 0 ? Math.PI : 0);
  if (A.face === 'toward') facing = Math.atan2(c[1] - at[1], c[0] - at[0]) - Math.PI / 2;
  // Stand off the near face, on the side you are approaching from. Inverted, this
  // put the figure fourteen inches *inside* the galley run and then reported
  // sixteen collisions with it — a person standing in a cupboard, blamed on the
  // cupboard.
  if (A.stand) at[along] = (sgn > 0 ? stood.hi[along] : stood.lo[along]) + sgn * A.stand;
  if (A.face === 'away') facing += Math.PI;
  if (A.face === 'along') facing = Math.PI / 2;
  if (A.face === 'partner' && partner) {
    const pc = [0, 1].map(i => (partner.lo[i] + partner.hi[i]) / 2);
    facing = Math.atan2(pc[1] - c[1], pc[0] - c[0]) - Math.PI / 2;
  }

  // seated and lying figures sit ON the thing, not on the floor
  const surface = (A.seated || A.lying) ? target.hi[2] : floorZ;
  const fk = solve(A.pose);
  // the hips of a seated pose are already dropped by hipsShift; put the seat under them
  let body = place(fk, { stature, at, floor: surface, facing,
    // Lying, what holds you up is whatever touches first — the shoulder blades, the
    // buttocks, the heels — so it is the lowest point of the whole body. Dropped by
    // the spine alone the hips hung five inches inside the mattress.
    rest: A.seated ? 'hips' : null });

  const ignore = new Set([A.at]);
  if (A.seated || A.lying) { if (partner) ignore.add(partner.id); }
  if (A.at === 'mattress') ignore.add('bed.base');
  if (carrier) ignore.add(carrier.id);
  // You do not stand in a doorway with the door shut.
  if (A.at === 'door.entry') for (const e of world.all()) if (e.kind === 'leaf') ignore.add(e.id);

  // Where the working hand has to arrive: on the surface, a third of the way in
  // from the edge you are standing at, which is where you put a hand rather than on
  // the front lip or against the back wall.
  const f = figure(stature);
  let workPoint = null;
  if (A.work && (A.work.bone === 'rightHand' || A.work.bone === 'leftHand')) {
    const surfZ = A.work.to === 'floor' ? floorZ
      : A.work.to === 'over' ? target.hi[2] + 24 : target.hi[2];
    const pt = [c[0], c[1], surfZ + 2];
    // The floor is not a fixture with a centre you reach for; it is under your feet.
    // Aimed at the middle of `deck.fore` the hand came back ten inches short of a
    // floor the man was standing on.
    if (A.work.to === 'floor') {
      const fwd = [Math.sin(facing) * -1, Math.cos(facing)];
      const d = A.kneel || 16;
      pt[0] = at[0] + fwd[0] * d; pt[1] = at[1] + fwd[1] * d; pt[2] = floorZ + 2;
    } else {
      const d = [target.hi[0] - target.lo[0], target.hi[1] - target.lo[1]];
      const k = Math.abs(at[0] - c[0]) > Math.abs(at[1] - c[1]) ? 0 : 1;
      pt[k] = c[k] + Math.sign(at[k] - c[k]) * d[k] / 6;
    }
    workPoint = pt;
  }
  // Only where a hand has a job. A lying figure's arms were solved to "hanging
  // below the shoulder", which for a man on his back is straight down through the
  // mattress, the bed base and the water tank: seven collisions, and every one of
  // them the instrument's.
  // Sitting down, the hands go on the knees. Left in the authored pose they were
  // braced twenty inches out from the centreline, which on the WC is a forearm
  // through the vanity — a man sitting like a gunslinger, reported as a fit-out
  // fault.
  if (!workPoint && A.seated) {
    body = armsOn(world, body, { stature, rest: 'knees', floor: surface, ignore });
  }
  if (workPoint) {
    // Reaching into a bowl means going past its rim, and the rim of an undermounted
    // sink is the worktop it is hung from. Counted flat it is the counter stopping
    // you from using the sink in it.
    // The rim of a hole is not an obstruction, and a rim is wider than the hole.
    // Cutting the galley top into a run and three rails around the sink put a 3.5 in
    // strip of stone at the front of the bowl, and the arm that has to go over it —
    // which is what the front of a counter is for — came back as a collision with
    // the counter.
    for (const e of world.all()) {
      if (e.layer !== 'interior') continue;
      const overIt = e.hi[0] > target.lo[0] && e.lo[0] < target.hi[0] &&
                     e.hi[1] > target.lo[1] && e.lo[1] < target.hi[1] &&
                     e.lo[2] >= target.hi[2] - 0.5;
      const surround = Math.abs(e.hi[2] - target.hi[2]) < 2 &&
                       e.hi[0] > target.lo[0] - 6 && e.lo[0] < target.hi[0] + 6 &&
                       e.hi[1] > target.lo[1] - 6 && e.lo[1] < target.hi[1] + 6;
      if (overIt || surround) ignore.add(e.id);
    }
    body = armsOn(world, body, { stature, work: workPoint, floor: floorZ,
      side: A.work.bone === 'leftHand' ? 'left' : 'right', ignore });
  }
  const hits = collisions(world, body, { ignore });

  // did the work arrive?
  let work = null;
  if (workPoint) {
    // Solved, not posed: the hand is either on the point or it is short of it, and
    // "short of it" is now a statement about the trailer rather than about the
    // three euler angles somebody typed for this activity.
    const r = body.reach;
    work = { bone: A.work.bone, want: A.work.want, at: workPoint.map(v => +v.toFixed(1)),
             reached: !!(r && r.reached), off: r ? r.short : null,
             effort: r ? r.effort : null, ok: !!(r && r.reached) };
  } else if (A.work) {
    // Where the body actually touches, not where its joint centre is. The hip
    // joint sits five inches above what you sit on, which is the hip capsule's own
    // radius, and reporting that as "five inches too high" was the metric being
    // wrong about a figure that was sitting down perfectly well.
    const seg = body.segments.filter(g => g.bone === A.work.bone);
    const p = body.bone[A.work.bone];
    const touch = seg.length
      ? Math.min(...seg.map(g => Math.min(g.a[2], g.b[2]) - g.r))
      : p[2];
    const useTouch = A.work.bone === 'hips' || A.work.bone === 'leftFoot';
    const z = useTouch ? touch : p[2];
    const surfaceZ = A.work.to === 'floor' ? floorZ
      : A.work.to === 'over' ? target.hi[2] + 24 : target.hi[2];
    work = { bone: A.work.bone, want: A.work.want,
      handZ: +z.toFixed(0), surfaceZ: +surfaceZ.toFixed(0),
      off: +(z - surfaceZ).toFixed(0) };
    work.ok = Math.abs(work.off) <= (useTouch ? 3 : 8);
  }

  const headTop = Math.max(...body.segments.filter(g => g.bone === 'head').map(g => Math.max(g.a[2], g.b[2]) + g.r));
  const ceiling = hits.filter(h => h.bone === 'head' || h.bone === 'neck');
  return {
    activity: name, at: A.at, stand: at.map(v => +v.toFixed(0)), facing: +(facing * 180 / Math.PI).toFixed(0),
    headTop: +headTop.toFixed(0), work,
    collisions: hits.slice(0, 6), clash: hits.length,
    headClash: ceiling.length,
    ok: hits.length === 0 && (!work || work.ok),
    body
  };
}

/** Everybody, everywhere, once. */
export function everybody(world, { stature = 72 } = {}) {
  return ACTIVITY_NAMES.map(n => attempt(world, n, { stature })).filter(Boolean);
}
