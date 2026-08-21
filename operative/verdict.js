// operative/verdict.js — the colony's mouth.
//
// `ants.js` produces findings. A list of findings is a picture; it settles
// nothing and it blocks nothing. THEORY.md §4 is explicit about what a sensor has
// to produce before it counts:
//
//   suck_score > 15 or a deterministic high finding [enables] another Builder patch
//   suck_score <= 15 with no hard finding [blocks] congratulation and [enables]
//   another camera probe
//
// So the colony needs three things it did not have, and they are the three things
// the brief asked for — to KNOW, to SAY, and to PROMPT:
//
//   KNOW    Some holes are meant. A wheel well is a five-sided box open outboard
//           and down, because that is where the tyre goes. The colony reported
//           four gaps on a finished trailer for two hundred cycles and every one
//           of them was a wheel well. It was right about the geometry and had no
//           way to be right about the intent. Until it can tell a hole that was
//           meant from a hole that was not, its score is noise and nobody will
//           ever act on it.
//
//   SAY     One number on the same 0-100 scale the visual critic uses, so the two
//           are commensurable and the worst of them can win. MAX over places,
//           never the average — a building that is sound in nine bays and open in
//           the tenth is fucked.
//
//   PROMPT  A low score is not a result. Per the brief it changes the next
//           operation from [build] to [move sensor], and for a colony that means
//           something specific: a new nest, more rays, further sight, a finer
//           flood. The prompt says which.
//
// And one thing nobody asked for, which the census forced:
//
//   ADMIT THE RESOLUTION. The escape scan on the finished trailer reports 1 ray
//   out at 128 rays per lamp, 29 at 512, and 124 at 2048. The building did not
//   change. "Zero escaped" was never a reading about the building; it was a
//   reading about how hard we looked. A verdict that does not carry the setting
//   it was taken at is not evidence, and this module refuses to settle at a
//   setting it knows to be blind.

import { KINDS } from './ants.js';
import { THRESHOLD, meaning } from './critic.js';
import { cast, bounds } from './radiography.js';

/** How bad each kind is when nobody meant it, before corroboration is applied. */
export const GRAVITY = {
  HOLE:     100,   // an ant walked out of the building
  GAP:       80,   // daylight from inside
  CLASH:     60,   // material inside material
  UNJOINED:  40,   // the schedule says nail this and it is not nailed
  CLIFF:     40,   // the surface ended at nothing
  VOID:      20,   // a cavity behind the surface
  UNRULED:   20    // nothing has an opinion, which is not the same as fine
};

/** Corroboration, on the colony's own curve: two ants 0.70, five ants 0.95. */
export const corroboration = (ants) => 1 - Math.pow(0.55, Math.max(0, ants));

// ---------------------------------------------------------------- KNOW
export const MEANT = {
  OPENING: 'a door or window is a hole on purpose',
  WELL:    'a wheel well is open outboard and down, because that is where the tyre goes',
  PORT:    'a port is a hole on purpose',
  VENT:    'a vent is a hole on purpose'
};

/**
 * Regions where a hole is meant, read off the building rather than listed here.
 *
 * The wheel well is the case that matters and it is not an element — it is the
 * *absence* under the well cap. So it has to be constructed: the pocket below
 * each cap, down to the bottom of the frame, is the tyre's room and is open to
 * the road by design.
 */
