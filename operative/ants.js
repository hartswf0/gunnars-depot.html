// operative/ants.js — a colony that forages for defects.
//
// Every instrument in this project so far has been one oracle with many samples.
// The ray scanner knows the whole geometry and fires 79,000 rays through it; the
// CT knows the whole geometry and floods it. Both are exact, and both are only as
// good as the question they were built to ask.
//
// A colony is a different kind of instrument: many weak local sensors, none of
// which can see the building, reaching agreement. An ant knows nothing except
// what its own lidar returns from where it is standing. It cannot be told where
// the defects are, because nothing tells it — it walks the surface and reports
// what surprised it.
//
// The measurement is not any one ant's report. It is **how many independent ants,
// arriving by different routes, reported the same thing.** A finding one ant saw
// once is a rumour. A finding four ants confirmed after following each other's
// trail there is a defect.
//
// The stigmergy is borrowed straight from the formicary engine, and so are its
// three hard rules, because they are what stop a colony from being a mob:
//
//   * pheromone is evidence, not a launch command — following is bounded, and
//     each ant has its own private threshold
//   * marking is pulsatile and individual — an experienced or crowded ant marks
//     less, so one enthusiastic returner cannot paint a railway
//   * there is always a scout floor — some fraction ignores the trail entirely,
//     which is the only reason the second defect ever gets found
//
// Food is a gap. The nest is the door.

import { cast, bounds, sphereDirections } from './radiography.js';
import { LABEL, labelAt } from './tomography.js';

/** Deterministic. Two runs of the same colony are the same run. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/** What an ant can be surprised by. */
export const KINDS = {
  HOLE:     { label: 'walked out of the building', weight: 1.0 },
  GAP:      { label: 'saw daylight from inside',   weight: 0.9 },
  CLASH:    { label: 'material inside material',   weight: 0.9 },
  UNJOINED: { label: 'crossed between two members the schedule says should be fastened', weight: 0.7 },
  CLIFF:    { label: 'the surface ended at nothing', weight: 0.6 },
  // Not a defect. A place where two members meet and no rule in the fastening
  // schedule has an opinion about it. `nailOff` reports the *count* of these every
  // time it runs — "84 contacts have no schedule entry" — and nobody has ever
  // looked at the list. The colony walks it.
  UNRULED:  { label: 'two members meet and no rule covers it', weight: 0.25 },
  VOID:     { label: 'a cavity behind the surface', weight: 0.4 }
};

export class Colony {
  /**
   * @param occ  occluders — a world's or a mesh's, from radiography
   * @param opts.world     optional: gives ants ids and lets them read the joints
   * @param opts.enclosure optional: a flooded voxel grid, so an ant knows inside from out
   */
  constructor(occ, {
    world = null, enclosure = null, n = 60, seed = 1,
    step = 1.6, lidar = 14, range = null, sight = 40,
    decay = 0.004, markRadius = 9, cell = 6, nest = null, indoorFraction = 0.5,
    lidarEvery = 1
  } = {}) {
    this.solids = occ.solids || occ;
    this.world = world;
    this.enclosure = enclosure;
    this.b = bounds(this.solids);
    this.R = range || Math.hypot(...this.b.size) * 1.2;
    this.rnd = rng(seed);
    this.stepLen = step;
    this.lidarRays = lidar;
    this.sight = sight;
    this.decay = decay;
    this.markRadius = markRadius;
    this.cell = cell;
    this.indoorFraction = indoorFraction;
    this.lidarEvery = Math.max(1, lidarEvery);
    this.tick = 0;
    this.marks = [];
    this.ledger = new Map();
    this.lost = 0;
    this.dirs = sphereDirections(Math.max(24, lidar * 3));
    this.nest = nest || this.findNest();
    this.schedule = null;    // set by `withSchedule`, so the module has no import cycle
    this.ants = [];
    for (let i = 0; i < n; i++) this.ants.push(this.hatch(i));
  }

  // ---------------------------------------------------------------- the nest
  /** The door, if there is one. Otherwise the middle of the floor. */
  findNest() {
    if (this.world) {
      const door = this.world.all({ kind: 'opening' }).find(o => o.meta.type === 'door');
      if (door) return this.freeNear(
        [(door.lo[0] + door.hi[0]) / 2, (door.lo[1] + door.hi[1]) / 2, door.lo[2] + 6]);
    }
    return this.freeNear([this.b.c[0], this.b.c[1], this.b.lo[2] + this.b.size[2] * 0.15]);
  }

