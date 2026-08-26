/**
 * The loop, with the app taken out of it.
 *
 * What makes this work is not the prompts on their own. It is that the critic is shown
 * a *rendering of what the builder actually did* — the same world, from a named camera,
 * against the reference — and that the loop refuses to accept a good score from the
 * view the repair was aimed at. Two moves carry almost all of it:
 *
 *   A low score does not mean finished. It means this view found nothing, so the
 *   camera moves to the opposite side before anything else is believed.
 *
 *   A high score twice from the same view does not mean patch again. It means the
 *   builder is guessing, so the camera moves before more geometry is touched.
 *
 * Everything else is bookkeeping. Two seams keep it portable: `ask` is one function
 * that takes a system prompt, some text and some images and returns parsed JSON — any
 * provider, any transport — and `stage` is anything that can hold a world and take a
 * picture of it from a named view. Neither knows about the other.
 */
import { PROMPTS } from './prompts.js';

export { PROMPTS, DIALECT, builderPrompt, criticPrompt } from './prompts.js';

/** The six a run cycles through, then six more it can be sent to under suspicion. */
export const CORE_VIEWS = ['FRONT', 'BACK', 'LEFT', 'RIGHT', 'TOP', 'ENTRY'];
export const STRESS_VIEWS = ['FRONT_3Q', 'REAR_3Q', 'LOW_FRONT', 'LOW_REAR', 'HIGH_LEFT', 'HIGH_RIGHT'];
export const ALL_VIEWS = CORE_VIEWS.concat(STRESS_VIEWS);

/** Below this, the view found nothing — which is not the same as nothing being wrong. */
export const LOW_THRESHOLD = 15;

const OPPOSITE = { FRONT: 'BACK', BACK: 'FRONT', LEFT: 'RIGHT', RIGHT: 'LEFT', TOP: 'ENTRY', ENTRY: 'TOP',
  FRONT_3Q: 'REAR_3Q', REAR_3Q: 'FRONT_3Q', LOW_FRONT: 'LOW_REAR', LOW_REAR: 'LOW_FRONT',
  HIGH_LEFT: 'HIGH_RIGHT', HIGH_RIGHT: 'HIGH_LEFT' };
export const opposite = (v) => OPPOSITE[v] || 'BACK';

const clone = (x) => JSON.parse(JSON.stringify(x));

// ---------------------------------------------------------------- the world

/** One part. Everything the builder is allowed to say about a thing. */
const part = (op) => ({
  id: String(op.id),
  primitive: op.primitive || 'box',
  role: String(op.role || 'part'),
  position: Array.isArray(op.position) ? op.position : [0, 1, 0],
  size: Array.isArray(op.size) ? op.size : [1, 1, 1],
  rotation_y: Number(op.rotation_y) || 0,
  color: /^#[0-9a-f]{6}$/i.test(op.color || '') ? op.color : '#d8c8a9',
  material: op.material === 'metal' ? 'metal' : 'matte',
  scale: Array.isArray(op.scale) ? op.scale : [1, 1, 1]
});

/**
 * Apply what the builder asked for, and say what actually happened.
 *
 * A rejected operation is not an error — it is a receipt. The builder sees its own
 * rejections in the next turn's context, which is most of how it learns the world has
 * rules. Throwing here would throw that away and stall the run on a typo.
 */
export function applyOperations(world, ops, { cap } = {}) {
  if (!Array.isArray(ops)) throw new Error('operations is not an array');
  const out = clone(world), receipts = [];
  const limit = cap != null ? cap : (world.length ? 12 : 48);
  for (const op of ops.slice(0, limit)) {
    try {
      const kind = String(op.op || '').toUpperCase();
      if (kind === 'CLEAR') { out.length = 0; receipts.push('CLEAR'); continue; }
      if (kind === 'ADD') {
        if (!op.id) throw new Error('ADD missing id');
        if (out.some(o => o.id === op.id)) throw new Error('duplicate id ' + op.id);
        out.push(part(op)); receipts.push('ADD ' + op.id); continue;
      }
      const i = out.findIndex(o => o.id === op.id);
      if (i < 0) throw new Error(kind + ' unknown id ' + op.id);
      const o = out[i];
      if (kind === 'REMOVE') { out.splice(i, 1); receipts.push('REMOVE ' + op.id); }
      else if (kind === 'MOVE') { o.position = op.position || o.position; receipts.push('MOVE ' + op.id); }
      else if (kind === 'SCALE') { o.scale = op.scale || o.scale; receipts.push('SCALE ' + op.id); }
      else if (kind === 'ROTATE_Y') { o.rotation_y = Number(op.rotation_y) || 0; receipts.push('ROTATE ' + op.id); }
      else if (kind === 'COLOR') { o.color = op.color || o.color; receipts.push('COLOR ' + op.id); }
      else throw new Error('unknown op ' + kind);
    } catch (e) { receipts.push('REJECT ' + (op.id || '?') + ' · ' + e.message); }
  }
  return { world: out, receipts };
}

