// tools/shoot.mjs — photograph the building from every named view.
//
// "are we not taking enough photos or can you not see this?"
//
// We were not taking enough photos. Every screenshot in this repository until
// now was the same three-quarter view of the same corner. Six ceiling lights
// hung in mid-air across a dozen of them because no picture ever looked up.
//
//   node tools/shoot.mjs [outdir]
//
// Writes one PNG per view plus a contact sheet manifest. Every file records
// where it came from: origin=render, which view, which build. A reference image
// is origin=reference and lives in a different directory, so nothing downstream
// has to guess which picture is the drawing and which is the thing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'assets/views'));
const PORT = 8477;

fs.mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch {} };
process.on('exit', stop);
await new Promise(r => setTimeout(r, 900));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/tools/shoot.html?t=${Date.now()}`, { waitUntil: 'load' });
await page.waitForFunction('window.ready === true', { timeout: 90000 });

const stats = await page.evaluate(() => window.shoot.stats);
const views = await page.evaluate(() => window.shoot.VIEWS);
const shots = [];
for (const v of views) {
  const placed = await page.evaluate(id => window.shoot.look(id), v.id);
  await page.waitForTimeout(140);
  const file = `${v.id.replace(/\./g, '-')}.png`;
  await page.screenshot({ path: path.join(OUT, file) });
  shots.push({ ...v, file, origin: 'render', eye: placed.eye.map(n => +n.toFixed(1)),
               target: placed.target.map(n => +n.toFixed(1)) });
  console.log(`  ${v.label.padEnd(18)} ${file}`);
}
const manifest = {
  built: { members: stats.members, joints: stats.joints, state: stats.state, open: stats.open },
  origin: 'render', of: 'ingold-trailer', views: shots, errors
};
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
console.log(`${shots.length} views -> ${path.relative(ROOT, OUT)}  ` +
            `(${stats.members} members, ${stats.joints} joints, ${stats.state}, ${stats.open.length} open)` +
            (errors.length ? `\npage errors: ${errors.join(' | ')}` : ''));
await browser.close();
stop();
