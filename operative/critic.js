// operative/critic.js — FUCKED UNTIL PROVEN OTHERWISE.
//
// The default state of a build is not "probably correct". Every check in
// checks.js answers a question someone thought to ask. This file exists for the
// enormous set of problems nobody thought to ask about — the ones you can only
// find by looking at the thing.
//
//   BUILD -> TAKE PICTURE -> REFERENCE vs PICTURE -> ASSUME IT IS FUCKED ->
//   WHAT SUCKS? -> SUCK SCORE -> CRITICISM BECOMES THE NEXT PROMPT -> BUILD AGAIN
//
// The one rule that makes this different from a scoring loop: a low score is not
// a result. It means this camera failed to find a problem. So it triggers a move,
// not a celebration.
//
//   "Looks good from here."   ->   "Fine. Look somewhere else."
//
// Nothing in this file calls a model. It is the protocol — the scoring, the
// arithmetic, the stop condition, the prompt text. Whoever answers the prompt
// (a person, an API) plugs in at `judge`.

import { VIEWS, chooseView, OPPOSITE } from './views.js';

/** What the numbers mean. Deliberately blunt. */
export const SCALE = [
  [100, 'completely wrong'],
  [80,  'major design or form failure'],
  [60,  'recognizable but materially wrong'],
  [40,  'substantial visible discrepancies'],
  [20,  'mostly convincing, still clear problems'],
  [10,  'small but real discrepancy'],
  [0,   'cannot identify a meaningful discrepancy FROM THIS VIEW']
];
export const meaning = (n) => (SCALE.find(([v]) => n >= v) || SCALE[SCALE.length - 1])[1];

/** Below this a view has failed to find a problem, and the camera moves. */
export const THRESHOLD = 15;

/** How many views must come back clean, per kind, before the sweep counts. */
export const SWEEP = { exterior: 3, interior: 2, plan: 1, service: 1 };

/**
 * The world's score is the WORST recent view, never the average.
 *
 *   front 8, left 12, rear 76, interior 84, plan 21  ->  average 40.2
 *
 * which disguises the failure completely. A building that works from four views
 * and falls apart from the fifth is fucked. Max, not mean.
 */
export function worldScore(observations, window = VIEWS.length) {
  const latest = new Map();
  for (const o of observations) latest.set(o.view, o);      // last score per view wins
  const recent = [...latest.values()].slice(-window);
  if (!recent.length) return { score: 100, worst: null, views: [] };
  const worst = recent.reduce((a, o) => (o.score > a.score ? o : a), recent[0]);
  return {
    score: worst.score, worst: worst.view,
    views: recent.map(o => ({ view: o.view, label: o.label, score: o.score, fucked: o.score > THRESHOLD }))
  };
}

/**
 * Not DONE. Never DONE. "Not currently fucked" — and any new camera, request,
 * structural check or reference discrepancy reopens it immediately.
 */
export function settlement(observations, hardFailures = 0) {
  const { score, views } = worldScore(observations);
  const clean = {};
  for (const o of observations.slice().reverse()) {
    const v = VIEWS.find(x => x.id === o.view);
    if (!v) continue;
    clean[v.kind] = clean[v.kind] || new Set();
    if (o.score <= THRESHOLD) clean[v.kind].add(o.view);
  }
  const need = Object.entries(SWEEP).map(([kind, n]) => ({
    kind, need: n, have: (clean[kind] || new Set()).size, met: (clean[kind] || new Set()).size >= n
  }));
  const swept = need.every(n => n.met);
  return {
    state: hardFailures === 0 && swept ? 'NOT CURRENTLY FUCKED' : 'FUCKED',
    score, hardFailures, sweep: need, views,
    why: hardFailures ? `${hardFailures} deterministic failure${hardFailures === 1 ? '' : 's'} still open`
       : swept ? 'a full sweep of materially different views has failed to find a problem'
       : `still unswept: ${need.filter(n => !n.met).map(n => `${n.kind} ${n.have}/${n.need}`).join(', ')}`
  };
}

