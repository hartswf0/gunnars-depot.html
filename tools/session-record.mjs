// tools/session-record.mjs — the making of the making.
//
// The building keeps a journal of its 51 moves. The session that produced the
// building kept one too — Claude Code writes every tool call and result to
// ~/.claude/projects/<project>/<session>.jsonl — but it lives outside the repo and
// disappears with the container. This lifts it into the repository as data.
//
// Nothing here is reconstructed or narrated after the fact. Every field is copied
// from what was actually run and what actually came back. The classification is
// derived from the command text, not from memory.
//
//   node tools/session-record.mjs <transcript.jsonl> [out.json]
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
const out = process.argv[3] || 'data/session-record.json';
const shotDir = process.argv[4] || 'assets/making';   // where the screenshots were kept
if (!src || !fs.existsSync(src)) {
  console.error('usage: node tools/session-record.mjs <transcript.jsonl> [out.json]');
  process.exit(1);
}

const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');
const CTRL = new RegExp('[\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f]', 'g');
const clip = (s, n) => {
  if (typeof s !== 'string') return '';
  const t = s.replace(ANSI, '').replace(CTRL, '');
  return t.length > n ? t.slice(0, n) + '\n... [' + (t.length - n) + ' more chars]' : t;
};

/** What a call was for, read off the command itself. */
function classify(name, input) {
  if (name === 'Read') return /\.(png|jpe?g)$/i.test(input.file_path || '') ? 'observe' : 'orient';
  if (name !== 'Bash') return 'other';
  const c = input.command || '';
  if (/git (commit|push)/.test(c)) return 'record';
  if (/node tests\/run\.mjs|playwright|chromium|scenario|shot\.mjs|drag\.mjs|commit\.mjs|ingold\.mjs|ghost\.mjs|diag/.test(c)) return 'verify';
  if (/cat > |python3 - <<|sed -i|mkdir |cp |rm /.test(c)) return 'act';
  if (/node --input-type=module|node \/tmp|node .*\.mjs/.test(c)) return 'probe';
  if (/^\s*(git|ls|grep|find|head|sed -n|wc|du|which|curl|cat )/.test(c)) return 'orient';
  return 'probe';
}

const raw = fs.readFileSync(src, 'utf8').split('\n');
const loops = [];
const chapters = [];
let pendingSay = '';
const byId = new Map();
let i = 0;

for (const line of raw) {
  if (!line.trim()) continue;
  let r; try { r = JSON.parse(line); } catch { continue; }
  const msg = r.message || {};
  const content = msg.content;
  const ts = r.timestamp || null;

  // an instruction from the human starts a chapter
  if (r.type === 'user' && typeof content === 'string' && content.trim()) {
    chapters.push({ at: loops.length, t: ts, text: clip(content.trim(), 700) });
    continue;
  }
  if (!Array.isArray(content)) continue;

  for (const c of content) {
    if (!c || typeof c !== 'object') continue;
    if (r.type === 'assistant' && c.type === 'text' && c.text && c.text.trim()) {
      pendingSay = c.text.trim();
      continue;
    }
    if (c.type === 'tool_use') {
      const rec = {
        i: ++i, t: ts, kind: classify(c.name, c.input || {}), tool: c.name,
        say: clip(pendingSay, 900) || null,
        did: (c.input && (c.input.description || c.input.file_path)) || c.name,
        cmd: clip((c.input && c.input.command) || (c.input && c.input.file_path) || '', 900),
        saw: null, ok: null, shot: null
      };
      // a loop that looked at a screenshot points at the screenshot, if we kept it
      if (rec.kind === 'observe' && c.input && c.input.file_path) {
        const base = path.basename(c.input.file_path);
        if (fs.existsSync(path.join(shotDir, base))) rec.shot = path.join(shotDir, base).replace(/\\/g, '/');
      }
      pendingSay = '';
      loops.push(rec);
      byId.set(c.id, rec);
      continue;
    }
    if (c.type === 'tool_result') {
      const rec = byId.get(c.tool_use_id);
      if (!rec) continue;
      let text = '';
      if (typeof c.content === 'string') text = c.content;
      else if (Array.isArray(c.content)) text = c.content.map(x => (x && x.type === 'text') ? x.text : '[' + (x && x.type) + ']').join('\n');
      rec.saw = clip(text, 1400);
      rec.ok = !c.is_error;
    }
  }
}

const withShots = loops.filter(l => l.shot).length;
const tally = {};
for (const l of loops) tally[l.kind] = (tally[l.kind] || 0) + 1;

const record = {
  session: path.basename(src, '.jsonl'),
  span: { from: loops[0] && loops[0].t, to: loops[loops.length - 1] && loops[loops.length - 1].t },
  counts: { loops: loops.length, ...tally },
  chapters, loops
};
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(record));
const kb = (fs.statSync(out).size / 1024).toFixed(0);
console.log(loops.length + ' loops, ' + chapters.length + ' instructions -> ' + out + ' (' + kb + ' KB)');
console.log('by kind:', JSON.stringify(tally), '| screenshots linked:', withShots);
console.log('span:', record.span.from, '->', record.span.to);
