// tools/flyseye.mjs — one sheet, many eyes.
//
// "think like this is inside a fly's eye and then we give the ai a sheet of many
// images of it of each element"
//
// The twelve named views tell you about the building. They tell you almost
// nothing about the *parts*, because a part is four pixels in a photograph of a
// trailer. This takes a close-up of every element — subject solid, neighbours
// translucent, so you can see whether it is attached to anything — and lays them
// out on one contact sheet.
//
// The point is not prettiness. It is that a model looking at one sheet of ninety
// tiles can compare them to each other, and a model looking at ninety separate
// images cannot. Difference is easier to see than absence.
//
//   node tools/flyseye.mjs [outdir] [--layer frame] [--kind stud] [--max 120]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };
const OUT = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : path.join(ROOT, 'assets/flyseye'));
const LAYER = flag('layer', null), KIND = flag('kind', null);
const MAX = Number(flag('max', 96));
const TILE = 200, COLS = 8;
const PORT = 8478;

fs.mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch {} });
await new Promise(r => setTimeout(r, 900));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: TILE, height: TILE }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/tools/shoot.html?t=${Date.now()}`, { waitUntil: 'load' });
await page.waitForFunction('window.ready === true', { timeout: 90000 });

// Which elements, and in what order. Sorted by layer then id so the sheet reads
// like a build sequence rather than a hash.
const list = await page.evaluate(({ layer, kind }) => {
  const w = window.shoot.world;
  return w.solids()
    .filter(e => (!layer || e.layer === layer) && (!kind || e.kind === kind))
    .map(e => ({ id: e.id, kind: e.kind, layer: e.layer,
                 vol: (e.hi[0] - e.lo[0]) * (e.hi[1] - e.lo[1]) * (e.hi[2] - e.lo[2]) }))
    .sort((a, b) => a.layer.localeCompare(b.layer) || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
}, { layer: LAYER, kind: KIND });

// When there are more parts than tiles, take a spread rather than the first N:
// the first N of a sorted list is one layer and tells you nothing about the rest.
const step = Math.max(1, Math.ceil(list.length / MAX));
const chosen = list.filter((_, i) => i % step === 0).slice(0, MAX);
console.log(`${list.length} parts, ${chosen.length} tiles (every ${step})`);

const tiles = [];
for (const e of chosen) {
  const meta = await page.evaluate(id => window.closeUp(id), e.id);
  await page.waitForTimeout(35);
  const buf = await page.screenshot({ type: 'png' });
  const file = `${e.id.replace(/[^a-z0-9.]/gi, '_')}.png`;
  fs.writeFileSync(path.join(OUT, file), buf);
  tiles.push({ ...e, ...meta, file, origin: 'render', framing: 'close-up' });
}
await browser.close();
server.kill();

// The sheet itself is an HTML page rather than a stitched bitmap: it stays
// legible at any size, the ids stay selectable text, and a model reading it gets
// the label with the picture instead of having to infer which tile is which.
const rows = tiles.map(t =>
  `<figure><img src="${t.file}" alt="${t.id}" loading="lazy" width="${TILE}" height="${TILE}">` +
  `<figcaption><b>${t.id}</b><span>${t.kind} · ${t.layer}</span></figcaption></figure>`).join('\n');
fs.writeFileSync(path.join(OUT, 'sheet.html'), `<!doctype html>
<meta charset="utf-8"><title>Fly's eye — ${tiles.length} parts</title>
<style>
 body{margin:0;padding:12px;background:#0b0e12;color:#e8edf3;
   font:11px/1.3 ui-monospace,SFMono-Regular,Menlo,monospace}
 h1{font-size:12px;font-weight:600;letter-spacing:.1em;margin:0 0 10px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(${TILE}px,1fr));gap:8px}
 figure{margin:0;background:#11161c;border:1px solid #1e262f}
 img{display:block;width:100%;height:auto}
 figcaption{padding:4px 5px;display:flex;flex-direction:column;gap:1px}
 figcaption b{font-weight:600} figcaption span{color:#7c8894;font-size:9px}
</style>
<h1>FLY'S EYE — ${tiles.length} OF ${list.length} PARTS${LAYER ? ` · ${LAYER}` : ''}${KIND ? ` · ${KIND}` : ''}</h1>
<div class="grid">
${rows}
</div>`);
fs.writeFileSync(path.join(OUT, 'manifest.json'),
  JSON.stringify({ of: 'ingold-trailer', origin: 'render', framing: 'close-up',
                   parts: list.length, tiles: tiles.length, cols: COLS, tile: TILE, tiles }, null, 1) + '\n');
console.log(`${tiles.length} tiles -> ${path.relative(ROOT, OUT)}/sheet.html` +
            (errors.length ? `\npage errors: ${errors.join(' | ')}` : ''));
