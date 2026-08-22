/**
 * Does every turn in the human trace actually put a building on the stage?
 *
 * The thirty HDL pages are standalone Three.js documents; the trace reads their two
 * pass groups off `window.__HDL_PROOF` and redraws them here. When a page never sets
 * that global the turn goes blank, which is indistinguishable on screen from a turn
 * that genuinely built nothing — so it has to be checked rather than eyeballed.
 *
 * Walks every turn that names a model, at desktop and at phone width, and reports the
 * part counts, whether the whole thing is inside the frame, and the reason any build
 * stopped early.
 *
 *   npm i --no-save playwright-core && node tools/verify-artifacts.mjs
 */
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { if (!res.headersSent) res.writeHead(404); res.end('no'); }
});
await new Promise(r => server.listen(8096, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--no-sandbox']
});

let bad = 0;
for (const [width, height, label] of [[1280, 820, 'desktop'], [390, 780, 'phone']]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto('http://127.0.0.1:8096/operative-builder-trace.html?trace=human-origin', { waitUntil: 'load' });
  await page.waitForFunction(() => window.trace?.msgs?.length > 0, { timeout: 20000 });
  const turns = await page.evaluate(() => window.trace.msgs.map((m, i) => [i, m.model]).filter(t => t[1]));
  console.log(`\n=== ${label} — ${turns.length} turns with a model`);
  for (const [i, model] of turns) {
    const got = await page.evaluate(async ([i, model]) => {
      window.trace.goto(i);
      for (let k = 0; k < 90; k++) {
        await new Promise(r => setTimeout(r, 150));
        const s = window.trace.stage?.();
        // Keyed on the file: artPasses still holds the previous turn until this
        // one is baked, and reading it early reports the turn before.
        if (s && s.file === model && s.total) {
          await new Promise(r => setTimeout(r, 2600));  // let the pass change settle
          return window.trace.stage();
        }
      }
      return null;
    }, [i, model]);
    const ok = got && got.total > 0 && got.onscreen;
    if (!ok) bad++;
    console.log(' ', ok ? ' ' : '!', String(i).padStart(3), model.padEnd(46),
      got ? `mass ${got.mass} · built ${got.built}${got.onscreen ? '' : ' · OFF SCREEN'}${got.note ? ' · stopped: ' + got.note : ''}`
          : '*** NOTHING ON THE STAGE ***');
  }
  await page.close();
}
await browser.close(); server.close();
console.log(bad ? `\n${bad} turn(s) failed` : '\nevery turn built');
process.exit(bad ? 1 : 0);
