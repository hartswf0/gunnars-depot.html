// operative/baked.js — the trailer, already built.
//
// `build()` is the whole point of this project: a seed, a brief, and a loop that
// answers the difference that makes the most difference, two hundred and thirty
// times over. It also takes two hundred seconds, and it is synchronous, and four
// pages on this site called it on load.
//
// In a terminal that is a coffee. In a browser it is a tab that never paints and
// then offers to kill itself, which is what every visitor to this site has seen:
// "Reading the sheet…", forever, and then Page Unresponsive. The building was
// perfect and nobody could look at it.
//
// So the loop runs once, in `tools/bake-world.mjs`, and writes down what it did.
// This reads that back. The finished world is the same object the instruments
// take — real `Element`s in a real `World`, not a picture of one — so radiography,
// the checks, the colony and the hospital all work on it unchanged.
//
// The journal is stored as deltas, because it is not. Two hundred and thirty-five
// full snapshots of five hundred elements is a hundred megabytes; the same history
// as "what changed at each step" is under one, and the difference is the whole of
// whether the film can be watched over a phone.

import { World, Element } from './world.js';

export const BAKED = 'assets/built/trailer.json';

/** Rebuild a World from a flat list of element records. */
export function worldFrom(elements, walls, datum) {
  const w = new World();
  for (const e of elements) w.add(new Element(e));
  if (walls) w.walls = walls;
  if (datum) w.datum = datum;
  return w;
}

/**
 * The finished trailer, as the loop left it.
 *
 * `joints` come back too. The support graph reads them, and a trailer whose
 * joints were dropped in the bake reports every part in it as unfastened — which
 * is a fact about the bake.
 */
export function finished(doc) {
  const w = worldFrom(doc.elements, doc.walls, doc.datum);
  for (const j of doc.joints || []) w.joints.set(j.key, j.value);
  w.conditions = doc.conditions || [];
  return w;
}

/**
 * Every state the trailer was actually in, replayed from the deltas.
 *
 * Returned as worlds rather than as diffs because that is what a scrubber wants,
 * and building five hundred small objects two hundred times is about a second —
 * two hundred times cheaper than the loop that discovered them.
 */
export function replay(doc) {
  const live = new Map();
  const frames = [];
  for (const rec of doc.journal) {
    for (const id of rec.del || []) live.delete(id);
    for (const e of rec.add || []) live.set(e.id, e);
    for (const e of rec.mod || []) live.set(e.id, e);
    frames.push({
      world: worldFrom([...live.values()], doc.walls, doc.datum),
      title: rec.title, sub: rec.sub,
      opened: rec.opened || [], closed: rec.closed || [], changed: rec.changed || []
    });
  }
  return frames;
}

/**
 * Fetch it. One request, and the page is drawing before the spinner has turned.
 */
export async function load(url = BAKED) {
  const r = await fetch(url + '?v=' + (window.BAKED_V || '1'));
  if (!r.ok) throw new Error(`no baked trailer at ${url} (${r.status})`);
  return r.json();
}
