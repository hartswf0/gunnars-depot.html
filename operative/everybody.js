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
    at: 'deck.fore', work: { bone: 'rightHand', to: 'floor', want: 'the floor' },
    face: 'toward', stand: 0,
    pose: { hipsShift: [0, -0.26, 0],
            leftUpperLeg: [-70, 0, -6], rightUpperLeg: [-70, 0, 6],
            leftLowerLeg: [92, 0, 0], rightLowerLeg: [92, 0, 0],
            spine: [30, 0, 0], chest: [16, 0, 0],
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

export function collisions(world, body, { ignore = new Set(), slack = 0.5 } = {}) {
  const hits = [];
  for (const g of body.segments) {
    const b = boxOf(g);
    for (const e of world.solids()) {
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

// ---------------------------------------------------------------- the test
/**
 * Do the work and report whether the building let you.
 *
 * Three questions per activity, and they are different questions: does the body
 * fit (collisions), does the hand or the hips arrive where the fixture is (the
 * work), and is there room over your head.
 */
export function attempt(world, name, { stature = 72 } = {}) {
  const A = ACTIVITIES[name];
  if (!A) return null;
  const target = world.get(A.at);
  if (!target) return { activity: name, ok: false, why: `no ${A.at} in this building` };
  const deck = world.all().filter(e => e.meta.role === 'floor sheathing');
  const floorZ = deck.length ? Math.max(...deck.map(e => e.hi[2])) : 0;
  const partner = A.partner ? world.get(A.partner) : null;

  // where to stand: in front of the fixture's nearest long face, or on it
  const c = [0, 1].map(i => (target.lo[i] + target.hi[i]) / 2);
  const along = (target.hi[0] - target.lo[0]) > (target.hi[1] - target.lo[1]) ? 1 : 0;
  const mid = [(world.datum ? 50 : 50), 120];
  const sgn = c[along] > mid[along] ? -1 : 1;
  const at = c.slice();
  // You stand off a fixture's narrow side and face it. Offsetting in x and then
  // facing along y put the figure beside the galley with its back to the wall and
  // its legs inside the cupboard, which read as seventeen collisions.
  let facing = along === 0 ? (sgn > 0 ? Math.PI / 2 : -Math.PI / 2) : (sgn > 0 ? Math.PI : 0);
  // Stand off the near face, on the side you are approaching from. Inverted, this
  // put the figure fourteen inches *inside* the galley run and then reported
  // sixteen collisions with it — a person standing in a cupboard, blamed on the
  // cupboard.
  if (A.stand) at[along] = (sgn > 0 ? target.hi[along] : target.lo[along]) + sgn * A.stand;
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
  const body = place(fk, { stature, at, floor: surface, facing,
    rest: A.seated ? 'hips' : A.lying ? 'spine' : null });

  const ignore = new Set([A.at]);
  if (A.seated || A.lying) { if (partner) ignore.add(partner.id); }
  if (A.at === 'mattress') ignore.add('bed.base');
  // You do not stand in a doorway with the door shut.
  if (A.at === 'door.entry') for (const e of world.all()) if (e.kind === 'leaf') ignore.add(e.id);
  const hits = collisions(world, body, { ignore });

  // did the work arrive?
  const f = figure(stature);
  let work = null;
  if (A.work) {
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