  /**
   * The nearest point to `p` that is not inside something, walking towards the
   * middle of the building.
   *
   * The nest was the middle of the door opening, and the door has a leaf in it, so
   * the nest was inside half an inch of plywood. Ants that failed to find a
   * surface fell back to the nest and stood in the door for the rest of the run —
   * a handful at any moment, permanently embedded, reporting from inside a solid.
   */
  freeNear(p) {
    if (!this.embedded(p)) return p;
    const to = norm(sub(this.b.c, p));
    for (let d = 2; d <= Math.max(...this.b.size); d += 2) {
      const q = add(p, mul(to, d));
      if (!this.embedded(q)) return q;
    }
    return p;
  }

  // ---------------------------------------------------------------- an ant
  hatch(i) {
    const r = this.rnd;
    const a = {
      id: i, p: null, n: [0, 0, 1], h: [1, 0, 0], on: null,
      phase: 'forage', carrying: null, age: 0, steps: 0, transfers: 0,
      // individual traits, so no two ants are the same instrument
      pheromoneGain: 0.7 + r() * 1.4,
      trailThreshold: 0.10 + r() * 0.34,
      exploreBias: 0.25 + r() * 0.7,
      markingRate: 0.25 + r() * 0.5,
      turn: 0.25 + r() * 0.5,
      successN: 0, fatigue: 0, markNext: 0, seen: new Set()
    };
    this.place(a);
    return a;
  }

  /** Which solid contains this point, if any. An ant is never allowed inside one. */
  embedded(p) {
    for (const e of this.solids) {
      if (e.tri) continue;
      if (p[0] > e.lo[0] && p[0] < e.hi[0] && p[1] > e.lo[1] && p[1] < e.hi[1] &&
          p[2] > e.lo[2] && p[2] < e.hi[2]) return e;
    }
    return null;
  }

  /** Put an ant down on the nearest surface below a scattered point. */
  place(a) {
    for (let tries = 0; tries < 40; tries++) {
      const p = [0, 1, 2].map(i => this.b.lo[i] + this.b.size[i] * (0.15 + this.rnd() * 0.7));
      // Dropped from inside a solid, the cast starts embedded, skips the surface
      // it is already past, and lands the ant *inside* the next thing down. The
      // colony then spends its life in the wall cavity reporting daylight.
      if (this.embedded(p)) continue;
      const hit = cast(p, [0, 0, -1], this.solids, this.b.size[2] * 1.2);
      if (!hit) continue;
      a.p = [p[0], p[1], p[2] - hit.t + 0.05];
      a.on = hit.id;
      a.n = [0, 0, 1];
      const t = this.rnd() * Math.PI * 2;
      a.h = [Math.cos(t), Math.sin(t), 0];
      return true;
    }
    a.p = this.freeNear(this.nest.slice()); a.n = [0, 0, 1]; a.on = null;
    return false;
  }

  // ---------------------------------------------------------------- stigmergy
  /** Marking is pulsatile: crowding and experience both make an ant mark less. */
  mark(a, s) {
    if (this.tick < a.markNext) return;
    const crowd = this.ants.reduce((k, o) =>
      k + (o !== a && len(sub(o.p, a.p)) < this.markRadius ? 1 : 0), 0);
    const brake = 1 / (1 + crowd * 0.6) / (1 + Math.max(0, a.successN - 1) * 0.08);
    const p = Math.min(0.72, a.markingRate * brake);
    if (this.rnd() > p) { a.markNext = this.tick + 2 + Math.floor(this.rnd() * 6); return; }
    this.marks.push({ p: a.p.slice(), s: Math.max(0.006, s * brake), born: this.tick, by: a.id });
    if (this.marks.length > 4000) this.marks.splice(0, this.marks.length - 4000);
    a.markNext = this.tick + 3 + Math.floor(this.rnd() * 7);
  }

