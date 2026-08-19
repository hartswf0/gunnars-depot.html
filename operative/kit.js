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
  wheelInboard: false, railInset: 6,
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

/**
 * `spec` overrides the kit defaults, so the same construction logic can build a
 * 6x12 utility shell or the 8'-6" x 20'-0" envelope the reference sheets specify.
 * The 6x12 remains the default; nothing that already worked changes.
 */
export function seedTrailer(world = new World(), spec = {}) {
  const K = { ...KIT, ...spec };
  const [jT, jD] = S(K.joistSection);
  const [pT, pD] = S(K.plateSection);      // 1.5 thick, 3.5 deep
  const [rT, rD] = S(K.rafterSection);

  const deckBot = K.deckTop - K.deckThick;     // 13.25
  const joistTop = deckBot, joistBot = joistTop - jD;   // 7.75
  const railTop = joistBot, railBot = railTop - K.railDepth; // 1.75
  const add = (o) => world.add(new Element(o));

  // ---- foundation: blocking, chassis rails, crossmembers, wheels ----
  const railX = [K.railInset, K.width - K.railInset];
  const padY = [12, K.length - 12];
  for (const x of railX) {
    for (const y of padY) {
      add({ id: `pad.${x}.${y}`, kind: 'pad', layer: 'foundation', material: 'concrete',
            box: box([x, y, K.padTop / 2], [10, 10, K.padTop]), meta: { role: 'bearing point' } });
    }
    add({ id: `rail.${x < K.width / 2 ? 'L' : 'R'}`, kind: 'chassis', layer: 'foundation', material: 'steel',
          section: 'C6', box: box([x, K.length / 2, (railBot + railTop) / 2], [3, K.length, K.railDepth]),
          meta: { role: 'main rail', spanAxis: 'y' } });
  }
  // Crossmembers fit *between* the rail webs and are welded, not seated. Cutting
  // them through the rails (the first attempt) read as interpenetration, which is
  // what it would have been in steel.
  const railInner = K.railInset + 1.5, railOuter = K.width - K.railInset - 1.5;
  const crossY = [];
  for (let y = 12; y <= K.length - 6; y += 36) crossY.push(y);
  crossY.push(K.length - 6);
  for (const y of crossY) {
    add({ id: `cross.${y}`, kind: 'chassis', layer: 'foundation', material: 'steel', section: 'C4',
          box: box([(railInner + railOuter) / 2, y, railBot + 2], [railOuter - railInner, 2, 4]),
          meta: { role: 'crossmember', spanAxis: 'x', joint: 'welded to rail web' } });
  }
  // Wheels ride outside the deck. Placed inboard first, they drove a bore-sized
  // hole through rail, deck, sole plate, stud and shell all at once; the world
  // reported six overlaps and the axle moved out where it belongs.
  // Tandem axles sit under the load, spaced by length; a 20-footer does not carry
  // its weight where a 12-footer does.
  const axleY = K.length > 180 ? [K.length * 0.55, K.length * 0.55 + 34] : [K.length * 0.66];
  // Outboard axles put the 8'-6" sheet envelope at 120 in overall. On a real
  // road-legal trailer the wheels tuck inside the width and the floor is cut
  // around them, which is what `wheelInboard` asks for here.
  // Outboard of the main rails, inboard of the sheathing: the only place an axle
  // fits on an 8'-6" overall trailer. The floor then has to be cut around it.
  const wheelX = K.wheelInboard
    ? [K.railInset - 1.5 - 4.5, K.width - (K.railInset - 1.5 - 4.5)]
    : [-5, K.width + 5];
  for (const x of wheelX) {   // clear of the 0.5 in exterior shell
    const side = x < K.width / 2 ? 'L' : 'R';
    axleY.forEach((y, i) => {
      add({ id: `wheel.${side}${axleY.length > 1 ? i + 1 : ''}`, kind: 'wheel', layer: 'foundation', material: 'steel',
            box: box([x, y, 13], [8, 26, 26]), meta: { role: 'axle assembly', radius: 13 } });
    });
  }

  // ---- wheel wells ----------------------------------------------------------
  // Not a styling choice. At 102 in overall the axles must sit inside the width,
  // and at 126 in overall height the floor cannot be lifted above a 26 in wheel
  // (rails over the tyre put the deck at 32.5 in, which busts the height by 5 in).
  // So the floor stops at the rail over the axles and the wheel comes up into the
  // room inside a boxed well. The geometry decided this, not the drawing.
  const wellTop = K.deckTop + 13.5;   // a 15 in ledge above the floor, wherever the floor ends up
  const wells = [];
  if (K.wheelInboard) {
    const y0 = Math.min(...axleY) - 17, y1 = Math.max(...axleY) + 17;
    wells.push({ side: 'W', x0: 0, x1: railInner, y0, y1 },
               { side: 'E', x0: railOuter, x1: K.width, y0, y1 });
  }
  const inWell = (y) => wells.length && y > wells[0].y0 - jT && y < wells[0].y1 + jT;

  // ---- foundation: floor joists + deck ----
  for (const y of layout(0, K.length, K.joistSpacing, jT)) {
    // Over the axles a joist stops at the rails — but it has to land *on* them, not
    // beside them. Trimmed to the inner face it bore on nothing, and seventeen
    // members above it were left hanging.
    const railOut = K.railInset - 1.5, railFar = K.width - K.railInset + 1.5;
    const x0 = inWell(y) ? railOut : 0, x1 = inWell(y) ? railFar : K.width;
    add({ id: `joist.${y.toFixed(0)}`, kind: 'joist', layer: 'foundation', material: 'treated_wood',
          section: K.joistSection, box: box([(x0 + x1) / 2, y, joistBot + jD / 2], [x1 - x0, jT, jD]),
          meta: { spanAxis: 'x', clearSpan: 60, trimmed: inWell(y) } });
  }
  if (!wells.length) {
    add({ id: 'deck', kind: 'deck', layer: 'foundation', material: 'plywood',
          box: box([K.width / 2, K.length / 2, deckBot + K.deckThick / 2], [K.width, K.length, K.deckThick]),
          meta: { role: 'floor sheathing' } });
  } else {
    const { y0, y1 } = wells[0];
    const panel = (id, ax0, ax1, ay0, ay1) => add({ id, kind: 'deck', layer: 'foundation', material: 'plywood',
      box: box([(ax0 + ax1) / 2, (ay0 + ay1) / 2, deckBot + K.deckThick / 2], [ax1 - ax0, ay1 - ay0, K.deckThick]),
      meta: { role: 'floor sheathing' } });
    panel('deck.fore', 0, K.width, 0, y0);
    // The deck stops at the wells' inboard faces. Run out to the rails (where the
    // trimmed joists end) and it occupies the same 0.75 in as the well boards —
    // six overlaps, reported the moment the joists were widened to bear.
    panel('deck.axle', railInner, railOuter, y0, y1);
    panel('deck.aft', 0, K.width, y1, K.length);
    for (const w of wells) {
      const cx = (w.x0 + w.x1) / 2, cy = (y0 + y1) / 2;
      add({ id: `well.${w.side}.cap`, kind: 'wellcap', layer: 'foundation', material: 'plywood',
            box: box([cx, cy, wellTop + 0.75], [w.x1 - w.x0, y1 - y0, 1.5]),
            meta: { role: 'wheel well cap — the wall above bears on this', side: w.side } });
      const inner = w.side === 'W' ? w.x1 - 0.375 : w.x0 + 0.375;
      add({ id: `well.${w.side}.side`, kind: 'wellside', layer: 'foundation', material: 'plywood',
            box: box([inner, cy, (deckBot + wellTop) / 2], [0.75, y1 - y0, wellTop - deckBot]),
            meta: { role: 'wheel well inboard face', side: w.side } });
      // the end boards butt against the inboard face rather than running through it
      const ex0 = w.side === 'W' ? w.x0 : w.x0 + 0.75;
      const ex1 = w.side === 'W' ? w.x1 - 0.75 : w.x1;
      for (const [tag, ey] of [['fore', y0 + 0.375], ['aft', y1 - 0.375]])
        add({ id: `well.${w.side}.${tag}`, kind: 'wellside', layer: 'foundation', material: 'plywood',
              box: box([(ex0 + ex1) / 2, ey, (deckBot + wellTop) / 2], [ex1 - ex0, 0.75, wellTop - deckBot]),
              meta: { role: 'wheel well end', side: w.side } });
    }
  }

  // ---- frame: plates + studs on four walls ----
  const plateBot = K.deckTop;
  const soleTop = plateBot + pT;                 // 15.5
  const topPlateBot = K.wallTop - 2 * pT;        // 73.0
  const studLen = topPlateBot - soleTop;         // 57.5

  const walls = [
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
    const wellHere = wells.find(x => x.side === w.id);
    if (!wellHere) {
      add({ id: `sole.${w.id}`, kind: 'plate', layer: 'frame', material: 'treated_wood', section: K.plateSection,
            box: box(plateP(plateBot + pT / 2), plateSize), meta: { role: 'sole plate', wall: w.id } });
    } else {
      // the sole plate stops either side of the well; over it the wall bears on the cap
      const segs = [[w.from, wellHere.y0], [wellHere.y1, w.to]];
      segs.forEach(([a, b2], i) => {
        if (b2 - a < 6) return;
        add({ id: `sole.${w.id}.${i}`, kind: 'plate', layer: 'frame', material: 'treated_wood', section: K.plateSection,
              box: box([w.at, (a + b2) / 2, plateBot + pT / 2], [pD, b2 - a, pT]),
              meta: { role: 'sole plate', wall: w.id } });
      });
      add({ id: `sole.${w.id}.well`, kind: 'plate', layer: 'frame', material: 'treated_wood', section: K.plateSection,
            box: box([w.at, (wellHere.y0 + wellHere.y1) / 2, wellTop + 1.5 + pT / 2], [pD, wellHere.y1 - wellHere.y0, pT]),
            meta: { role: 'sole plate on the wheel well cap', wall: w.id } });
    }
    for (let i = 0; i < 2; i++) {
      add({ id: `top${i + 1}.${w.id}`, kind: 'plate', layer: 'frame', material: 'engineered_lumber', section: K.plateSection,
            box: box(plateP(topPlateBot + pT / 2 + i * pT), plateSize),
            meta: { role: i ? 'upper top plate' : 'lower top plate', wall: w.id } });
    }
    for (const u of layout(w.from, w.to, K.studSpacing, pT)) {
      // A stud over the wheel well is shorter: it starts on the well's own plate,
      // not on the floor, because the floor is not there.
      const overWell = !!(wellHere && u > wellHere.y0 && u < wellHere.y1);
      const base = overWell ? wellTop + 1.5 + pT : soleTop;
      const len = topPlateBot - base;
      const p = along === 'y' ? [w.at, u, base + len / 2] : [u, w.at, base + len / 2];
      const s = along === 'y' ? [pD, pT, len] : [pT, pD, len];
      add({ id: `stud.${w.id}.${u.toFixed(0)}`, kind: 'stud', layer: 'frame', material: 'treated_wood',
            section: K.plateSection, box: box(p, s),
            meta: { wall: w.id, u, bearing: w.axis === 'y', spanAxis: 'z', overWell } });
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