export function expectations(world) {
  if (!world || !world.all) return [];
  const out = [];
  const b = bounds(world.solids().map(e => ({ lo: e.lo, hi: e.hi })));
  for (const o of world.all({ kind: 'opening' })) {
    out.push({ ...grow(o, 2), why: MEANT.OPENING, id: o.id });
  }
  for (const p of world.all()) {
    if (p.kind === 'port') out.push({ ...grow(p, 3), why: MEANT.PORT, id: p.id });
    else if (p.meta && p.meta.vents) out.push({ ...grow(p, 3), why: MEANT.VENT, id: p.id });
    else if (p.kind === 'wellcap') {
      // the pocket under the cap: the cap's footprint, from the frame's underside
      // up to the cap's own soffit, plus two inches of slack for an ant standing
      // on the inboard wall of the well rather than in the air of it.
      out.push({ lo: [p.lo[0] - 2, p.lo[1] - 2, b.lo[2] - 2], hi: [p.hi[0] + 2, p.hi[1] + 2, p.lo[2] + 2],
                 why: MEANT.WELL, id: p.id });
    }
  }
  return out;
}
/** An element's box, every face pushed out by n inches. */
const grow = (e, n) => ({ lo: e.lo.map(v => v - n), hi: e.hi.map(v => v + n) });

/** Is the point inside the region? */
const within = (r, p) => [0, 1, 2].every(i => p[i] >= r.lo[i] && p[i] <= r.hi[i]);

/**
 * Does the ray from `o` along `d` cross the region? Slabs.
 *
 * This is the test that matters for a GAP, because a GAP is recorded where the
 * *ant* was standing and not where the hole is. Measured by distance to the hole
 * the colony looked blind while it was staring straight through it.
 */
export function crosses(o, d, r) {
  let t0 = 0, t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < r.lo[i] || o[i] > r.hi[i]) return false; continue; }
    let a = (r.lo[i] - o[i]) / d[i], z = (r.hi[i] - o[i]) / d[i];
    if (a > z) { const t = a; a = z; z = t; }
    if (a > t0) t0 = a;
    if (z < t1) t1 = z;
    if (t0 > t1) return false;
  }
  return true;
}

export const VERDICT = { EXPECTED: 'EXPECTED', UNEXPECTED: 'UNEXPECTED', UNKNOWN: 'UNKNOWN' };

/**
 * One finding, judged.
 *
 * UNRULED is UNKNOWN by construction and that is the honest answer: the
 * fastening schedule has no row for this pair, so nothing in the model has an
 * opinion about whether it is fine. UNKNOWN is not a pass. It blocks settlement
 * exactly the way a failure does, and it is the only class that can be cleared
 * by writing a rule rather than by moving a stick.
 */
export function classify(f, exp) {
  if (f.kind === 'UNRULED') {
    return { ...f, verdict: VERDICT.UNKNOWN, why: 'no row in the fastening schedule covers this pair' };
  }
  for (const r of exp) {
    if (within(r, f.at)) return { ...f, verdict: VERDICT.EXPECTED, why: r.why, meant: r.id };
    const d = f.detail && f.detail.toward;
    if (d && crosses(f.at, d, r)) {
      return { ...f, verdict: VERDICT.EXPECTED, why: `${r.why} — the escaping ray goes out through ${r.id}`, meant: r.id };
    }
  }
  return { ...f, verdict: VERDICT.UNEXPECTED, why: KINDS[f.kind] ? KINDS[f.kind].label : f.kind };
}

/** Where a finding is, for the purpose of taking a maximum. */
export const placeOf = (f) => (f.near && f.near[0]) || f.at.map(v => Math.round(v / 12) * 12).join(',');

// ---------------------------------------------------------------- SAY
/**
 * The colony's score on the visual critic's scale, so the worst of the two can
 * win. MAX over places, never the average.
 */
