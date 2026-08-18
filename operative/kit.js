// operative/kit.js — the seed build.
//
// Not decoration: every member here is an individually addressable element with
// a real section, a real span, and a real place in the support graph. The
// dimensions are the ones discovered in assets/models/*.stl (deck top z=14,
// shell 72 x 144, wall top z=76, shed roof rising across the width).
import { World, Element, SECTIONS } from './world.js';
import { box } from './geom.js';

export const KIT = Object.freeze({
  width: 72, length: 144,
  padTop: 1.75,            // blocking under the chassis (a parked trailer bears here)
  railDepth: 6.0,
  deckTop: 14.0, deckThick: 0.75,
  joistSection: '2x6', joistSpacing: 16,
  plateSection: '2x4', studSpacing: 16,
  wallTop: 76.0,
  rafterSection: '2x6', rafterSpacing: 16, roofRise: 0, eave: 3.0,   // the seed roof is dead flat on purpose; the reference has an opinion about that
  sheathing: 0.5
});

const S = (name) => SECTIONS[name];

/** Even o.c. layout across a run, always landing a member at both ends. */
export function layout(runStart, runEnd, spacing, thickness) {
  const pts = [];
  const first = runStart + thickness / 2;
  const last = runEnd - thickness / 2;
  for (let c = first; c < last - 0.01; c += spacing) pts.push(c);
  pts.push(last);
  return pts;
}

