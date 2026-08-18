// operative/app.js — the interface.
//
// World first. The building fills the screen; everything else is a thin strip or
// a sheet that comes when asked and goes when it is done. There are two governing
// gestures: touch anything to see how it became that way, change anything and
// watch who has to answer.
import { seedTrailer, KIT } from './kit.js';
import { commit, commitChain, undo, OPS } from './ops.js';
import { checkAll } from './checks.js';
import { parse, nextMove, VOCABULARY } from './language.js';
import { learn, preflight } from './invariants.js';
import { parseSTL, bindReference, compareToReference } from './reference.js';
import { View } from './view.js';

const CONCEPTS = [
  { key: 'contractor', id: 'contractor-reality', name: 'Contractor Reality Trailer', file: 'assets/models/concepts/contractor-reality-trailer.stl' },
  { key: 'wright', id: 'wright-usonian', name: 'Wright / Usonian Trailer', file: 'assets/models/concepts/wright-usonian-trailer.stl' },
  { key: 'ban', id: 'shigeru-ban', name: 'Shigeru Ban Shelter Trailer', file: 'assets/models/concepts/shigeru-ban-shelter-trailer.stl' },
  { key: 'lacaton', id: 'lacaton-vassal', name: 'Lacaton & Vassal Economy Trailer', file: 'assets/models/concepts/lacaton-vassal-economy-trailer.stl' },
  { key: 'alexander', id: 'alexander-pattern', name: 'Alexander Pattern Cabin Trailer', file: 'assets/models/concepts/alexander-pattern-cabin-trailer.stl' }
];
const LAYERS = ['foundation', 'frame', 'walls', 'roof', 'interior', 'services'];

const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

export class App {
  constructor() {
    this.world = seedTrailer();
    this.world.conditions = checkAll(this.world);
    this.view = new View($('#viewport'));
    this.view.sync(this.world);
    this.view.frame(this.world);
    this.view.start();
    this.sheet = $('#sheet');
    this.wire();
    this.render();
    this.say('Seed kit placed: 81 members, nothing outstanding. Tell it what to build, or tap a member to ask how it got there.');
  }

