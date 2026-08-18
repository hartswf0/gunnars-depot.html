// operative/world.js — explicit, serializable building state.
//
// The Three.js scene is a *view*. This is the world. Everything the builder can
// query, change, test, replay, or explain lives here.
//
// Domain language is inherited from data/module-rules.json:
//   layers  foundation | frame | walls | roof | interior | services
//   unit    inch
import { box, lo, hi } from './geom.js';
import { poly, aabb, bearsOn, fastenedTo } from './poly.js';

export const LAYERS = ['foundation', 'frame', 'walls', 'roof', 'interior', 'services'];

// Nominal lumber: [thickness, depth] in inches, actual dressed dimensions.
export const SECTIONS = {
  '2x4': [1.5, 3.5], '2x6': [1.5, 5.5], '2x8': [1.5, 7.25],
  '2x10': [1.5, 9.25], '2x12': [1.5, 11.25],
  '(2)2x6': [3.0, 5.5], '(2)2x8': [3.0, 7.25], '(2)2x10': [3.0, 9.25]
};

let seq = 0;
export const resetIds = () => { seq = 0; };

export class Element {
  constructor(init) {
    Object.assign(this, {
      id: init.id || `${init.kind}.${++seq}`,
      kind: init.kind,            // chassis|joist|deck|plate|stud|king|jack|cripple|header|sheathing|rafter|purlin|panel|opening|run|fixture|source|fitting
      layer: init.layer,
      box: init.box,
      material: init.material || 'plywood',
      system: init.system || null, // 'power' | 'water' | null
      section: init.section || null,
      shear: init.shear || null,   // { axis:'x'|'y', rise } for sloped members
      meta: init.meta || {},
      ports: init.ports || [],
      trace: init.trace ? init.trace.slice() : []
    });
  }
  poly() { return poly(this.box, this.shear); }
  get lo() { return aabb(this.poly()).lo; }
  get hi() { return aabb(this.poly()).hi; }
  clone() { const e = new Element({ ...this, box: box(this.box.p, this.box.s) }); e.trace = this.trace.slice(); return e; }
}

export class World {
  constructor() {
    this.unit = 'inch';
    this.elements = new Map();
    this.history = [];        // xenography: every consequential move
    this.conditions = [];     // current unresolved conditions
    this.invariants = [];     // rules promoted at runtime
    this.reference = null;    // { id, profile } once a reference is bound
    this.clock = 0;
  }

  add(el) {
    if (!(el instanceof Element)) el = new Element(el);
    this.elements.set(el.id, el);
    return el;
  }
  get(id) { return this.elements.get(id); }
  remove(id) { const e = this.elements.get(id); this.elements.delete(id); return e; }
  all(filter) {
    const out = [];
    for (const e of this.elements.values()) {
      if (!filter) { out.push(e); continue; }
      let ok = true;
      for (const k of Object.keys(filter)) {
        const want = filter[k];
        const got = e[k];
        if (Array.isArray(want) ? !want.includes(got) : got !== want) { ok = false; break; }
      }
      if (ok) out.push(e);
    }
    return out;
  }
  solids() { return this.all().filter(e => e.kind !== 'opening' && e.kind !== 'run' && e.kind !== 'port'); }

  /**
   * Support graph: who carries whom. Recomputed, never stored stale.
   * Two edge kinds, because construction has two: BEAR (gravity, seated) and
   * FASTEN (nailed / welded / lagged face contact). Sheathing hangs; a
   * crossmember is welded to a rail. Collapsing them into one edge produced a
   * false "unsupported" report on the very first probe, so they stay distinct.
   */
  supportGraph() {
    const solids = this.solids();
    const polys = new Map(solids.map(e => [e.id, e.poly()]));
    const under = new Map(solids.map(e => [e.id, []]));
    const over = new Map(solids.map(e => [e.id, []]));
    for (const a of solids) {
      for (const b of solids) {
        if (a === b) continue;
        const A = polys.get(a.id), B = polys.get(b.id);
        const bear = bearsOn(A, B);
        if (bear > 0.5) {
          under.get(a.id).push({ id: b.id, area: bear, via: 'bear' });
          over.get(b.id).push({ id: a.id, area: bear, via: 'bear' });
          continue;
        }
        const fast = fastenedTo(A, B);
        if (fast > 4) {
          under.get(a.id).push({ id: b.id, area: fast, via: 'fasten' });
          over.get(b.id).push({ id: a.id, area: fast, via: 'fasten' });
        }
      }
    }
    return { under, over };
  }

  /** Which elements are reachable from ground (z<=0.5) through the support graph. */
  grounded() {
    const { under, over } = this.supportGraph();
    const bearing = new Set();   // reached by gravity load path only
    const seen = new Set();      // reached by any connection
    const qb = [], qa = [];
    for (const e of this.solids()) if (e.lo[2] <= 0.6) { bearing.add(e.id); seen.add(e.id); qb.push(e.id); qa.push(e.id); }
    while (qb.length) {
      const id = qb.pop();
      for (const up of over.get(id) || []) if (up.via === 'bear' && !bearing.has(up.id)) { bearing.add(up.id); qb.push(up.id); }
    }
    while (qa.length) {
      const id = qa.pop();
      for (const up of over.get(id) || []) if (!seen.has(up.id)) { seen.add(up.id); qa.push(up.id); }
    }
    return { seen, bearing, under, over };
  }

  /** Record an encounter on the world and on each element that took part. */
  record(entry) {
    const rec = { t: ++this.clock, ...entry };
    this.history.push(rec);
    for (const id of new Set(entry.elements || [])) {
      const e = this.elements.get(id);
      if (e) e.trace.push({ t: rec.t, kind: rec.kind, note: rec.note, cause: rec.cause || null });
    }
    return rec;
  }

  /** Cheap structural digest — lets history prove the world actually changed. */
  hash() {
    let h = 2166136261 >>> 0;
    const feed = (s) => { for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } };
    for (const id of [...this.elements.keys()].sort()) {
      const e = this.elements.get(id);
      feed(id + e.kind + e.material + (e.system || '') + (e.shear ? e.shear.axis + e.shear.rise : '') + e.box.p.map(n => n.toFixed(2)).join() + e.box.s.map(n => n.toFixed(2)).join());
    }
    return h.toString(16).padStart(8, '0');
  }

  toJSON() {
    return {
      unit: this.unit, clock: this.clock, hash: this.hash(),
      elements: this.all().map(e => ({
        id: e.id, kind: e.kind, layer: e.layer, box: e.box, shear: e.shear, material: e.material,
        system: e.system, section: e.section, meta: e.meta, trace: e.trace
      })),
      history: this.history, conditions: this.conditions, invariants: this.invariants
    };
  }
}
