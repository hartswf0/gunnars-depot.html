// tools/punchlist.mjs — what the ants found, on the building, as a picture.
//
// The colony's output has been a table. A table is not a receipt a builder can
// act on. This puts every pin where the ant put it, in three views, with the
// punch list beside it.
//
//   node tools/punchlist.mjs [outdir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'assets/punchlist'));
const PORT = 8491;
fs.mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch {} });
await new Promise(r => setTimeout(r, 900));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
page.setDefaultTimeout(300000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${PORT}/tools/punchlist.html?t=${Date.now()}`, { waitUntil: 'load' });
await page.waitForFunction('window.ready === true');

const VIEWS = ['threeq', 'threeq.rear', 'service', 'plan', 'left', 'inside.entry'];
const shots = [];
for (const v of VIEWS) {
  await page.evaluate((id) => window.look(id), v);
  await new Promise(r => setTimeout(r, 250));
  const f = path.join(OUT, `${v}.png`);
  await page.screenshot({ path: f });
  shots.push(f);
}
const report = await page.evaluate(() => window.report);
fs.writeFileSync(path.join(OUT, 'punchlist.json'), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT, 'punchlist.txt'), report.text + '\n');
console.log(report.text);
console.log('\nCONDITIONS');
for (const c of report.conditions) console.log(`  sev${c.severity} ${c.code} — ${c.message}`);
console.log(`\n${report.members} members, ${report.joints} joints`);
console.log('PINS');
for (const p of report.places) console.log(`  ${String(p.score).padStart(3)} ${p.verdict.padEnd(11)} ${p.kind.padEnd(9)} ${p.ants} ants  ${p.place}  ${p.at.join(', ')}`);
console.log('\nwrote', shots.join(' '), '\nerrors:', errs.slice(0, 6).join(' | ') || 'none');
await browser.close();