export function suckOf(colony, world, { minAnts = 2 } = {}) {
  const exp = expectations(world);
  const judged = colony.findings({ minAnts }).map(f => classify(f, exp));
  const places = new Map();
  for (const f of judged) {
    if (f.verdict === VERDICT.EXPECTED) continue;
    const base = GRAVITY[f.kind] === undefined ? 20 : GRAVITY[f.kind];
    // UNKNOWN cannot exceed suspicion. It is not evidence of a defect; it is
    // evidence that nothing has looked.
    const cap = f.verdict === VERDICT.UNKNOWN ? 20 : 100;
    const s = Math.min(cap, Math.round(base * corroboration(f.ants)));
    const p = placeOf(f);
    if (!places.has(p) || places.get(p).score < s) places.set(p, { place: p, score: s, finding: f });
    }
  const ranked = [...places.values()].sort((a, b) => b.score - a.score);
  const score = ranked.length ? ranked[0].score : 0;
  const counts = { EXPECTED: 0, UNEXPECTED: 0, UNKNOWN: 0 };
  for (const f of judged) counts[f.verdict]++;
  return {
    score, meaning: meaning(score),
    worst: ranked[0] || null,
    places: ranked,
    judged, counts,
    // A hard failure in the brief's sense: something that on its own enables
    // another builder patch regardless of the score.
    hard: judged.filter(f => f.verdict === VERDICT.UNEXPECTED &&
                             (f.kind === 'HOLE' || f.kind === 'GAP' || f.kind === 'CLASH')).length
  };
}

// ---------------------------------------------------------------- ADMIT THE RESOLUTION
/**
 * What the colony was set to, and whether that setting is known to be blind.
 *
 * Measured, not asserted. On the finished trailer, at 60 ants and seed 11:
 * looking every third step drops the gable-end lesion from 16 findings to 5, and
 * two missing eave blocks are invisible at every setting the colony has. The
 * escape scan is worse: 128 rays per lamp says one ray gets out of this building,
 * 2048 says a hundred and twenty-four.
 */
export const BLIND = [
  { when: (s) => s.lidarEvery > 1,
    is: `an ant that looks every ${'{n}'} steps found a third of what one that looks every step found`,
    fix: 'set the cadence to every step' },
  { when: (s) => s.ticks < 400,
    is: 'under four hundred ticks the colony has not been anywhere twice, and corroboration is what the measurement is',
    fix: 'run it longer' },
  { when: (s) => s.ants < 30,
    is: 'below thirty ants a finding cannot reach two independent reporters often enough to clear the floor',
    fix: 'hatch more ants' },
  { when: () => true,
    is: 'two missing blocks in a thirty foot eave are invisible to this instrument at every setting it has — the full ray survey sees them',
    fix: 'run tools/scan.mjs before believing a clean colony' }
];

export function resolution(colony, { ticks = null } = {}) {
  const s = { ants: colony.ants.length, lidar: colony.lidarRays, lidarEvery: colony.lidarEvery,
              sight: colony.sight, decay: colony.decay, ticks: ticks === null ? colony.tick : ticks };
  const blind = BLIND.filter(b => b.when(s)).map(b => ({
    is: b.is.replace('{n}', String(s.lidarEvery)), fix: b.fix }));
  return { settings: s, blind, trustworthy: blind.length <= 1 };
}

// ---------------------------------------------------------------- PROMPT
/**
 * Never DONE. A high score builds again; a low score moves the sensor. For a
 * colony the sensor moves are its own settings and its own nest, and the least
 * recently used one goes next so it cannot re-probe the same way forever.
 */
export const MOVES = [
  { id: 'nest',    say: 'release the next cohort from a different nest — the far end of the building, not the door' },
  { id: 'rays',    say: 'double the rays each ant fires; a fourteen ray fan misses a two inch gap most of the time' },
  { id: 'sight',   say: 'lengthen the sight; a miss inside forty inches is not the same as a hole' },
  { id: 'cadence', say: 'set the cadence to every step, whatever it costs' },
  { id: 'flood',   say: 'flood the volume at one inch instead of two and hand the colony a better inside-from-out' },
  { id: 'longer',  say: 'keep it running — corroboration is time, and nothing here is finished' }
];