  /** What an ant smells here, and which way it gets stronger. */
  sense(p) {
    let s = 0;
    const g = [0, 0, 0];
    for (const m of this.marks) {
      const d = sub(m.p, p), l = len(d);
      if (l > this.markRadius * 2.2) continue;
      const w = m.s / (1 + l * l * 0.02);
      s += w;
      if (l > 0.001) { const u = mul(d, w / l); g[0] += u[0]; g[1] += u[1]; g[2] += u[2]; }
    }
    return { s, g: len(g) > 1e-6 ? norm(g) : null };
  }

  // ---------------------------------------------------------------- the ledger
  key(kind, p) {
    const c = this.cell;
    return `${kind}@${Math.round(p[0] / c)},${Math.round(p[1] / c)},${Math.round(p[2] / c)}`;
  }
  report(a, kind, p, detail) {
    const k = this.key(kind, p);
    let f = this.ledger.get(k);
    if (!f) {
      f = { key: k, kind, at: p.map(v => +v.toFixed(1)), ants: new Set(), hits: 0,
            first: this.tick, last: this.tick, detail: detail || null, near: [] };
      this.ledger.set(k, f);
    }
    f.hits++; f.last = this.tick; f.ants.add(a.id);
    if (detail && !f.detail) f.detail = detail;
    if (detail && detail.near) for (const id of detail.near) if (!f.near.includes(id)) f.near.push(id);
    // Carrying a finding home is what lays the trail. An ant that reports and
    // keeps walking teaches the colony nothing.
    if (!a.carrying) { a.carrying = k; a.phase = 'return'; a.successN++; }
    return f;
  }

  // ---------------------------------------------------------------- the lidar
  /**
   * A fan around the ant, and what came back. It knows nothing about the building:
   * only how far each ray went and whether it stopped.
   */
  look(a) {
    const eye = add(a.p, mul(a.n, 0.25));
    const out = { escaped: 0, far: 0, near: Infinity, hits: [], escapedDirs: [] };
    for (let i = 0; i < this.lidarRays; i++) {
      const d = this.dirs[(i * 7 + a.id * 13 + this.tick) % this.dirs.length];
      // only the hemisphere it can see from the surface it is on
      const dir = dot(d, a.n) < 0 ? mul(d, -1) : d;
      const hit = cast(eye, dir, this.solids, this.sight);
      if (hit) { out.hits.push(hit); if (hit.t < out.near) out.near = hit.t; continue; }
      // "Nothing within forty inches" is not the same as "outside". In a twenty
      // foot room most rays from the floor travel further than that without
      // meeting anything, and taking the short miss for an escape had the whole
      // colony reporting daylight from the middle of the deck.
      const end = add(eye, mul(dir, this.sight));
      const there = this.labelOf(end);
      if (there === LABEL.MATERIAL) { out.far++; continue; }   // it hit a wall just past range
      // Either the CT says the ray ended outdoors, or there is no CT and we pay
      // for the long cast. Not both, and never "not enclosed", which folds
      // material and outside into one answer.
      if (there === LABEL.OUTSIDE || there === null) {
        const far = cast(eye, dir, this.solids, this.R);
        if (!far) { out.escaped++; out.escapedDirs.push(dir); } else out.far++;
      } else out.far++;
    }
    out.enclosure = out.hits.length / Math.max(1, this.lidarRays);
    return out;
  }

  /**
   * What the CT says about this point: enclosed air, material, or outside.
   *
   * This used to answer a yes/no — "is it enclosed" — which folded MATERIAL and
   * OUTSIDE into the same answer. A ray that stopped one inch past the lidar's
   * range ended *inside a wall*, was scored as having left the building, and
   * thirty-seven confirmed "gaps" were rays that hit something forty inches away.
   * Three states, three answers.
   */
  labelOf(p) {
    if (!this.enclosure) return null;
    return labelAt(this.enclosure, p);
  }
  inside(p) { const l = this.labelOf(p); return l === null ? null : l === LABEL.ENCLOSED; }

