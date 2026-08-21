// operative/loop.js — the builder, rather than a script that builds.
//
// `build()` used to be seven calls in a fixed order. It never asked what to do
// next; it did what it was told, in the order it was told, which is exactly the
// PROMPT -> CODE -> MODEL -> DONE this repository is supposed to reject.
//
// This is the loop instead:
//
//   ORIENT   read what the world says now
//   FIND     which difference makes the most difference
//   CHOOSE   the move that difference proposes
//   PREVIEW  score the world before
//   ACT      commit
//   VERIFY   score after; keep it only if it helped
//   RECORD   journal it either way
//   REORIENT the previous reading is now stale; read again
//
// It is deterministic. No model chooses anything here — the ranking is arithmetic
// over the conditions the world reports.
import { checkAll, SEVERITY } from './checks.js';
import { commit, commitChain, rollbackTo } from './ops.js';

/** A brief kept alive during execution: what was asked for, still being asked. */
export function briefConditions(world, brief) {
  const out = [];
  for (const r of brief) {
    if (r.met(world)) continue;
    out.push({
      code: 'REQUIREMENT_FAILED',
      severity: r.hard ? SEVERITY.blocking : SEVERITY.open,
      message: `${r.want} — not there yet`,
      elements: [], measure: { requirement: r.id, hard: !!r.hard },
      repair: { op: 'stage', args: { name: r.stage } }
    });
  }
  return out;
}

/** Lower is better. Lexicographic: blocking first, then serious, then everything. */
export function score(conditions) {
  let blocking = 0, serious = 0;
  for (const c of conditions) {
    if (c.severity >= SEVERITY.blocking) blocking++;
    else if (c.severity >= SEVERITY.serious) serious++;
  }
  return { blocking, serious, total: conditions.length };
}
const better = (a, b) =>
  a.blocking !== b.blocking ? a.blocking < b.blocking
  : a.serious !== b.serious ? a.serious < b.serious
  : a.total < b.total;
const same = (a, b) => a.blocking === b.blocking && a.serious === b.serious && a.total === b.total;

/**
 * Which difference makes the most difference. Severity dominates; among equals,
 * the one that has the most of the building caught up in it.
 */
export function rank(conditions, tried) {
  return conditions
    .filter(c => c.repair && !tried.has(fingerprint(c)))
    .map(c => ({ c, weight: c.severity * 100 + Math.min(c.elements.length, 20) + (c.measure && c.measure.count ? Math.min(c.measure.count / 10, 20) : 0) }))
    .sort((x, y) => y.weight - x.weight)
    .map(x => x.c);
}
const fingerprint = (c) => `${c.code}:${(c.elements || []).slice(0, 4).join('|')}:${(c.measure && c.measure.requirement) || ''}`;

/**
 * Walk the loop until the world stops asking for anything, or the budget runs out.
 * `stages` maps a requirement's stage name to a function that performs it.
 */
export function run(world, { brief = [], stages = {}, budget = 60, log = [] } = {}) {
  const tried = new Set();
  const trace = [];
  let step = 0;

  const readWorld = () => {
    const h = world.hash();
    const cs = (world._lintHash === h && world.conditions) ? world.conditions : checkAll(world);
    world.conditions = cs; world._lintHash = h;
    return cs.concat(briefConditions(world, brief));
  };

  while (step < budget) {
    step++;
    const conditions = readWorld();                       // ORIENT
    const queue = rank(conditions, tried);                // FIND THE DIFFERENCE
    if (!queue.length) {
      trace.push({ step, state: 'SETTLED', open: conditions.length,
        note: conditions.length ? `${conditions.length} acknowledged and unresolved` : 'nothing outstanding' });
      break;
    }
    const target = queue[0];                              // CHOOSE THE NEXT MOVE
    const before = score(conditions);                     // PREVIEW
    const mark = world.history.length;
    const isBrief = target.code === 'REQUIREMENT_FAILED';

    let r;
    if (target.repair.op === 'stage') {                   // ACT
      const fn = stages[target.repair.args.name];
      if (!fn) { tried.add(fingerprint(target)); continue; }
      fn(world, log);
      r = { ok: true, note: `stage ${target.repair.args.name}` };
    } else {
      const steps = target.repair.chain || [target.repair];
      r = commitChain(world, steps, target.code);
      log.push(r);
    }

    // VERIFY. commitChain has already re-linted; do not pay for it twice.
    const after = score(readWorld());
    const helped = better(after, before);
    const neutral = same(after, before);

    // A move that answers the brief is progress by definition. Adding the interior
    // opens conditions the later stages resolve; scored on the count alone the loop
    // walked whole stages back and never finished anything.
    if (!isBrief && !helped && !neutral && r.ok !== false) {
      rollbackTo(world, mark);
      tried.add(fingerprint(target));
      trace.push({ step, answering: target.code, move: target.repair.op, note: r.note,
        before, after, kept: false, why: 'made the world worse; walked back' });
      continue;
    }
    if (r.ok === false || (!isBrief && neutral)) tried.add(fingerprint(target));
    if (isBrief) tried.add(fingerprint(target));          // a stage runs once

    trace.push({ step, answering: target.code, message: target.message, move: target.repair.op,
      note: r.note, before, after, kept: true, brief: isBrief });   // RECORD
  }                                                        // REORIENT is the next pass

  const open = readWorld();
  return {
    trace, steps: step,
    state: open.length === 0 ? 'SETTLED' : open.some(c => c.severity >= SEVERITY.blocking) ? 'UNSETTLED' : 'SETTLING',
    open
  };
}