export function seedTrailer(world = new World()) {
  const K = KIT;
  const [jT, jD] = S(K.joistSection);
  const [pT, pD] = S(K.plateSection);      // 1.5 thick, 3.5 deep
  const [rT, rD] = S(K.rafterSection);

  const deckBot = K.deckTop - K.deckThick;     // 13.25
  const joistTop = deckBot, joistBot = joistTop - jD;   // 7.75
  const railTop = joistBot, railBot = railTop - K.railDepth; // 1.75
  const add = (o) => world.add(new Element(o));

  // ---- foundation: blocking, chassis rails, crossmembers, wheels ----
  for (const x of [6, 66]) {
    for (const y of [12, 132]) {
      add({ id: `pad.${x}.${y}`, kind: 'pad', layer: 'foundation', material: 'concrete',
            box: box([x, y, K.padTop / 2], [10, 10, K.padTop]), meta: { role: 'bearing point' } });
    }
    add({ id: `rail.${x < 36 ? 'L' : 'R'}`, kind: 'chassis', layer: 'foundation', material: 'steel',
          section: 'C6', box: box([x, K.length / 2, (railBot + railTop) / 2], [3, K.length, K.railDepth]),
          meta: { role: 'main rail', spanAxis: 'y' } });
  }
  // Crossmembers fit *between* the rail webs and are welded, not seated. Cutting
  // them through the rails (the first attempt) read as interpenetration, which is
  // what it would have been in steel.
  const railInner = 7.5, railOuter = 64.5;
  for (const y of [12, 48, 84, 120, 138]) {
    add({ id: `cross.${y}`, kind: 'chassis', layer: 'foundation', material: 'steel', section: 'C4',
          box: box([(railInner + railOuter) / 2, y, railBot + 2], [railOuter - railInner, 2, 4]),
          meta: { role: 'crossmember', spanAxis: 'x', joint: 'welded to rail web' } });
  }
  // Wheels ride outside the deck. Placed inboard first, they drove a bore-sized
  // hole through rail, deck, sole plate, stud and shell all at once; the world
  // reported six overlaps and the axle moved out where it belongs.
  for (const x of [-5, K.width + 5]) {   // clear of the 0.5 in exterior shell
    add({ id: `wheel.${x < 36 ? 'L' : 'R'}`, kind: 'wheel', layer: 'foundation', material: 'steel',
          box: box([x, 96, 13], [8, 26, 26]), meta: { role: 'axle assembly', radius: 13 } });
  }

  // ---- foundation: floor joists + deck ----
  for (const y of layout(0, K.length, K.joistSpacing, jT)) {
    add({ id: `joist.${y.toFixed(0)}`, kind: 'joist', layer: 'foundation', material: 'treated_wood',
          section: K.joistSection, box: box([K.width / 2, y, joistBot + jD / 2], [K.width, jT, jD]),
          meta: { spanAxis: 'x', clearSpan: 60 } });
  }
  add({ id: 'deck', kind: 'deck', layer: 'foundation', material: 'plywood',
        box: box([K.width / 2, K.length / 2, deckBot + K.deckThick / 2], [K.width, K.length, K.deckThick]),
        meta: { role: 'floor sheathing' } });

  // ---- frame: plates + studs on four walls ----
  const plateBot = K.deckTop;
  const soleTop = plateBot + pT;                 // 15.5
  const topPlateBot = K.wallTop - 2 * pT;        // 73.0
  const studLen = topPlateBot - soleTop;         // 57.5

  const walls = world.walls = [
    { id: 'W', axis: 'y', at: pD / 2,            from: 0, to: K.length, normal: [-1, 0, 0] },
    { id: 'E', axis: 'y', at: K.width - pD / 2,  from: 0, to: K.length, normal: [1, 0, 0] },
    { id: 'S', axis: 'x', at: pD / 2,            from: pD, to: K.width - pD, normal: [0, -1, 0] },
    { id: 'N', axis: 'x', at: K.length - pD / 2, from: pD, to: K.width - pD, normal: [0, 1, 0] }
  ];
  for (const w of walls) {
    const along = w.axis; // members are spaced along this axis
    const plateSize = along === 'y' ? [pD, w.to - w.from, pT] : [w.to - w.from, pD, pT];
    const plateP = (z) => along === 'y'
      ? [w.at, (w.from + w.to) / 2, z] : [(w.from + w.to) / 2, w.at, z];
    add({ id: `sole.${w.id}`, kind: 'plate', layer: 'frame', material: 'treated_wood', section: K.plateSection,
          box: box(plateP(plateBot + pT / 2), plateSize), meta: { role: 'sole plate', wall: w.id } });
    for (let i = 0; i < 2; i++) {
      add({ id: `top${i + 1}.${w.id}`, kind: 'plate', layer: 'frame', material: 'engineered_lumber', section: K.plateSection,
            box: box(plateP(topPlateBot + pT / 2 + i * pT), plateSize),
            meta: { role: i ? 'upper top plate' : 'lower top plate', wall: w.id } });
    }
    for (const u of layout(w.from, w.to, K.studSpacing, pT)) {
      const p = along === 'y' ? [w.at, u, soleTop + studLen / 2] : [u, w.at, soleTop + studLen / 2];
      const s = along === 'y' ? [pD, pT, studLen] : [pT, pD, studLen];
      add({ id: `stud.${w.id}.${u.toFixed(0)}`, kind: 'stud', layer: 'frame', material: 'treated_wood',
            section: K.plateSection, box: box(p, s),
            meta: { wall: w.id, u, bearing: w.axis === 'y', spanAxis: 'z' } });
    }
  }

  // ---- walls: exterior sheathing, one panel per wall ----
  for (const w of walls) {
    const t = K.sheathing;
    const outward = w.axis === 'y' ? 0 : 1;
    const p = outward === 0
      ? [w.at + w.normal[0] * (pD / 2 + t / 2), K.length / 2, (plateBot + K.wallTop) / 2]
      : [K.width / 2, w.at + w.normal[1] * (pD / 2 + t / 2), (plateBot + K.wallTop) / 2];
    const s = outward === 0 ? [t, K.length, K.wallTop - plateBot] : [K.width, t, K.wallTop - plateBot];
    add({ id: `shell.${w.id}`, kind: 'sheathing', layer: 'walls', material: 'siding',
          box: box(p, s), meta: { wall: w.id, role: 'exterior shell' } });
  }

  // ---- roof: shed rafters rising west -> east, plus cover ----
  // Sheared members: the rafter is a parallelepiped, not a block. Its low end
  // bears on the west top plate, its high end on the east.
  const rise = K.roofRise;
  const rafterWidth = K.width + 2 * K.eave;
  const rafterRise = rise * (rafterWidth / K.width);
  const rafterZ = K.wallTop + rD / 2;
  for (const y of layout(0, K.length, K.rafterSpacing, rT)) {
    add({ id: `rafter.${y.toFixed(0)}`, kind: 'rafter', layer: 'roof', material: 'treated_wood', section: K.rafterSection,
          box: box([K.width / 2, y, rafterZ + rise / 2], [rafterWidth, rT, rD]),
          shear: { axis: 'x', rise: rafterRise },
          meta: { spanAxis: 'x', clearSpan: K.width - 2 * pD, rise, role: 'shed rafter' } });
  }
  add({ id: 'roof.cover', kind: 'panel', layer: 'roof', material: 'corrugated_metal',
        box: box([K.width / 2, K.length / 2, rafterZ + rise / 2 + rD / 2 + 0.5], [rafterWidth, K.length + 2 * K.eave, 1.0]),
        shear: { axis: 'x', rise: rafterRise },
        meta: { role: 'roof cover', slope: `${rise}:${K.width}` } });

  world.walls = Object.fromEntries(walls.map(w => [w.id,
    { ...w, thickness: pD, sillTop: soleTop, topPlateBot, wallTop: K.wallTop }]));
  world.datum = { deckTop: K.deckTop, wallTop: K.wallTop, plateBot, soleTop, topPlateBot, studLen, width: K.width, length: K.length, rise: K.roofRise };
  world.record({ kind: 'seed', note: `seed trailer kit placed: ${world.elements.size} elements`, elements: [] });
  return world;
}