  // ---------------------------------------------------------------- one step
  walk(a) {
    a.age++;
    if (!a.p) return;

    // An ant that has ended up inside something is not a sensor, it is a bug with
    // opinions. Push it back out along the face it thinks it is standing on, and
    // report nothing this tick.
    const inSolid = this.embedded(a.p);
    if (inSolid) {
      a.stuck = (a.stuck || 0) + 1;
      // Out through the *nearest* face, not the one its normal points at. Two
      // members in flush contact share a plane: the surface of the sole plate is
      // also the underside of the door leaf, and an ant standing on the plate is
      // half a tenth inside the leaf. Pushed along its own normal it came out at
      // the top of the door, eighty inches up, on a face it had never touched.
      let axis = 0, dir = 1, best = Infinity;
      for (let i = 0; i < 3; i++) {
        const up = inSolid.hi[i] - a.p[i], down = a.p[i] - inSolid.lo[i];
        if (up < best)   { best = up;   axis = i; dir =  1; }
        if (down < best) { best = down; axis = i; dir = -1; }
      }
      a.p[axis] = (dir > 0 ? inSolid.hi[axis] : inSolid.lo[axis]) + dir * 0.06;
      a.n = [0, 0, 0]; a.n[axis] = dir;
      if (a.stuck > 3 || this.embedded(a.p)) { this.place(a); a.stuck = 0; }
      return;
    }
    a.stuck = 0;

    // 1. sense. The lidar is the expensive part, so an ant looks every few steps
    // rather than every step — which is also what an ant does.
    const eye = add(a.p, mul(a.n, 0.3));
    const look = (a.age % this.lidarEvery === a.id % this.lidarEvery)
      ? (a.lastLook = this.look(a))
      : (a.lastLook || { escaped: 0, far: 0, hits: [], escapedDirs: [], enclosure: 1 });

    // Am I indoors? Asked of the CT, this went silent exactly when it mattered:
    // take a wall panel off and the flood reaches everywhere, nothing is enclosed,
    // and every ant decides it is standing outside — so a colony that could not
    // find a missing wall was reporting a clean building. A gate that fails quiet
    // on the thing it is gating is worse than no gate.
    //
    // So it is asked locally instead, of the lidar itself: indoors is where most
    // of what you can see is close. That degrades — a room with a wall missing
    // still has a floor, a ceiling and three walls — where a flood collapses.
    //
    // And indoors requires a floor. Without that clause the wheel wells qualify:
    // a well is a box of four boards and a cap, open to the road underneath by
    // design, so an ant standing in one is surrounded on five sides and can see
    // the sky. Nineteen confirmed "gaps" in an intact trailer were ants in the
    // wheel arches, correctly sensing a hole that is supposed to be there.
    const floor = cast(eye, [0, 0, -1], this.solids, this.b.size[2] * 1.2);
    const indoors = look.enclosure >= this.indoorFraction && !!floor;
    a.indoors = indoors;

    // Daylight from inside. An ant that is surrounded and can still see out is
    // looking at a hole.
    if (indoors && look.escaped > 0) {
      const dir = look.escapedDirs[0];
      this.report(a, 'GAP', a.p, { rays: look.escaped, of: this.lidarRays,
        toward: dir.map(v => +v.toFixed(2)), near: a.on ? [a.on] : [] });
      this.mark(a, 0.05 * (look.escaped / this.lidarRays) * 3);
    }

    // Material inside material: fire into the surface. Whatever it meets before
    // leaving the member it is standing on is inside that member.
    if (a.on) {
      const me = this.solids.find(s => s.id === a.on);
      if (me) {
        // How far it is to the far side of the member the ant is standing on. A
        // joist directly under a deck is not material inside material, it is a
        // floor; only something met *before* leaving this member is a clash.
        const axis = a.n[0] ? 0 : a.n[1] ? 1 : 2;
        const thick = me.hi[axis] - me.lo[axis];
        const inward = cast(add(a.p, mul(a.n, -0.05)), mul(a.n, -1), this.solids, thick + 0.5);
        // A tank inside a bed platform is housed, not clashing: the carcass is
        // hollow and says which thing lives in it.
        const guest = inward && this.world ? this.world.get(inward.id) : null;
        const host = this.world ? this.world.get(a.on) : null;
        const housed = guest && host &&
          (guest.meta.hostedBy === host.id || host.meta.hostedBy === guest.id);
        if (inward && !housed && inward.id !== a.on && inward.t < thick - 0.15) {
          this.report(a, 'CLASH', a.p, { with: inward.id, into: a.on,
            depth: +(thick - inward.t).toFixed(2), near: [a.on, inward.id] });
          this.mark(a, 0.06);
        }
      }
    }

    // 2. choose a heading
    const smell = this.sense(a.p);
    if (a.phase === 'return') {
      // home, laying trail
      const home = sub(this.nest, a.p);
      if (len(home) < 8) {
        a.phase = 'forage'; a.carrying = null;
        a.fatigue = Math.min(0.9, a.fatigue + 0.08);
      } else {
        a.h = this.tangent(a, norm(home));
        this.mark(a, 0.03 + 0.02 * this.rnd());
      }
    } else {
      // Pheromone is evidence, not a command. Each ant has its own threshold, its
      // own gain, and a floor of pure exploration that no trail can suppress —
      // without it the whole colony piles onto the first defect and the second one
      // is never found.
      const evidence = Math.max(0, smell.s - a.trailThreshold);
      const follow = Math.min(0.5, evidence * (0.4 + a.pheromoneGain * 0.3)) * (1 - a.fatigue * 0.7);
      const scout = 0.03 + a.exploreBias * 0.12;
      const roll = this.rnd();
      if (smell.g && roll < follow) {
        a.h = this.tangent(a, smell.g);
        a.fatigue = Math.min(0.9, a.fatigue + 0.03);
      } else if (roll < follow + scout) {
        const t = this.rnd() * Math.PI * 2;
        a.h = this.tangent(a, norm([Math.cos(t), Math.sin(t), this.rnd() - 0.5]));
      } else {
        // a correlated random walk, which is what an ant actually does
        const w = (this.rnd() - 0.5) * a.turn;
        const side = norm(cross(a.n, a.h));
        a.h = this.tangent(a, norm(add(a.h, mul(side, w))));
      }
    }

    // 3. move, and try to stay on the surface
    const want = add(a.p, mul(a.h, this.stepLen));
    const lift = 0.6;
    const down = cast(add(want, mul(a.n, lift)), mul(a.n, -1), this.solids, lift + 0.9);
    if (down) {
      a.p = add(add(want, mul(a.n, lift)), mul(mul(a.n, -1), down.t - 0.04));
      if (down.id !== a.on) this.transfer(a, down.id);
      a.steps++;
      return;
    }
    this.edge(a, want);
  }

