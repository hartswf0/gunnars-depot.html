/**
 * The loop, run against a scripted model and a stage made of paper.
 *
 * No key, no renderer, no network — which means the thing being tested is the policy
 * itself: the caps, the receipts, the diff, and the two rules that decide where the
 * camera goes next. Those rules are the whole argument, so they should be provable
 * without an account.
 *
 *   node operative/kit/selftest.mjs
 */
import { createLoop, applyOperations, geometryDiff, PROMPTS, builderPrompt, criticPrompt, DIALECT } from './loop.js';

let failures = 0;
const ok = (cond, what) => { console.log((cond ? '  ok   ' : '  FAIL ') + what); if (!cond) failures++; };

// --- the prompts are still the ones that have evidence behind them ----------------
ok(builderPrompt() === PROMPTS.builder, 'templated builder prompt is byte-identical to the recorded one');
ok(criticPrompt() === PROMPTS.critic, 'templated critic prompt is byte-identical to the recorded one');

// --- operations ------------------------------------------------------------------
{
  const { world, receipts } = applyOperations([], [
    { op: 'ADD', id: 'a', primitive: 'box', role: 'wall', position: [0, 1, 0], size: [4, 2, 4] },
    { op: 'ADD', id: 'a', primitive: 'box', role: 'wall' },          // duplicate
    { op: 'MOVE', id: 'ghost', position: [1, 1, 1] },                 // unknown
    { op: 'ADD', id: 'b', primitive: 'gable', role: 'roof', size: [4, 1.5, 4] }
  ]);
  ok(world.length === 2, 'two parts survive, the two bad operations do not');
  ok(receipts.filter(r => r.startsWith('REJECT')).length === 2, 'both rejections come back as receipts, not as a thrown error');
  const d = geometryDiff([{ id: 'a', size: [1, 1, 1] }, { id: 'z' }], world);
  ok(d.added.join() === 'b' && d.changed.join() === 'a' && d.removed.join() === 'z', 'diff reports added, changed and removed by id');
}

// --- the caps --------------------------------------------------------------------
{
  const many = Array.from({ length: 40 }, (_, i) => ({ op: 'ADD', id: 'p' + i, role: 'wall' }));
  ok(applyOperations([], many, { cap: 24 }).world.length === 24, 'a first pass is capped at 24 operations');
  ok(applyOperations([{ id: 'x', role: 'wall' }], many, { cap: 12 }).world.length === 13, 'a repair is capped at 12');
}

// --- the policy ------------------------------------------------------------------
/** A stage that draws nothing and remembers everything asked of it. */
const paperStage = () => {
  const shots = [];
  return { shots, apply() {}, shoot(v) { shots.push(v); return 'data:image/png;base64,'; }, shootDiff() { return 'data:image/png;base64,'; } };
};
/** A model that says whatever the script says next. */
const scripted = (scores, builderSystem = PROMPTS.builder) => {
  let n = 0, built = 0;
  return async ({ system }) => {
    if (system === builderSystem) {
      built++;
      return { summary: 'move ' + built, operations: [{ op: 'ADD', id: 'p' + built, role: built === 1 ? 'door' : 'path' }] };
    }
    return { suck_score: scores[Math.min(n++, scores.length - 1)], what_sucks: 'still wrong' };
  };
};

{
  // Two bad scores from the view the repair was aimed at: the camera must move before
  // any more geometry is touched.
  const stage = paperStage();
  const loop = createLoop({ intent: 'a shed', ask: scripted([80, 80, 80]), stage, onEvent: () => {} });
  await loop.step(); await loop.step(); await loop.step();
  const moves = loop.trace.filter(e => e.kind === 'policy');
  ok(moves.some(m => m.move === 'stress'), 'a repeat high score moves the camera instead of patching again');
  const builds = loop.trace.filter(e => e.kind === 'build').length;
  const looks = loop.trace.filter(e => e.kind === 'critique').length;
  ok(looks > builds, 'it looks more often than it builds');
}
{
  // A low score is one camera's silence. It must trigger a look from the opposite side.
  const stage = paperStage();
  const loop = createLoop({ intent: 'a shed', ask: scripted([0]), stage, onEvent: () => {} });
  await loop.step();
  const v = loop.trace.find(e => e.kind === 'policy');
  ok(v && v.move === 'verify', 'a low score is treated as this view finding nothing, not as finished');
  ok(v && v.to === 'BACK' && v.from === 'FRONT', 'and the next look is from the opposite side');
  ok(!loop.settled(), 'one quiet view never counts as settled');
}
{
  // Settled needs every core view quiet on this same world, and the checks quiet too.
  const stage = paperStage();
  const loop = createLoop({ intent: 'a shed', ask: scripted([90, 0, 0, 0, 0, 0, 0]), stage,
    lint: () => [], onEvent: () => {} });
  const out = await loop.run({ cycles: 12 });
  ok(out.settled, 'six quiet core views on one world, with no lint, does settle');
  ok(new Set(stage.shots).size >= 6, 'and it got there by looking from at least six different places');
}
{
  // The human seat: a note goes in as an accusation and forces the next build.
  const stage = paperStage();
  const loop = createLoop({ intent: 'a shed', ask: scripted([0]), stage, onEvent: () => {} });
  await loop.step();
  loop.tell('the door faces the wrong way');
  await loop.step();
  ok(loop.trace.filter(e => e.kind === 'build').length === 2, 'telling it something forces a build on the next step');
}

{
  // A different vocabulary reaches the model, and the loop is otherwise unchanged.
  const circuit = { ...DIALECT, subject: 'circuit', primitives: ['ic', 'resistor', 'trace'],
    roles: ['power', 'ground', 'clock'], massing: 'power rails and the main signal path', detail: 'silkscreen' };
  const p = { builder: builderPrompt(circuit), critic: criticPrompt(circuit) };
  ok(p.builder.includes('Allowed primitives: ic, resistor, trace'), 'a new dialect reaches the builder prompt');
  ok(p.critic.includes('IS THE CIRCUIT FUCKED'), 'and the critic prompt');
  const seen = [];
  const loop = createLoop({ intent: 'a clock divider', prompts: p, stage: paperStage(), lint: () => [],
    ask: async ({ system }) => { seen.push(system);
      return system === p.builder ? { summary: 'x', operations: [{ op: 'ADD', id: 'u1', role: 'clock' }] }
                                  : { suck_score: 0, what_sucks: 'wrong' }; } });
  await loop.step();
  ok(seen.includes(p.builder) && seen.includes(p.critic), 'and both are what the loop actually sends');
  ok(!seen.includes(PROMPTS.builder), 'the default prompts are not sent once you override them');
}

console.log(failures ? `\n${failures} failed` : '\nthe loop behaves');
process.exit(failures ? 1 : 0);
