// operative/invariants.js — repairing the rule instead of the output.
//
// When the same class of failure keeps arriving, patching each instance is not
// progress. The journal is counted; a code that has opened three times is
// promoted to an invariant, and from then on the operation is checked against it
// *before* it runs. Nothing is hidden: the promotion is a visible event and the
// warning names the invariant that produced it.
import { BORE, SPAN_TABLE } from './checks.js';

export const THRESHOLD = 3;

export const RULES = {
  BORE_OVERSIZE: {
    rule: 'a service line larger than 40% of a bearing member does not pass through it — plan the riser in a bay',
    guard: (world, op, args) => {
      if (op !== 'route' || !args.dia) return null;
      const limit = BORE.studBearingMaxFrac * 3.5;
      if (args.dia <= limit) return null;
      return `${args.dia} in is over the ${limit.toFixed(2)} in a 2x4 bearing stud can give up — this path wants a stud bay, not a bore`;
    }
  },
  EDGE_CLEARANCE: {
    rule: 'a bore is centred in its member unless something forces it off',
    guard: (world, op, args) => (op === 'route' && args.dia >= 1.5)
      ? `at ${args.dia} in there is almost no edge left in a 2x nominal member; expect this run to want the cavity` : null
  },
  OPENING_ABOVE_PLATE: {
    rule: 'an opening is checked against the height of the wall it is cut in, before it is cut',
    guard: (world, op, args) => {
      if (op !== 'cut') return null;
      const w = world.walls[args.wall];
      if (!w) return null;
      const z0 = args.type === 'door' ? world.datum.soleTop : world.datum.deckTop + (args.sill || 0);
      const z1 = args.head !== undefined ? world.datum.deckTop + args.head : z0 + (args.type === 'door' ? 80 : 36);
      if (z1 <= w.topPlateBot) return null;
      return `wall ${args.wall} gives ${(w.topPlateBot - world.datum.soleTop).toFixed(1)} in of stud; this opening heads ${(z1 - w.topPlateBot).toFixed(1)} in above its plate`;
    }
  },
  ONE_END_BEARING: {
    rule: 'the roof is reseated whenever a bearing wall changes height',
    guard: (world, op, args) => (op === 'raise')
      ? 'the roof does not follow a wall on its own — pitch it afterwards' : null
  },
  OVERLAP: {
    rule: 'a member is placed clear of what is already there',
    guard: () => null
  },
  SPAN_EXCEEDED: {
    rule: 'a member is sized from its span, not from habit',
    guard: (world, op, args) => (op === 'cut' && args.to - args.from > SPAN_TABLE.header['(2)2x10'])
      ? `${(args.to - args.from).toFixed(0)} in is past the widest header in the table (${SPAN_TABLE.header['(2)2x10']} in)` : null
  }
};

/** Count what the world has been complaining about and promote the repeat offenders. */
export function learn(world) {
  const counts = new Map();
  for (const rec of world.history) {
    for (const c of rec.opened || []) counts.set(c.code, (counts.get(c.code) || 0) + 1);
  }
  const promoted = [];
  for (const [code, n] of counts) {
    if (n < THRESHOLD || !RULES[code]) continue;
    if (world.invariants.some(i => i.code === code)) continue;
    const inv = { code, rule: RULES[code].rule, seen: n, since: world.clock };
    world.invariants.push(inv);
    promoted.push(inv);
    world.record({ kind: 'invariant', note: `promoted after ${n} encounters: ${inv.rule}`, elements: [] });
  }
  // keep the count current on invariants already promoted
  for (const inv of world.invariants) inv.seen = counts.get(inv.code) || inv.seen;
  return promoted;
}

/** Check an operation against the promoted invariants before it runs. */
export function preflight(world, op, args) {
  const out = [];
  for (const inv of world.invariants) {
    const g = RULES[inv.code] && RULES[inv.code].guard;
    if (!g) continue;
    let msg = null;
    try { msg = g(world, op, args); } catch { msg = null; }
    if (msg) out.push({ code: inv.code, rule: inv.rule, warning: msg });
  }
  return out;
}