  /** Project a desired direction onto the surface the ant is standing on. */
  tangent(a, d) {
    const t = sub(d, mul(a.n, dot(d, a.n)));
    return len(t) > 1e-4 ? norm(t) : a.h;
  }

  /** Stepping from one member to another is where a joint either exists or does not. */
  transfer(a, to) {
    const from = a.on;
    a.on = to; a.transfers++;
    if (!this.world || !from || !to || from === to) return;
    const k = [from, to].sort().join('|');
    if (this.world.joints.has(k)) return;
    const A = this.world.get(from), B = this.world.get(to);
    if (!A || !B) return;
    // A door leaf has to be able to open. Anything explicitly hung, housed or
    // hosted is connected by something other than a nail.
    if (A.meta.fills || B.meta.fills) return;
    if (A.meta.hostedBy === B.id || B.meta.hostedBy === A.id) return;
    // The schedule decides which of the two findings this is. Where a rule exists
    // and the joint does not, it is a defect and the linter knows about it too.
    // Where no rule exists, it is a place in the building nobody has an opinion
    // about — which is a different thing, and worth walking.
    const ruled = this.schedule ? !!this.schedule(A, B) : null;
    this.report(a, ruled === false ? 'UNRULED' : 'UNJOINED', a.p,
      { from, to, ruled, near: [from, to] });
    this.mark(a, ruled === false ? 0.012 : 0.035);
  }

