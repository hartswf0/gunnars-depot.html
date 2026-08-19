// tools/spec-report.mjs — regenerate data/spec-report.json from the real build.
//
// The report is not written by hand and not narrated. It runs the builder, then
// measures the result against the spec sheet, and whatever it finds is what the
// page shows. Run with:  node tools/spec-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../operative/ingold.js';
import { compareToSheet } from '../operative/spec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const t0 = Date.now();
const { world, loop } = build();
const cmp = compareToSheet(world);

const report = {
  ...cmp,
  members: world.elements.size,
  joints: world.joints.size,
  open: world.conditions.length,
  loop: {
    state: loop.state,
    steps: loop.steps,
    seconds: +((Date.now() - t0) / 1000).toFixed(1),
    walkedBack: loop.trace.filter(t => t.kept === false).length,
    // what it answered, in order, so the page can show the decisions rather than
    // a summary of them
    moves: loop.trace.filter(t => t.move).map(t => ({
      step: t.step, answering: t.answering, brief: !!t.brief, move: t.move,
      note: t.note, kept: t.kept !== false,
      before: t.before && t.before.total, after: t.after && t.after.total
    })),
    open: loop.open.map(c => ({ code: c.code, message: c.message }))
  }
};
const out = path.join(ROOT, 'data/spec-report.json');
fs.writeFileSync(out, JSON.stringify(report, null, 1) + '\n');
console.log(`${path.relative(ROOT, out)}: ${report.members} members, ${report.joints} joints, ` +
            `${report.loop.steps} decisions, ${report.open} open`);
