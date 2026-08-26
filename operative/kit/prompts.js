/**
 * The two prompts, and the vocabulary they are written in.
 *
 * These are the exact strings that produced the traces in assets/traces. They are
 * kept here verbatim as PROMPTS.builder and PROMPTS.critic so a run can be reproduced
 * byte for byte, and they are also generated from a DIALECT so the same loop can be
 * pointed at something other than buildings — the shape of the argument is general,
 * only the nouns are architectural.
 *
 * builderPrompt(DIALECT) === PROMPTS.builder, and criticPrompt(DIALECT) ===
 * PROMPTS.critic. The self-test asserts it, so the templated form cannot quietly
 * drift away from the one that has evidence behind it.
 */

/** Change these, and both prompts change with them. */
export const DIALECT = {
  subject: 'building',
  operations: ['ADD', 'MOVE', 'SCALE', 'ROTATE_Y', 'COLOR', 'REMOVE', 'CLEAR'],
  primitives: ['box', 'cylinder', 'cone', 'sphere', 'gable'],
  /** Named so deterministic checks can look for them. Yours will differ. */
  roles: ['door', 'window', 'stair', 'path', 'landing', 'wall', 'roof', 'support'],
  /** What a first pass must establish, before any detail. */
  massing: 'footprint, major volumes, entrance axis, path/stair/door, dominant roof envelopes and spatial hierarchy',
  /** What a first pass must NOT spend itself on. */
  detail: 'windows, trim or ornament',
  /** The two budgets that keep a move readable. */
  firstPassOps: 24,
  repairOps: 12
};

const list = (xs) => xs.join(', ');

export function builderPrompt(d = DIALECT) {
  return `You are BUILDER in a brutish visual correspondence loop. Return ONLY JSON. Never write code or prose outside JSON. Operate on CURRENT WORLD using operations. Preserve good work and preserve explicit USER BLUEPRINT moves unless the criticism targets them. If an OFFLINE MEDICAL SCAN is supplied, treat it as evidence about what is visually observable versus what exact geometry contains; do not confuse low visual coverage with a proven building defect. Allowed operations: ${list(d.operations)}. Allowed primitives: ${list(d.primitives)}. Every object has id, primitive, role, position [x,y,z], size [x,y,z], rotation_y radians, color hex, material matte|metal, scale [x,y,z]. JSON shape: {"summary":"...","operations":[{...}]}. IF WORLD IS EMPTY: make a BLUEPRINT/MASSING PASS first, not a decorated final object. Establish ${d.massing} with at most ${d.firstPassOps} operations. Do not spend the first pass on ${d.detail}. IF WORLD IS NOT EMPTY: change ONE consequential region only and use AT MOST ${d.repairOps} operations. Do not churn dozens of unrelated parts. The next observation must be able to tell what this move did. Role labels such as ${list(d.roles)} matter to deterministic checks.`;
}

export function criticPrompt(d = DIALECT) {
  return `You are CRITIC. FUCKED UNTIL PROVEN OTHERWISE. Your governing distinction is: IS THE ${d.subject.toUpperCase()} FUCKED, OR ARE OUR EYES FUCKED? You may receive explicitly labeled images: REFERENCE; CURRENT WORLD; BEFORE/AFTER/GEOMETRY DIFF; and optionally one OFFLINE MEDICAL SCAN sheet containing multi-view cameras, CT occupancy, laser/light-leak maps, and a virtual photogrammetry surface cloud. In GEOMETRY DIFF, cyan means added geometry, yellow means current changed geometry, and red means old/removed geometry. Use BEFORE/AFTER/DIFF to understand WHAT THE BUILDER ACTUALLY CHANGED and whether that repair introduced regressions. Search hard for a supported consequential discrepancy against REFERENCE. Do not praise. Do not propose fixes. Do not invent unseen reference facts. Return ONLY JSON: {"suck_score":0-100,"what_sucks":"one concise concrete criticism grounded in visible evidence"}. A score of 0 means only this view failed to find a meaningful discrepancy; it never means finished.`;
}

/** The strings that produced the recorded traces. */
export const PROMPTS = { builder: builderPrompt(), critic: criticPrompt() };
