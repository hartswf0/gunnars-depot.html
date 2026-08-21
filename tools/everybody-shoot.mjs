// tools/everybody-shoot.mjs — EVERYBODY, doing each thing, photographed.
//   node tools/everybody-shoot.mjs [outdir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'assets/everybody'));
const PORT = 8497;
fs.mkdirSync(OUT, { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: ROOT, stdio: 'ignore' });
process.on('exit', () => { try { server.kill(); } catch {} });
await new Promise(r => setTimeout(r, 900));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
page.setDefaultTimeout(300000);
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/tools/everybody-shoot.html?t=${Date.now()}`, { waitUntil: 'load' });
await page.waitForFunction('window.ready === true');
const names = await page.evaluate(() => window.NAMES);
const report = [];
for (const n of names) {
  const r = await page.evaluate((nn) => window.show(nn), n);
  await new Promise(r2 => setTimeout(r2, 220));
  const file = n.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
  await page.screenshot({ path: path.join(OUT, file) });
  report.push({ ...r, file });
  console.log((r ? r.activity : n).padEnd(26),
    r ? `head ${String(r.headTop).padStart(3)}  ${r.work ? (r.work.ok ? 'work ok    ' : `work ${r.work.off > 0 ? '+' : ''}${r.work.off}in`) : '           '}  ${r.clash ? r.clash + ' clashes' : 'clear'}` : 'FAILED');
}
fs.writeFileSync(path.join(OUT, 'everybody.json'), JSON.stringify(report, null, 2));
console.log('\nwrote', report.length, 'plates to', OUT, '\nerrors:', errs.slice(0, 4).join(' | ') || 'none');
await browser.close();