  /**
   * The surface ran out. Look around for somewhere to step; if there is nothing,
   * fall — and an ant that falls out of the building has found a hole in it.
   */
  edge(a, want) {
    const around = [];
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * Math.PI * 2;
      const side = norm(cross(a.n, a.h));
      const d = norm(add(add(mul(a.h, Math.cos(t)), mul(side, Math.sin(t))), mul(a.n, -0.6)));
      const hit = cast(want, d, this.solids, this.stepLen * 3);
      if (hit) around.push({ hit, d });
    }
    if (around.length) {
      const pick = around[Math.floor(this.rnd() * around.length)];
      const np = add(want, mul(pick.d, pick.hit.t - 0.05));
      const was = a.on;
      a.p = np;
      a.n = this.normalAt(np, pick.hit.id) || a.n;
      a.h = this.tangent(a, a.h);
      if (pick.hit.id !== was) this.transfer(a, pick.hit.id);
      return;
    }
    // nothing to step to
    this.report(a, 'CLIFF', want, { from: a.on, near: a.on ? [a.on] : [] });
    this.mark(a, 0.02);
    // fall
    const drop = cast(want, [0, 0, -1], this.solids, this.b.size[2] * 1.5);
    if (drop) {
      a.p = [want[0], want[1], want[2] - drop.t + 0.05];
      a.n = [0, 0, 1];
      const was = a.on;
      a.on = drop.id;
      if (drop.id !== was) a.transfers++;
      return;
    }
    // it fell out of the world. If it was indoors when it did, that is a hole.
    if (a.indoors) {
      this.report(a, 'HOLE', a.p, { near: a.on ? [a.on] : [] });
      this.mark(a, 0.09);
    }
    this.lost++;
    this.place(a);
  }

  // ---------------------------------------------------------------- housekeeping
  /** The outward normal of the face an ant is standing on, from the element's box. */
  normalAt(p, id) {
    const e = this.solids.find(s => s.id === id);
    if (!e) return null;
    let best = null, bd = Infinity;
    for (let i = 0; i < 3; i++) {
      for (const [v, s] of [[e.lo[i], -1], [e.hi[i], 1]]) {
        const d = Math.abs(p[i] - v);
        if (d < bd) { bd = d; best = [0, 0, 0]; best[i] = s; }
      }
    }
    return best;
  }

  step(n = 1) {
    for (let k = 0; k < n; k++) {
      this.tick++;
      for (const a of this.ants) this.walk(a);
      // Evaporation is the false-positive filter, and it is free: a mark nobody
      // returns to fades, and with it the rumour it was carrying.
      const keep = [];
      for (const m of this.marks) {
        m.s *= (1 - this.decay);
        if (m.s > 0.002) keep.push(m);
      }
      this.marks = keep;
      for (const a of this.ants) a.fatigue *= 0.997;
    }
    return this;
  }

  /**
   * What the colony believes, ranked by how many independent ants said it.
   *
   * One ant saw it once: a rumour. Four ants that arrived separately: a defect.
   * The count is the measurement — not the loudest signal, the most corroborated.
   */
  findings({ minAnts = 2 } = {}) {
    const out = [...this.ledger.values()].map(f => ({
      kind: f.kind, at: f.at, ants: f.ants.size, hits: f.hits,
      first: f.first, last: f.last, near: f.near.slice(0, 4), detail: f.detail,
      confidence: +(1 - Math.pow(0.55, f.ants.size)).toFixed(3),
      weight: +((KINDS[f.kind] ? KINDS[f.kind].weight : 0.5) *
                (1 - Math.pow(0.55, f.ants.size)) * Math.log1p(f.hits)).toFixed(3)
    }));
    return out.filter(f => f.ants >= minAnts).sort((a, b) => b.weight - a.weight);
  }

  /** Everything, corroborated or not, for when you want to see the rumours too. */
  rumours() { return this.findings({ minAnts: 1 }); }

  stats() {
    return { tick: this.tick, ants: this.ants.length, marks: this.marks.length,
             ledger: this.ledger.size, confirmed: this.findings().length,
             lost: this.lost,
             steps: this.ants.reduce((a, x) => a + x.steps, 0),
             transfers: this.ants.reduce((a, x) => a + x.transfers, 0),
             carrying: this.ants.filter(a => a.carrying).length };
  }
}

/**
 * Give the colony the fastening schedule, so an ant crossing between two members
 * can tell "this should have been nailed" from "nobody has a rule for this".
 * Passed in rather than imported, because ants.js has no business depending on
 * the joint tables to walk a surface.
 */
export function withSchedule(colony, scheduleForPair) {
  colony.schedule = scheduleForPair;
  return colony;
}
