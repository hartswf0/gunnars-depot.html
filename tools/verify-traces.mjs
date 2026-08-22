/**
 * Does every trace put its building on the stage, wholly inside the frame?
 *
 * Two faults hide from a person clicking through this page and neither announces
 * itself. A turn can go blank because the artifact it names never handed over its
 * geometry — indistinguishable on screen from a turn that genuinely built nothing.
 * And a model can be framed against a width it does not have, so its ends hang off
 * the edge; on a desktop there is spare width to absorb that, and on a phone there
 * is not. Both need measuring rather than eyeballing, at both widths.
 *
 * Walks every trace in assets/traces/index.json. The human trace is checked turn by
 * turn, since each turn is a different page; the others are sampled across the run
 * and always at the end, where the world is largest.
 *
 *   npm i --no-save playwright-core && node tools/verify-traces.mjs
 */
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8096);
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json', '.css': 'text/css', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { if (!res.headersSent) res.writeHead(404); res.end('no'); }
});
await new Promise(r => server.listen(PORT, r));

const index = JSON.parse(await readFile(join(ROOT, 'assets/traces/index.json'), 'utf8'));
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--no-sandbox']
});

/** Drive the page to a turn and wait until the stage settles on it. */
const readStage = (page, i, file) => page.evaluate(async ([i, file]) => {
  window.trace.goto(i);
  for (let k = 0; k < 90; k++) {
    await new Promise(r => setTimeout(r, 150));
    const s = window.trace.stage?.();
    // Keyed on the file where there is one: artPasses still holds the previous turn
    // until this one is baked, and reading it early reports the turn before.
    if (s && s.total && (!file || s.file === file)) {
      await new Promise(r => setTimeout(r, 2600));   // let the pass change settle
      return window.trace.stage();
    }
  }
  return null;
}, [i, file]);

let bad = 0;
for (const [width, height, label] of [[1280, 820, 'desktop'], [390, 780, 'phone']]) {
  console.log(`\n──────── ${label}  ${width}×${height}`);
  for (const t of index.traces) {
    const page = await browser.newPage({ viewport: { width, height } });
    const slug = t.file.replace(/\.json$/, '');
    await page.goto(`http://127.0.0.1:${PORT}/operative-builder-trace.html?trace=${slug}`, { waitUntil: 'load' });
    await page.waitForFunction(() => window.trace?.msgs?.length > 0, { timeout: 25000 });

    // The page used to ignore ?trace= and always open the first one, so this harness
    // cheerfully checked the same trace eight times and reported eight passes. Assert
    // the run on screen is the run that was asked for.
    const got = await page.evaluate(() => ({ intent: window.trace.doc?.intent, builder: window.trace.doc?.builder }));
    if (got.intent !== t.intent || got.builder !== t.builder) {
      console.log(` ! ${slug.padEnd(24)} loaded "${got.intent}" (${got.builder}), expected "${t.intent}" (${t.builder})`);
      bad++; await page.close(); continue;
    }

    const turns = await page.evaluate(() => {
      const m = window.trace.msgs;
      const withModel = m.map((x, i) => [i, x.model]).filter(x => x[1]);
      if (withModel.length) return withModel;            // human trace: every page
      // Otherwise sample across the run, and always the end, where the world is largest.
      const at = new Set([m.length - 1]);
      for (let k = 0; k < m.length; k += Math.max(1, Math.ceil(m.length / 8))) at.add(k);
      return [...at].sort((a, b) => a - b).map(i => [i, null]);
    });

    let fails = 0;
    const lines = [];
    for (const [i, model] of turns) {
      const got = await readStage(page, i, model);
      const ok = got && got.total > 0 && got.onscreen;
      if (!ok) { fails++; bad++; }
      if (!ok || model) lines.push(`   ${ok ? ' ' : '!'} ${String(i).padStart(3)} ${(model || 'turn').padEnd(46)} ` +
        (got ? `${got.shown} of ${got.total} parts${got.onscreen ? '' : ' · OFF SCREEN'}${got.note ? ' · stopped: ' + got.note : ''}`
             : '*** NOTHING ON THE STAGE ***'));
    }
    console.log(` ${fails ? '!' : '·'} ${slug.padEnd(24)} ${turns.length} checked, ${fails} failed`);
    lines.forEach(l => console.log(l));
    await page.close();
  }
}
await browser.close(); server.close();
console.log(bad ? `\n${bad} check(s) failed` : '\nevery trace fits');
process.exit(bad ? 1 : 0);