/**
 * The critic prompt. Small on purpose. It does not ask for a fix, a plan, or
 * code — an evaluator that proposes repairs starts defending them.
 */
export const CRITIC_PROMPT = `You are the critic.

REFERENCE IMAGE is what this is trying to become.
CURRENT IMAGE is what the current build actually produced, seen from {VIEW}.

Assume the current build is fucked.

Look carefully.

Say what you actually see that sucks compared with the reference.

Do not praise it.
Do not explain how to fix it.
Do not write code.
Do not propose operations.

Concentrate on visible differences:
form
proportion
silhouette
spatial relationships
composition
missing parts
wrong parts
broken connections
implausible construction
things that only work from this camera angle

Return exactly:

SUCK SCORE: 0-100

WHAT SUCKS:
A concise, concrete criticism.

A score of 0 does NOT mean the building is finished.
It only means you cannot identify a consequential problem from this image.`;

/**
 * The builder prompt. The criticism goes in verbatim — no translation layer, no
 * summarising, no softening. The accusation is the instruction.
 */
export function builderPrompt(whatSucks, deterministic, view) {
  const lines = [
    'Continue the current build.',
    '',
    `Here is what the last observation found, looking from ${view}:`,
    '',
    `"${String(whatSucks).trim()}"`
  ];
  if (deterministic && deterministic.length) {
    lines.push('', 'WHAT SUCKS DETERMINISTICALLY:',
      ...deterministic.slice(0, 12).map(c => `${c.code} ${c.message}`));
  }
  lines.push('', 'Work from the current state.', 'Build again.', 'Run it.',
             'Stop after producing the changed world.');
  return lines.join('\n');
}

/** The linters simply join the accusation. No fusion mechanism. */
export function accusation(whatSucks, conditions) {
  const out = [];
  if (whatSucks) out.push('WHAT SUCKS VISUALLY:', String(whatSucks).trim());
  if (conditions && conditions.length) {
    out.push('', 'WHAT SUCKS DETERMINISTICALLY:');
    for (const c of conditions.slice(0, 20)) out.push(`${c.code} ${c.message}`);
  }
  return out.join('\n');
}

/**
 * One turn of the loop, given something that can look at a picture.
 * `judge(referenceImage, currentImage, viewLabel) -> { score, whatSucks }`
 */
export async function turn(world, { observations = [], reference, shoot, judge, conditions = [], lastView, after, hint }) {
  const view = chooseView(observations, { lastView, after, hint });
  const image = await shoot(view);
  const verdict = await judge(reference, image, view.label);
  const o = {
    view: view.id, label: view.label, score: clamp(verdict.score),
    whatSucks: verdict.whatSucks || '', image, t: observations.length,
    origin: 'render'                    // never confuse the picture with the reference
  };
  const next = [...observations, o];
  return {
    observation: o,
    world: worldScore(next),
    settlement: settlement(next, conditions.length),
    // a low score does not mean done; it means move
    instruction: o.score > THRESHOLD
      ? builderPrompt(o.whatSucks, conditions, view.label)
      : null,
    nextView: o.score > THRESHOLD ? chooseView(next, { lastView: view.id, after: true, hint: o.whatSucks })
                                  : chooseView(next, { lastView: view.id }),
    observations: next
  };
}
const clamp = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

/** Parse the critic's reply. Tolerant, because a model will format it six ways. */
export function parseVerdict(text) {
  const t = String(text || '');
  const m = t.match(/SUCK\s*SCORE\s*[:=]?\s*(\d{1,3})/i) || t.match(/\b(\d{1,3})\s*\/\s*100\b/);
  const w = t.split(/WHAT\s*SUCKS\s*[:]?/i);
  return {
    score: clamp(m ? m[1] : 100),
    whatSucks: (w.length > 1 ? w[1] : t).replace(/^\s*[\r\n]+/, '').trim(),
    raw: t
  };
}