export function nextProbe(verdict, res, used = []) {
  if (verdict.score > THRESHOLD || verdict.hard > 0) {
    return { mode: 'BUILD AGAIN', why: verdict.hard
      ? `${verdict.hard} unexpected hole${verdict.hard === 1 ? '' : 's'} in the envelope`
      : `worst place scores ${verdict.score} — ${verdict.meaning}` };
  }
  // Blindness the colony admits to is itself a reason to move rather than settle.
  const forced = res.blind.length ? res.blind[0] : null;
  const move = MOVES.find(m => !used.includes(m.id)) || MOVES[MOVES.length - 1];
  return {
    mode: 'MOVE THE SENSOR',
    move: move.id,
    why: forced ? forced.is : 'nothing found is not the same as nothing there',
    say: forced ? forced.fix : move.say
  };
}

/**
 * The accusation, in the critic's voice and in the critic's format, so it can be
 * injected into a builder verbatim with no translation layer.
 *
 * It does not praise, does not propose a fix, does not name an operation. Those
 * rules are the whole reason the critic is a separate agent, and a linter that
 * arrives with a patch in its mouth starts defending the patch.
 */
export function accuse(colony, world, { minAnts = 2, ticks = null } = {}) {
  const v = suckOf(colony, world, { minAnts });
  const res = resolution(colony, { ticks });
  const lines = [`SUCK SCORE: ${v.score}`, '', 'WHAT SUCKS:'];

  if (!v.places.length) {
    lines.push(`${colony.ants.length} ants walked this building for ${res.settings.ticks} ticks and ` +
      `every hole they found was one that was meant. That is not a finished building. It is a building ` +
      `that has survived being walked on at this setting.`);
  } else {
    for (const p of v.places.slice(0, 8)) {
      const f = p.finding;
      lines.push(`${f.ants} ants independently ${verb(f.kind)} at ${p.place} ` +
        `(${f.at.join(', ')})${f.verdict === VERDICT.UNKNOWN ? ' — and nothing in the model has an opinion about whether that is allowed' : ''}.`);
    }
    if (v.counts.EXPECTED) {
      lines.push('', `${v.counts.EXPECTED} further finding${v.counts.EXPECTED === 1 ? '' : 's'} ` +
        `fell where a hole was meant and ${v.counts.EXPECTED === 1 ? 'is' : 'are'} not counted.`);
    }
  }
  lines.push('', 'WHAT THIS READING IS WORTH:');
  lines.push(`${res.settings.ants} ants, ${res.settings.lidar} rays each every ${res.settings.lidarEvery} ` +
    `step${res.settings.lidarEvery === 1 ? '' : 's'}, ${res.settings.sight} inch sight, ${res.settings.ticks} ticks.`);
  for (const b of res.blind) lines.push(`BLIND: ${b.is}`);

  const probe = nextProbe(v, res);
  lines.push('', `NEXT: ${probe.mode} — ${probe.why}`);
  if (probe.say) lines.push(probe.say);
  return { text: lines.join('\n'), score: v.score, verdict: v, resolution: res, probe };
}
const verb = (k) => ({
  HOLE: 'walked out of the building', GAP: 'saw daylight from inside',
  CLASH: 'found material inside material', UNJOINED: 'crossed an unfastened contact the schedule covers',
  CLIFF: 'ran off the end of a surface', VOID: 'found a cavity behind the surface',
  UNRULED: 'crossed a contact no rule covers'
}[k] || k);

/**
 * The colony's line in the joint accusation, beside the visual critic's and the
 * linters'. The brief's rule holds: the linters simply join the accusation, there
 * is no fusion mechanism, and the score that governs is the maximum.
 */
export function joinAccusation(whatSucksVisually, conditions, stigmergic) {
  const out = [];
  if (whatSucksVisually) out.push('WHAT SUCKS VISUALLY:', String(whatSucksVisually).trim());
  if (conditions && conditions.length) {
    out.push('', 'WHAT SUCKS DETERMINISTICALLY:');
    for (const c of conditions.slice(0, 20)) out.push(`${c.code} ${c.message}`);
  }
  if (stigmergic) out.push('', 'WHAT SUCKS STIGMERGICALLY:', String(stigmergic.text || stigmergic).trim());
  return out.join('\n');
}