const sig = (o) => JSON.stringify({ primitive: o.primitive, role: o.role, position: o.position,
  size: o.size, rotation_y: o.rotation_y, color: o.color, material: o.material, scale: o.scale });

/** What changed, by id — the thing the critic is shown a picture of. */
export function geometryDiff(before, after) {
  const a = new Map((before || []).map(o => [o.id, o])), b = new Map((after || []).map(o => [o.id, o]));
  const added = [], changed = [], removed = [];
  b.forEach((o, id) => { if (!a.has(id)) added.push(id); else if (sig(a.get(id)) !== sig(o)) changed.push(id); });
  a.forEach((o, id) => { if (!b.has(id)) removed.push(id); });
  return { added, changed, removed };
}
export const diffLabel = (d) => '+' + (d?.added.length || 0) + ' ~' + (d?.changed.length || 0) + ' −' + (d?.removed.length || 0);

/**
 * The cheapest checks worth running, and an example of the shape.
 *
 * These cost nothing and they catch what a picture argues about for three cycles. Pass
 * your own `lint` to replace them; the loop only needs {code, message, severity}.
 */
export function defaultLint(world) {
  const out = [], roles = world.map(o => (o.role || '').toLowerCase());
  if (!world.length) out.push({ severity: 'high', code: 'EMPTY_WORLD', message: 'No geometry exists.' });
  if (world.length && !roles.some(r => r.includes('door')))
    out.push({ severity: 'high', code: 'NO_DOOR', message: 'No object has semantic role door.' });
  if (roles.some(r => r.includes('door')) && !roles.some(r => /stair|path|landing|porch/.test(r)))
    out.push({ severity: 'high', code: 'NO_ARRIVAL', message: 'Door exists without stair/path/landing/porch.' });
  return out;
}
const lintText = (xs) => xs.length ? xs.slice(0, 6).map(x => x.code + ': ' + x.message).join('\n') : 'NONE';
const tail = (log, n) => log.slice(-n).map(m => m.role.toUpperCase() + ': ' + m.text).join('\n\n');

// ---------------------------------------------------------------- the loop

/**
 * @param {object}   o
 * @param {string}   o.intent      what is being built, in a sentence
 * @param {string}  [o.reference]  image the build is answering to (data URL or https)
 * @param {function} o.ask         ({system, text, images, maxTokens}) => Promise<object>
 * @param {object}   o.stage       { views?, apply(world), shoot(view), shootDiff?(view, diff) }
 * @param {function}[o.lint]       (world) => [{code, message, severity}]
 * @param {function}[o.onEvent]    (event) => void — every turn, for a trace
 * @param {Array}   [o.world]      resume from an existing world
 * @param {object}  [o.prompts]    {builder, critic} — build them with builderPrompt(DIALECT)
 *                                 to point the same loop at something that is not a building
 */