  // ---------------------------------------------------------------- plumbing
  wire() {
    const canvas = $('#viewport');
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 500;
      down = null;
      if (moved < 8 && quick) this.select(this.view.pick(e.clientX, e.clientY));
    });

    $('#say').addEventListener('keydown', (e) => { if (e.key === 'Enter') this.speak($('#say').value); });
    $('#send').addEventListener('click', () => this.speak($('#say').value));
    $('#status').addEventListener('click', () => this.showConditions());
    $('#historyBtn').addEventListener('click', () => this.showHistory());
    $('#refBtn').addEventListener('click', (e) => {
      this.refOn = !this.refOn;
      e.currentTarget.classList.toggle('on', this.refOn);
      this.view.showReference(this.world.reference && this.world.reference.tris, this.refOn);
    });
    $('#xrayBtn').addEventListener('click', (e) => {
      this.view.xray = !this.view.xray;
      e.currentTarget.classList.toggle('on', this.view.xray);
      this.view.sync(this.world);
    });
    $('#helpBtn').addEventListener('click', () => this.showHelp());
    $('#closeSheet').addEventListener('click', () => this.closeSheet());
    $('#undoBtn').addEventListener('click', () => { const r = undo(this.world); this.say(r.note); this.after([]); });

    const layers = $('#layers');
    for (const l of LAYERS) {
      const b = el('button', 'chip on', l);
      b.addEventListener('click', () => {
        if (this.view.hidden.has(l)) { this.view.hidden.delete(l); b.classList.add('on'); }
        else { this.view.hidden.add(l); b.classList.remove('on'); }
        this.view.sync(this.world);
      });
      layers.appendChild(b);
    }
  }

  say(text, kind = '') {
    const log = $('#log');
    const line = el('div', 'line ' + kind);
    line.textContent = text;
    log.appendChild(line);
    while (log.children.length > 4) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }

  // ---------------------------------------------------------------- the loop
  async speak(text) {
    if (!text || !text.trim()) return;
    $('#say').value = '';
    this.say('▸ ' + text, 'said');
    const p = parse(this.world, text);
    if (p.error) { this.say(p.error, 'bad'); if (p.vocabulary) this.showHelp(); return; }

    if (p.op === 'undo') { const r = undo(this.world); this.say(r.note); return this.after([]); }
    if (p.op === 'explain') return this.select(p.args.id);
    if (p.op === 'reference') return this.bind(p.args.which);
    if (p.op === 'fix') {
      const n = nextMove(this.world);
      if (!n) return this.say('nothing outstanding to answer.');
      return this.runRepair(n);
    }
    this.run(p.op, p.args);
  }

  run(op, args, cause) {
    for (const w of preflight(this.world, op, args)) this.say(`invariant · ${w.warning}`, 'warn');
    const r = commit(this.world, op, args, cause || null);
    if (!r.ok) { this.say(r.note, 'bad'); return r; }
    this.say(r.note, 'ok');
    for (const c of r.closed) this.say(`closed · ${c.message}`, 'good');
    for (const c of r.opened) this.say(`the world answers · ${c.message}`, 'warn');
    this.after(r.opened.flatMap(c => c.elements).concat(r.elements));
    return r;
  }

  /** A proposed repair runs as one move, so its intermediate states are not
   *  reported as conditions the builder has to answer. */
  runRepair(n) {
    this.say(`answering ${n.condition.code}`, 'said');
    const steps = n.move.chain || [n.move];
    for (const w of steps.flatMap(s => preflight(this.world, s.op, s.args))) this.say(`invariant · ${w.warning}`, 'warn');
    const r = commitChain(this.world, steps, n.condition.code);
    if (!r.ok) { this.say(r.note, 'bad'); return r; }
    for (const note of r.notes) this.say(note, 'ok');
    for (const c of r.closed) this.say(`closed · ${c.message}`, 'good');
    for (const c of r.opened) this.say(`the world answers · ${c.message}`, 'warn');
    this.after(r.opened.flatMap(c => c.elements).concat(r.elements));
    return r;
  }

  after(flashIds) {
    const promoted = learn(this.world);
    for (const inv of promoted) this.say(`invariant promoted after ${inv.seen} encounters · ${inv.rule}`, 'rule');
    this.view.sync(this.world);
    this.view.refitIfGrown(this.world);
    this.view.flash([...new Set(flashIds)].slice(0, 40));
    this.render();
  }

  // ---------------------------------------------------------------- readouts
  settlement() {
    const c = this.world.conditions || [];
    if (!c.length) return { state: 'SETTLED', tone: 'settled' };
    if (c.some(x => x.severity >= 3)) return { state: 'UNSETTLED', tone: 'unsettled' };
    return { state: 'SETTLING', tone: 'settling' };
  }

  render() {
    const s = this.settlement();
    const c = this.world.conditions || [];
    const st = $('#status');
    st.className = 'status ' + s.tone;
    st.innerHTML = '';
    st.appendChild(el('b', '', s.state));
    st.appendChild(el('span', 'dim', c.length ? `${c.length} open` : 'nothing outstanding'));
    // the strip holds two facts at phone width; the reference reading displaces the
    // piece count rather than sliding off the edge
    if (this.world.reference) {
      const cmp = compareToReference(this.world);
      st.appendChild(el('span', 'dim', `ref ${(cmp.end.agreement * 100).toFixed(0)}%`));
    } else {
      st.appendChild(el('span', 'dim', `${this.world.elements.size} pcs`));
    }

    const n = nextMove(this.world);
    const bar = $('#proposal');
    bar.innerHTML = '';
    if (n) {
      const label = n.move.note || (n.move.chain
        ? n.move.chain.map(s2 => s2.op).join(' → ')
        : `${n.move.op}${n.move.args && n.move.args.id ? ' ' + n.move.args.id : ''}`);
      const b = el('button', 'propose', `the world proposes: ${label}`);
      b.addEventListener('click', () => this.runRepair(n));
      bar.appendChild(b);
    }
    if (this.world.invariants.length) {
      const b = el('button', 'chip rulechip', `${this.world.invariants.length} invariant${this.world.invariants.length > 1 ? 's' : ''}`);
      b.addEventListener('click', () => this.showInvariants());
      bar.appendChild(b);
    }
  }

  openSheet(title) {
    $('#sheetTitle').textContent = title;
    const body = $('#sheetBody');
    body.innerHTML = '';
    this.sheet.classList.add('open');
    return body;
  }
  closeSheet() { this.sheet.classList.remove('open'); }

  /** Touch anything → see how it became that way. */
  select(id) {
    if (!id) { this.view.setSelection(null); this.view.sync(this.world); this.closeSheet(); return; }
    const e = this.world.get(id);
    if (!e) return this.say(`no member "${id}"`, 'bad');
    const g = this.world.grounded();
    const under = g.under.get(id) || [];
    const over = g.over.get(id) || [];
    const related = new Set([id, ...under.map(x => x.id), ...over.map(x => x.id)]);
    this.view.setSelection(id, related);
    this.view.sync(this.world);
    this.view.flash([id], 0x38bdf8, 2400);

    const body = this.openSheet(id);
    body.appendChild(this.kv('is', `${e.kind}${e.section ? ' · ' + e.section : ''} in ${e.layer}`));
    body.appendChild(this.kv('made of', e.material.replace('_', ' ')));
    body.appendChild(this.kv('sits at', `x ${e.lo[0].toFixed(1)}–${e.hi[0].toFixed(1)} · y ${e.lo[1].toFixed(1)}–${e.hi[1].toFixed(1)} · z ${e.lo[2].toFixed(1)}–${e.hi[2].toFixed(1)} in`));
    if (e.shear) body.appendChild(this.kv('slopes', `${e.shear.rise.toFixed(1)} in across ${e.shear.axis}`));
    // bearing and fastening are different relationships and are shown as different
    // relationships: a fastened joint is mutual, a bearing one is not.
    const bearsOn = under.filter(x => x.via === 'bear').map(x => x.id);
    const carries = over.filter(x => x.via === 'bear').map(x => x.id);
    const fastened = under.filter(x => x.via === 'fasten').map(x => x.id);
    const list = (a) => a.length > 8 ? `${a.slice(0, 8).join(', ')} +${a.length - 8} more` : a.join(', ');
    if (bearsOn.length) body.appendChild(this.kv('bears on', list(bearsOn)));
    if (carries.length) body.appendChild(this.kv('carries', list(carries)));
    if (fastened.length) body.appendChild(this.kv('fastened to', list(fastened)));
    if (!bearsOn.length && !carries.length && !fastened.length) body.appendChild(this.kv('connected to', 'nothing'));
    for (const p of e.meta.penetrations || [])
      body.appendChild(this.kv('bored', `${p.dia.toFixed(2)} in for ${p.run}, ${p.edge !== undefined ? p.edge.toFixed(2) + ' in of edge left' : 'through'}`));
    const mine = (this.world.conditions || []).filter(c => c.elements.includes(id));
    for (const c of mine) {
      const d = el('div', 'cond sev' + c.severity);
      d.appendChild(el('b', '', c.code));
      d.appendChild(el('span', '', c.message));
      if (c.repair) {
        const b = el('button', 'mini', 'answer this');
        b.addEventListener('click', () => { this.runRepair({ condition: c, move: c.repair }); this.select(id); });
        d.appendChild(b);
      }
      body.appendChild(d);
    }
    body.appendChild(el('h4', '', 'how it became this way'));
    if (!e.trace.length) body.appendChild(el('div', 'dim', 'placed with the seed kit; untouched since.'));
    for (const tr of e.trace.slice(-14)) {
      const d = el('div', 'trace');
      d.appendChild(el('i', '', 't' + tr.t));
      d.appendChild(el('span', '', `${tr.kind}${tr.cause ? ` (answering ${tr.cause})` : ''} — ${tr.note}`));
      body.appendChild(d);
    }
  }

  kv(k, v) { const d = el('div', 'kv'); d.appendChild(el('i', '', k)); d.appendChild(el('span', '', v)); return d; }

  showConditions() {
    const body = this.openSheet('what the world is saying');
    const c = this.world.conditions || [];
    if (!c.length) body.appendChild(el('div', 'dim', 'Nothing outstanding. SETTLED is not DONE — any move can reopen it.'));
    for (const x of c) {
      const d = el('div', 'cond sev' + x.severity);
      d.appendChild(el('b', '', x.code));
      d.appendChild(el('span', '', x.message));
      if (x.measure && Object.keys(x.measure).length) {
        const m = Object.entries(x.measure).filter(([k]) => k !== 'lines').map(([k, v]) => `${k} ${typeof v === 'number' ? v : JSON.stringify(v)}`).join(' · ');
        if (m) d.appendChild(el('small', '', m));
      }
      for (const line of (x.measure && x.measure.lines) || []) d.appendChild(el('small', '', '· ' + line));
      const row = el('div', 'row');
      if (x.elements.length) {
        const b = el('button', 'mini', 'show me');
        b.addEventListener('click', () => this.select(x.elements[0]));
        row.appendChild(b);
      }
      if (x.repair) {
        const b = el('button', 'mini go', 'answer this');
        b.addEventListener('click', () => { this.runRepair({ condition: x, move: x.repair }); this.showConditions(); });
        row.appendChild(b);
      }
      d.appendChild(row);
      body.appendChild(d);
    }
  }

  showHistory() {
    const body = this.openSheet('how the building got here');
    for (const rec of [...this.world.history].reverse().slice(0, 40)) {
      const d = el('div', 'hist');
      d.appendChild(el('i', '', 't' + rec.t));
      d.appendChild(el('span', '', `${rec.op || rec.kind}${rec.cause ? ` (answering ${rec.cause})` : ''} — ${rec.note}`));
      if (rec.before) d.appendChild(el('small', '', `${rec.before} → ${rec.after}`));
      for (const c of rec.opened || []) d.appendChild(el('small', 'op', 'opened · ' + c.message));
      for (const c of rec.closed || []) d.appendChild(el('small', 'cl', 'closed · ' + c.message));
      if (rec.elements && rec.elements.length) {
        const b = el('button', 'mini', 'show in the world');
        b.addEventListener('click', () => { this.view.flash(rec.elements.slice(0, 40), 0xa78bfa, 2600); this.closeSheet(); });
        d.appendChild(b);
      }
      body.appendChild(d);
    }
  }

  showInvariants() {
    const body = this.openSheet('rules this build had to learn');
    body.appendChild(el('div', 'dim', 'Each of these was promoted because the same condition kept arriving. They are checked before an operation runs, not after.'));
    for (const i of this.world.invariants) {
      const d = el('div', 'cond sev1');
      d.appendChild(el('b', '', i.code));
      d.appendChild(el('span', '', i.rule));
      d.appendChild(el('small', '', `promoted at t${i.since} after ${i.seen} encounters`));
      body.appendChild(d);
    }
  }

  showHelp() {
    const body = this.openSheet('what it understands');
    for (const [k, v] of VOCABULARY) {
      const d = el('div', 'kv');
      d.appendChild(el('i', '', k));
      d.appendChild(el('span', '', v));
      d.addEventListener('click', () => { $('#say').value = v.split('·')[0].split('—')[0].trim(); this.closeSheet(); $('#say').focus(); });
      body.appendChild(d);
    }
    const d = el('div', 'kv');
    d.appendChild(el('i', '', 'reference'));
    d.appendChild(el('span', '', CONCEPTS.map(c => c.key).join(' · ')));
    body.appendChild(d);
  }

  // ---------------------------------------------------------------- reference
  async bind(which) {
    const c = CONCEPTS.find(x => x.key === which) || CONCEPTS[0];
    this.say(`reading ${c.name}…`);
    try {
      const res = await fetch(c.file);
      if (!res.ok) throw new Error(`${res.status}`);
      const tris = parseSTL(await res.arrayBuffer());
      const ref = bindReference(this.world, { id: c.id, name: c.name, tris });
      this.refOn = true;
      this.view.showReference(ref.tris, true);
      const rb = $('#refBtn'); rb.hidden = false; rb.classList.add('on');
      this.world.conditions = checkAll(this.world);
      const cmp = compareToReference(this.world);
      this.world.record({ kind: 'reference', note: `bound ${c.name}; end ${(cmp.end.agreement * 100).toFixed(0)}%, side ${(cmp.side.agreement * 100).toFixed(0)}%`, elements: [] });
      this.say(`${c.name} bound. end elevation agrees ${(cmp.end.agreement * 100).toFixed(0)}%, side ${(cmp.side.agreement * 100).toFixed(0)}%.`, 'ok');
      for (const line of cmp.end.lines.slice(0, 3)) this.say('· ' + line, 'warn');
      this.after([]);
    } catch (err) {
      this.say(`could not read ${c.file}: ${err.message}`, 'bad');
    }
  }
}

addEventListener('DOMContentLoaded', () => { window.app = new App(); });
