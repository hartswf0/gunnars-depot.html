// tools/inhabit-plates.mjs — where a body fits, drawn as a plan.
//   node tools/inhabit-plates.mjs [outdir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { png } from './png.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'assets/inhabit'));
fs.mkdirSync(OUT, { recursive: true });

const { build } = await import(ROOT + '/operative/ingold.js');
const IH = await import(ROOT + '/operative/inhabit.js');
const world = build({ budget: 200 }).world;
const col = IH.bodyColony(world, { n: 40, ticks: 900, seed: 7 });
const fm = col.fitMap;
const { n, at, step, lo } = fm;

// A plan is drawn with the trailer lying along the page: x across, y down.
const SCALE = 4;
const W = n[0] * SCALE, H = n[1] * SCALE;
const GROUND = [16, 20, 26], WALL = [58, 66, 78], BLOCK = [96, 78, 52];
const YES = [24, 190, 150], NO = [190, 60, 52];

/**
 * A plan, drawn with the trailer lying along the page. Screen y runs down, plan y
 * runs up the trailer, so the row is flipped: otherwise every plate comes out
 * back to front and reads as a different building.
 */
function plate(file, colour) {
  const rgb = (x, y) => {
    const i = Math.floor(x / SCALE), j = n[1] - 1 - Math.floor(y / SCALE);
    if (i < 0 || j < 0 || i >= n[0] || j >= n[1]) return GROUND;
    const k = at(i, j);
    if (!fm.plan.inside[k]) return WALL;
    if (fm.plan.blocked[k]) return BLOCK;
    return colour(i, j, k) || GROUND;
  };
  fs.writeFileSync(path.join(OUT, file), png(W, H, rgb));
  return file;
}

const plates = [];
for (const posture of ['STAND', 'TURN', 'WALK', 'SIT', 'CROUCH', 'REACH']) {
  plates.push({ file: plate(`fit-${posture.toLowerCase()}.png`,
    (i, j, k) => fm.fits[posture][k] ? YES : NO),
    title: posture, why: fm.postures[posture].why, area: fm.area[posture] });
}
// where the ants actually walked
plate('trail.png', (i, j, k) => {
  const s = col.scent[k];
  if (s > 0.05) { const t = Math.min(1, Math.log1p(s) / 3);
    return [Math.round(60 + 190 * t), Math.round(70 + 130 * t), Math.round(90 - 40 * t)]; }
  return fm.fits.STAND[k] ? [30, 46, 40] : null;
});
plates.push({ file: 'trail.png', title: 'WHERE THEY WALKED', why: `${col.covered} sq ft covered by 40 ants`, area: col.covered });
// the one that matters: stand but cannot turn
plate('cannot-turn.png', (i, j, k) =>
  fm.fits.STAND[k] && !fm.fits.TURN[k] ? NO : fm.fits.TURN[k] ? YES : null);
plates.push({ file: 'cannot-turn.png', title: 'STAND BUT CANNOT TURN',
  why: `${col.cannotTurn} sq ft of the ${col.standable} you can stand in`, area: col.cannotTurn });

const er = IH.errands(world);
fs.writeFileSync(path.join(OUT, 'inhabit.json'), JSON.stringify({
  plates, area: fm.area, postures: fm.postures,
  standable: col.standable, turnable: col.turnable, cannotTurn: col.cannotTurn,
  covered: col.covered, reached: col.reached, margin: col.margin,
  findings: col.findings.slice(0, 40), errands: er.errands, done: er.done, of: er.of,
  size: { w: W, h: H }
}, null, 2));
console.log(`${plates.length} plates, ${W}x${H}`);
for (const p of plates) console.log('  ' + p.title.padEnd(24), String(p.area).padStart(6), 'sq ft —', p.why);
console.log(`\nerrands ${er.done}/${er.of} · standable ${col.standable} · turnable ${col.turnable} · cannot turn ${col.cannotTurn}`);
