/**
 * The half selftest.mjs cannot reach: the three.js stage, in a real browser.
 *
 * selftest.mjs proves the policy against a stage made of paper. This proves the stage
 * — that a world of parts becomes geometry, that a named view produces a picture with
 * something in it, and that the page wires the two together — by running the loop
 * against a scripted model at desktop and phone width.
 *
 *   npm i --no-save playwright-core && node operative/kit/browsercheck.mjs
 */
import { chromium } from 'playwright-core';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  try {
    const body = await readFile(join(ROOT, path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { if (!res.headersSent) res.writeHead(404); res.end('no'); }
});
await new Promise(r => server.listen(8093, r));

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/opt/pw-browsers/chromium',
  args: ['--use-gl=swiftshader', '--no-sandbox']
});

let bad = 0;
for (const [width, height, label] of [[1280, 820, 'desktop'], [390, 780, 'phone']]) {
  const page = await browser.newPage({ viewport: { width, height } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8093/loop-kit.html', { waitUntil: 'load' });
  await page.waitForFunction(() => typeof window.loop === 'function', { timeout: 15000 });

  const got = await page.evaluate(async () => {
    const { createLoop } = await import('./operative/kit/loop.js');
    const { threeStage } = await import('./operative/kit/adapters.js');
    const THREE = await import('three');
    const stage = threeStage(THREE, { width: 600, height: 420 });
    let look = 0, built = 0;
    const ask = async ({ system }) => {
      if (system.startsWith('You are BUILDER')) {
        built++;
        return { summary: 'pass ' + built, operations: [
          { op: 'ADD', id: 'm' + built, primitive: 'box', role: 'wall', position: [0, 2, 0], size: [8, 4, 6], color: '#c8b79a' },
          { op: 'ADD', id: 'd' + built, primitive: 'box', role: 'door', position: [0, 1, 3.1], size: [1.2, 2, .2], color: '#6b4a2f' },
          { op: 'ADD', id: 'p' + built, primitive: 'box', role: 'path', position: [0, .05, 5], size: [1.4, .1, 4], color: '#8e8478' }] };
      }
      return { suck_score: [70, 0, 0, 0, 0, 0, 0][Math.min(look++, 6)], what_sucks: 'the tower reads short' };
    };
    const loop = createLoop({ intent: 'a chapel', ask, stage, onEvent: () => {} });
    const r = await loop.run({ cycles: 4 });
    return { parts: loop.world.length, settled: r.settled,
      builds: loop.trace.filter(e => e.kind === 'build').length,
      looks: loop.trace.filter(e => e.kind === 'critique').length,
      views: [...new Set(loop.trace.filter(e => e.kind === 'critique').map(e => e.view))].length,
      // A blank canvas still encodes to a short PNG; a built one does not.
      painted: stage.shoot('FRONT').length > 5000,
      diffPainted: stage.shootDiff('FRONT', { added: ['m1'], changed: [], removed: [] }).length > 5000 };
  });

  const checks = [
    [got.parts === 6, 'every operation became a part'],
    [got.builds === 2 && got.looks > got.builds, 'it looked more often than it built'],
    [got.views === 6, 'all six core views were used'],
    [got.settled, 'it settled once every view was quiet'],
    [got.painted, 'the stage rendered geometry'],
    [got.diffPainted, 'the diff shot rendered'],
    [errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : '')]
  ];
  console.log(`\n──── ${label} ${width}×${height}`);
  for (const [pass, what] of checks) { console.log((pass ? '  ok   ' : '  FAIL ') + what); if (!pass) bad++; }
  await page.close();
}
await browser.close(); server.close();
console.log(bad ? `\n${bad} failed` : '\nthe stage works');
process.exit(bad ? 1 : 0);
