// tools/taxonomy.mjs — what kinds of thing actually go wrong, counted.
//
// "do we know how to make this easier to review and study what types of errors
// were most common?"
//
// Three different populations of error, kept separate because they are found in
// three different ways and confusing them is how you end up believing the model
// is fine:
//
//   1. CONDITIONS  — what the deterministic checks caught during the build.
//                    Cheap, exact, and blind to anything nobody thought to check.
//   2. SESSION     — what went wrong while writing the builder, from the record
//                    of the session that wrote it. Command failures, retries.
//   3. SEEN        — what a human said after looking at a picture, lifted from
//                    the Operative Correspondent chat archive. This is the only
//                    population that contains the errors the checks cannot see,
//                    and it is the argument for the critic loop.
//
//   node tools/taxonomy.mjs [path/to/archive]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from '../operative/ingold.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tally = (xs, key) => {
  const m = new Map();
  for (const x of xs) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
};

// ---- 1. conditions, from the build that actually ran ------------------------
const { world, loop } = build({ budget: 90 });
const opened = [], closed = [];
for (const h of world.history) {
  for (const c of h.opened || []) opened.push(c);
  for (const c of h.closed || []) closed.push(c);
}
const byCode = new Map();
for (const c of opened) {
  const e = byCode.get(c.code) || { code: c.code, opened: 0, closed: 0, severity: c.severity, example: c.message };
  e.opened++; byCode.set(c.code, e);
}
for (const c of closed) {
  const e = byCode.get(c.code) || { code: c.code, opened: 0, closed: 0, severity: c.severity, example: c.message };
  e.closed++; byCode.set(c.code, e);
}
const conditions = [...byCode.values()].sort((a, b) => b.opened - a.opened);

// ---- 2. the session that wrote the builder ----------------------------------
let session = null;
const recPath = path.join(ROOT, 'data/session-record.json');
if (fs.existsSync(recPath)) {
  const rec = JSON.parse(fs.readFileSync(recPath, 'utf8'));
  const bad = rec.loops.filter(l => l.ok === false);
  // classify a failed loop by what its output actually said
  const CLASS = [
    [/is not a function|not defined|Cannot read propert|undefined/i, 'wrong assumption about an API'],
    [/assert|AssertionError|FAIL/i,                                   'a check refused the change'],
    [/ENOENT|No such file|not found|404/i,                            'reached for something that was not there'],
    [/SyntaxError|Unexpected token/i,                                 'malformed edit'],
    [/timeout|timed out|took too long/i,                              'ran too long'],
    [/overlap|OVERLAP|UNSUPPORTED|FLOATING/i,                         'the world reported a physical conflict'],
    [/permission|denied|EACCES/i,                                     'not allowed'],
  ];
  session = {
    loops: rec.counts.loops, failed: bad.length,
    kinds: tally(bad, (l) => {
      const t = `${l.saw || ''} ${l.did || ''}`;
      const hit = CLASS.find(([re]) => re.test(t));
      return hit ? hit[1] : 'other';
    }),
    byPhase: tally(bad, (l) => l.kind)
  };
}

// ---- 3. what a person said after looking ------------------------------------
let seen = null;
const arch = process.argv[2];
if (arch && fs.existsSync(path.join(arch, 'manifest/compare_pairs.csv'))) {
  const rows = fs.readFileSync(path.join(arch, 'manifest/compare_pairs.csv'), 'utf8')
    .split(/\r?\n/).slice(1).filter(l => l.trim())
    .map(l => { const m = /^([^,]*),([^,]*),([^,]*),(.*)$/.exec(l);
                return m ? { project: m[1], said: m[4].replace(/^"|"$/g, '') } : null; })
    .filter(Boolean);
  // The categories are read off what people actually complain about, not invented.
  const LENS = [
    [/roof|dome|eave|crown|terrace/i,            'the roof is wrong'],
    [/proportion|scale|giant|too many|hierarchy/i,'proportion and count'],
    [/silhouette|form|shape|reads like|box/i,     'the silhouette does not read'],
    [/connect|entry|stair|door|attach|join/i,     'things do not connect'],
    [/window|facade|blank|legible|visible/i,      'openings and surface are illegible'],
    [/angle|another angle|camera|from this/i,     'only works from one angle'],
    [/envelope|outside|overshoot|project/i,       'a part escapes the envelope']
  ];
  seen = {
    comparisons: rows.length,
    kinds: tally(rows, (r) => { const hit = LENS.find(([re]) => re.test(r.said)); return hit ? hit[1] : 'other'; }),
    examples: rows.slice(0, 8).map(r => `${r.project}: ${r.said}`)
  };
}

const out = {
  built: { members: world.elements.size, joints: world.joints.size, state: loop.state,
           decisions: loop.steps, stillOpen: world.conditions.length },
  conditions, session, seen,
  note: 'CONDITIONS are what the checks caught. SEEN is what a person caught by looking. ' +
        'The second list is not a subset of the first, which is the whole argument for a critic.'
};
fs.writeFileSync(path.join(ROOT, 'data/error-taxonomy.json'), JSON.stringify(out, null, 1) + '\n');

const pad = (s, n) => String(s).padEnd(n);
console.log(`\nCONDITIONS the checks caught while building (${opened.length} opened, ${closed.length} closed)`);
for (const c of conditions.slice(0, 14))
  console.log(`  ${pad(c.code, 22)} opened ${pad(c.opened, 4)} closed ${pad(c.closed, 4)}  ${c.example.slice(0, 52)}`);
if (session) {
  console.log(`\nSESSION failures while writing the builder (${session.failed} of ${session.loops} loops)`);
  for (const k of session.kinds) console.log(`  ${pad(k.n, 4)} ${k.name}`);
}
if (seen) {
  console.log(`\nSEEN by a person looking at a picture (${seen.comparisons} comparisons)`);
  for (const k of seen.kinds) console.log(`  ${pad(k.n, 4)} ${k.name}`);
}
console.log(`\ndata/error-taxonomy.json written`);