export function createLoop({ intent, reference = null, ask, stage, lint = defaultLint,
                             onEvent = () => {}, world = [], prompts = PROMPTS }) {
  if (!intent) throw new Error('createLoop needs an intent');
  if (typeof ask !== 'function') throw new Error('createLoop needs an ask() function');
  if (!stage || typeof stage.shoot !== 'function') throw new Error('createLoop needs a stage that can shoot(view)');

  const views = stage.views || CORE_VIEWS;
  const S = {
    intent, reference, world: clone(world), cycle: 0, worldVersion: 0,
    needBuild: true, lastCriticism: '', lastView: null, forcedView: null, highStreak: 0,
    viewScores: {}, lastBuild: null, builderLog: [], criticLog: [], trace: []
  };
  const say = (e) => { S.trace.push(e); onEvent(e); return e; };

  /**
   * Where to look next.
   *
   * A repair is answering a criticism made from one particular view, and the critic is
   * handed BEFORE and AFTER from that view — so the first look after a build has to be
   * from there, or it is being asked whether a change worked while shown a side the
   * change was not aimed at. (The page these prompts came from skipped ahead to the
   * next view instead, which is why its "still bad from here, go look elsewhere" rule
   * could never actually fire. Judging the repair from the repair's own view is what
   * makes that rule live.)
   *
   * After that, round the core views, preferring one that has not yet seen this
   * version of the world.
   */
  function nextView() {
    // A forced view is a suspicion to follow, but only while it can still tell you
    // something. Honouring it unconditionally makes the loop bounce between one pair
    // of opposite views forever and never reach the other four.
    if (S.forcedView) {
      const v = S.forcedView; S.forcedView = null;
      if (!S.viewScores[v] || S.viewScores[v].worldVersion !== S.worldVersion) return v;
    }
    const rv = S.lastBuild && S.lastBuild.repairView;
    if (rv && (!S.viewScores[rv] || S.viewScores[rv].worldVersion !== S.worldVersion)) return rv;
    const start = Math.max(0, views.indexOf(S.lastView));
    for (let k = 1; k <= views.length; k++) {
      const v = views[(start + k) % views.length], x = S.viewScores[v];
      if (!x || x.worldVersion !== S.worldVersion) return v;
    }
    return views[0];
  }

  async function build() {
    const before = clone(S.world);
    const repairView = S.lastView || views[0];
    const beforeShot = before.length ? await stage.shoot(repairView) : null;
    const text = 'BUILD INTENT:\n' + S.intent +
      '\n\nLAST ACCUSATION:\n' + (S.lastCriticism || 'INITIAL BUILD — no criticism yet.') +
      '\n\nCURRENT WORLD:\n' + (S.world.length ? JSON.stringify(S.world) : '[]') +
      '\n\nRECENT BUILDER CONTEXT:\n' + tail(S.builderLog, 10);

    const j = await ask({ system: prompts.builder, text, images: [S.reference].filter(Boolean), maxTokens: 3600 });

    // The cap is the point, not a safety rail: a move you cannot see the effect of is
    // a move the next observation cannot judge.
    const asked = Array.isArray(j.operations) ? j.operations : [];
    const max = before.length ? 12 : 24;
    const used = asked.slice(0, max), deferred = Math.max(0, asked.length - used.length);

    const { world: after, receipts } = applyOperations(S.world, used, { cap: max });
    S.world = after; S.worldVersion++; S.viewScores = {};
    if (deferred) receipts.push('DEFERRED ' + deferred + ' operations · one-region repair cap');
    await stage.apply(S.world);

    const diff = geometryDiff(before, after);
    S.lastBuild = { cycle: S.cycle, worldVersion: S.worldVersion, repairView,
      summary: j.summary || 'Builder move', operations: used, receipts, before, after, diff,
      beforeShot, afterShot: await stage.shoot(repairView),
      diffShot: stage.shootDiff ? await stage.shootDiff(repairView, diff) : null };
    S.builderLog.push({ role: 'assistant', text: (j.summary || '') + ' · OPS ' + used.length });
    return say({ kind: 'build', ...S.lastBuild });
  }

  async function critique(view) {
    const shot = await stage.shoot(view);
    const lb = S.lastBuild;
    const diffShot = lb && stage.shootDiff ? await stage.shootDiff(view, lb.diff) : null;
    // The labels are load-bearing. Unlabelled, the critic cannot tell the reference
    // from the render and starts describing the wrong picture.
    const text = 'IMAGE 1 ROLE=REFERENCE\nIMAGE 2 ROLE=CURRENT_WORLD VIEW=' + view + ' WORLD=' + S.worldVersion + '\n' +
      (diffShot ? 'IMAGE 3 ROLE=GEOMETRY_DIFF VIEW=' + view + '\n' : '') +
      (lb?.beforeShot ? 'IMAGE 4 ROLE=BEFORE_LAST_BUILD REPAIR_VIEW=' + lb.repairView + '\n' : '') +
      (lb?.afterShot ? 'IMAGE 5 ROLE=AFTER_LAST_BUILD REPAIR_VIEW=' + lb.repairView + '\n' : '') +
      'BUILD INTENT=' + S.intent +
      '\n\nLAST GEOMETRY CHANGE:\n' + (lb ? diffLabel(lb.diff) + ' · ' + (lb.summary || '') : 'NONE') +
      '\n\nDETERMINISTIC ACCUSATIONS:\n' + lintText(lint(S.world)) +
      '\n\nRECENT CRITIC CONTEXT:\n' + tail(S.criticLog, 8);

    const images = [S.reference, shot, diffShot, lb?.beforeShot, lb?.afterShot].filter(Boolean);
    const j = await ask({ system: prompts.critic, text, images, maxTokens: 800 });

    const score = Math.max(0, Math.min(100, Number(j.suck_score) || 0));
    const criticism = String(j.what_sucks || '').trim();
    S.viewScores[view] = { score, criticism, worldVersion: S.worldVersion };
    S.lastView = view; S.lastCriticism = criticism;
    S.criticLog.push({ role: 'assistant', text: 'SUCK ' + score + ': ' + criticism });
    return say({ kind: 'critique', view, score, criticism, shot, worldVersion: S.worldVersion });
  }

  /** One half-turn: build if a build is owed, then look from somewhere. */
  async function step() {
    if (S.needBuild) { S.cycle++; await build(); }
    const view = nextView();
    const { score, criticism } = await critique(view);

    if (score >= LOW_THRESHOLD) {
      S.highStreak = (S.lastBuild && S.lastBuild.repairView === view) ? S.highStreak + 1 : 1;
      if (S.highStreak >= 2) {
        // Twice from the view it was aimed at. More geometry is not the answer yet.
        S.needBuild = false; S.forcedView = opposite(view); S.highStreak = 0;
        say({ kind: 'policy', move: 'stress', from: view, to: S.forcedView,
              why: 'still bad from the repair view — look before patching again' });
      } else { S.needBuild = true; }
    } else {
      // A low score is one camera's silence, not a verdict.
      S.highStreak = 0; S.needBuild = false; S.forcedView = opposite(view);
      say({ kind: 'policy', move: 'verify', from: view, to: S.forcedView,
            why: 'this view found little — do not celebrate, look opposite' });
    }
    return { view, score, criticism };
  }

  /** Settled means every core view is quiet on *this* version of the world, and the
   *  deterministic checks are quiet too. One quiet view has never meant anything. */
  function settled() {
    const hard = lint(S.world).filter(x => x.severity === 'high' || x.severity === 'critical').length;
    const quiet = views.filter(v => S.viewScores[v] &&
      S.viewScores[v].worldVersion === S.worldVersion && S.viewScores[v].score < LOW_THRESHOLD).length;
    return quiet === views.length && hard === 0;
  }

  /**
   * `cycles` counts builds, and a step does not always build — a run that is only
   * looking would never reach the cycle count and never stop, so steps are bounded
   * too. It takes at least one look per view to settle, so the ceiling allows for that
   * plus the builds.
   */
  async function run({ cycles = 6, until = settled, maxSteps = cycles * (views.length + 2) } = {}) {
    let steps = 0;
    while (S.cycle < cycles && steps < maxSteps && !until()) { await step(); steps++; }
    return { world: S.world, cycles: S.cycle, steps, settled: settled(), trace: S.trace };
  }

  return { step, run, settled, nextView,
    get world() { return S.world; }, get trace() { return S.trace; },
    get cycle() { return S.cycle; }, get scores() { return S.viewScores; },
    /** Drop a note in as if the critic had said it — this is the human's seat. */
    tell(note) { S.lastCriticism = (S.lastCriticism ? S.lastCriticism + '\n' : '') + 'USER: ' + note; S.needBuild = true; } };
}
