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
import { probeMove, speak, geometryHistory } from './probe.js';
import { box as mkbox } from './geom.js';
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
const el2 = el;   // methods shadow `el` with the element under inspection

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
    // Tap selects. Dragging on the member that is already selected disturbs it —
    // dragging anywhere else orbits. Long press opens its becoming.
    let down = null, drag = null, longPress = null;
    const SNAP = 0.25;
    const snap = (v) => Math.round(v / SNAP) * SNAP;

    const CAP = { capture: true };
    canvas.addEventListener('pointerdown', (e) => {
      const ghost = this.view.pickGhost(e.clientX, e.clientY);
      if (ghost !== null && this.view.ghosts[ghost]) return this.adoptGhost(ghost);
      const stack = this.view.pickStack(e.clientX, e.clientY);
      // Pressing on the member you already selected grabs *it*, even when other
      // members are in front of it — otherwise you can never drag anything you had
      // to reach by stepping behind something else.
      const hit = (this.selected && stack.includes(this.selected)) ? this.selected : (stack[0] || null);
      down = { x: e.clientX, y: e.clientY, t: performance.now(), hit, stack };
      longPress = setTimeout(() => {
        if (!down || drag) return;
        longPress = null;
        if (down.hit) { this.select(down.hit); this.showBecoming(down.hit); down = null; }
      }, 480);
    }, CAP);

    canvas.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x, dy = e.clientY - down.y;
      const moved = Math.hypot(dx, dy);
      if (!drag) {
        // Any real movement cancels the press-and-hold. Cancelling it only once the
        // drag threshold was crossed meant a slow, small movement fired the long
        // press mid-drag and stole the gesture.
        if (moved > 3 && longPress) { clearTimeout(longPress); longPress = null; }
        if (moved < 10) return;
        if (down.hit !== this.selected) { down = null; return; }   // not the selected member: let the camera have it
        const el = this.world.get(down.hit);
        if (!el) { down = null; return; }
        // the first ten pixels choose the axis: up-down on screen means height
        const axis = Math.abs(dy) > Math.abs(dx) * 1.4 ? 'z' : 'xy';
        const grab = this.view.planePoint(down.x, down.y, el.box.p, axis);
        if (!grab) { down = null; return; }
        drag = { id: down.hit, axis, grab, origin: el.box.p.slice(), shear: el.shear };
        this.view.controls.enabled = false;
        canvas.setPointerCapture(e.pointerId);
        this.beginDisturb(drag);
      }
      const now = this.view.planePoint(e.clientX, e.clientY, drag.origin, drag.axis);
      if (!now) return;
      const p = drag.origin.slice();
      if (drag.axis === 'z') p[2] = snap(drag.origin[2] + (now[2] - drag.grab[2]));
      else { p[0] = snap(drag.origin[0] + (now[0] - drag.grab[0])); p[1] = snap(drag.origin[1] + (now[1] - drag.grab[1])); }
      e.stopPropagation();          // the object has the gesture; the camera does not
      this.disturb(drag, p);
    }, CAP);

    const release = (e) => {
      clearTimeout(longPress); longPress = null;
      if (drag) {
        this.view.controls.enabled = true;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
        this.endDisturb(drag);
        drag = null; down = null;
        return;
      }
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      const quick = performance.now() - down.t < 480;
      const stack = down.stack || [];
      down = null;
      if (moved >= 8 || !quick) return;
      // A tap on the same spot steps behind what it hit, so interior framing and
      // services are reachable without hiding a layer first.
      let next = stack[0] || null;
      const at = stack.indexOf(this.selected);
      if (at >= 0 && stack.length > 1) next = stack[(at + 1) % stack.length];
      this.select(next);
      if (stack.length > 1 && next) {
        const n = stack.indexOf(next) + 1;
        this.hint(`${n} of ${stack.length} under your finger — tap again to step behind`);
      }
    };
    canvas.addEventListener('pointerup', release, CAP);
    canvas.addEventListener('pointercancel', release, CAP);

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

  // ------------------------------------------------------------ disturbance
  beginDisturb(drag) {
    const el = this.world.get(drag.id);
    this.view.pending = { id: drag.id, box: mkbox(el.box.p, el.box.s), shear: el.shear, ok: true };
    this.dismissHold();
    $('#answer').hidden = false;
  }

  /** Every frame of a drag the neighbours answer. Nothing is committed. */
  disturb(drag, p) {
    const el = this.world.get(drag.id);
    if (!el) return;
    const next = mkbox(p, el.box.s);
    const r = probeMove(this.world, drag.id, next, el.shear);
    drag.probe = r; drag.at = p;
    this.view.pending = { id: drag.id, box: next, shear: el.shear, ok: r.ok };
    this.view.showLinks(this.world, drag.id, r);
    this.view.sync(this.world);
    const d = p.map((v, i) => v - drag.origin[i]);
    const moved = d.map(v => (v >= 0 ? '+' : '') + v.toFixed(2)).join(' / ');
    $('#answer').className = 'answer ' + (r.ok ? 'clear' : 'clash');
    $('#answer').innerHTML = '';
    const row = (k, v, cls) => { const n = el2('span', 'ans ' + (cls || '')); n.appendChild(el2('i', '', k)); n.appendChild(el2('b', '', v)); return n; };
    $('#answer').appendChild(row('', `${drag.id}  ${moved} in`, 'who'));
    $('#answer').appendChild(row('STRUCTURE', r.structure, r.clashes.length ? 'bad' : 'good'));
    $('#answer').appendChild(row('SUPPORT', r.support, r.support === 'FLOATING' ? 'bad' : 'good'));
    if (r.clashes.length) $('#answer').appendChild(row('HITS', r.clashes.slice(0, 3).map(c => `${c.id} ${c.depth}in`).join(', '), 'bad'));
    if (r.orphaned.length) $('#answer').appendChild(row('DROPS', r.orphaned.slice(0, 3).join(', ') + (r.orphaned.length > 3 ? ` +${r.orphaned.length - 3}` : ''), 'bad'));
  }

  /** Viable release offers a hold. An unviable one springs back. */
  endDisturb(drag) {
    this.view.showLinks(null, null, null);
    if (!drag.probe || !drag.at) { this.springBack(); return; }
    if (!drag.probe.ok) {
      this.springBack();
      const why = drag.probe.clashes.length ? `${drag.probe.clashes[0].id} is in the way`
        : drag.probe.orphaned.length ? `it would drop ${drag.probe.orphaned.join(', ')}`
        : 'nothing would carry it';
      this.say(`${drag.id} sprang back — ${why}`, 'bad');
      return;
    }
    this.offerHold(drag.id, drag.at, drag.origin);
  }

  springBack() {
    this.view.pending = null;
    this.view.sync(this.world);
    $('#answer').hidden = true;
    this.dismissHold();
  }

  /** Playing with the model is free; writing to it takes a deliberate hold. */
  offerHold(id, at, origin) {
    const bar = $('#hold');
    bar.hidden = false;
    bar.textContent = 'HOLD TO COMMIT';
    bar.className = 'hold';
    let timer = null, cancel = null;
    const start = () => {
      bar.classList.add('arming');
      timer = setTimeout(() => {
        bar.classList.remove('arming');
        this.view.pending = null;
        const delta = at.map((v, i) => +(v - origin[i]).toFixed(3));
        this.run('move', { id, delta }, 'disturbed by hand');
        $('#answer').hidden = true;
        this.dismissHold();
        if (this.becoming === id) this.showBecoming(id);
      }, 620);
    };
    const stop = () => { clearTimeout(timer); bar.classList.remove('arming'); };
    bar._start = start; bar._stop = stop;
    bar.addEventListener('pointerdown', start);
    bar.addEventListener('pointerup', stop);
    bar.addEventListener('pointerleave', stop);
    clearTimeout(this.holdTimeout);
    // an offer that is ignored is not an edit
    this.holdTimeout = setTimeout(() => { if (!bar.hidden) { this.springBack(); this.say('let go — nothing committed'); } }, 6000);
    cancel = () => {};
  }

  dismissHold() {
    const bar = $('#hold');
    if (!bar) return;
    clearTimeout(this.holdTimeout);
    bar.hidden = true;
    bar.classList.remove('arming');
    const clone = bar.cloneNode(true);
    bar.parentNode.replaceChild(clone, bar);
  }

  /** Grab an old state and argue with it: the runtime judges it against the world as it is now. */
  adoptGhost(index) {
    const st = this.view.ghosts[index];
    if (!st || !this.becoming) return;
    const el = this.world.get(this.becoming);
    if (!el) return;
    const next = mkbox(st.box.p, el.box.s);
    const r = probeMove(this.world, this.becoming, next, el.shear);
    this.view.pending = { id: this.becoming, box: next, shear: el.shear, ok: r.ok };
    this.view.showLinks(this.world, this.becoming, r);
    this.view.sync(this.world);
    $('#answer').hidden = false;
    $('#answer').className = 'answer ' + (r.ok ? 'clear' : 'clash');
    $('#answer').innerHTML = '';
    const line = el2('span', 'ans who');
    line.appendChild(el2('b', '', `t${st.t} state · ${r.structure} · ${r.support}`));
    $('#answer').appendChild(line);
    if (r.ok) this.offerHold(this.becoming, st.box.p.slice(), el.box.p.slice());
    else {
      this.say(`the t${st.t} position of ${this.becoming} no longer works — ${r.clashes.length ? r.clashes[0].id + ' is there now' : 'nothing would carry it'}`, 'warn');
      setTimeout(() => this.springBack(), 2600);
    }
  }

  /** A one-line aside on the transient readout; never a permanent panel. */
  hint(text) {
    const box = $('#answer');
    if (box.hidden) return;
    const row = el2('span', 'ans');
    row.appendChild(el2('i', '', 'depth'));
    row.appendChild(el2('b', '', text));
    box.appendChild(row);
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
    st.appendChild(el('span', 'dim', c.length ? `${c.length} open` : 'nothing open'));
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

  /** Tap: the world dims to this one member and it says what it is. No sheet. */
  select(id) {
    if (!id) {
      this.selected = null; this.becoming = null;
      this.view.setSelection(null);
      this.view.showGhosts(null);
      this.view.sync(this.world);
      $('#answer').hidden = true;
      this.closeSheet();
      return;
    }
    const e = this.world.get(id);
    if (!e) return this.say(`no member "${id}"`, 'bad');
    this.selected = id;
    if (this.becoming !== id) { this.becoming = null; this.view.showGhosts(null); }
    const g = this.world.grounded();
    const related = new Set([id, ...(g.under.get(id) || []).map(x => x.id), ...(g.over.get(id) || []).map(x => x.id)]);
    this.view.setSelection(id, related);
    this.view.sync(this.world);
    this.view.flash([id], 0x38bdf8, 1800);

    const v = speak(this.world, id);
    const box = $('#answer');
    box.hidden = false;
    box.className = 'answer ' + (v.quiet ? 'clear' : 'clash');
    box.innerHTML = '';
    const head = el2('span', 'ans who');
    head.appendChild(el2('b', '', id));
    head.appendChild(el2('i', '', 'drag to disturb · hold for its becoming'));
    box.appendChild(head);
    for (const [k, val] of v.lines.slice(0, 6)) {
      const row = el2('span', 'ans' + (k === 'I_OBSERVE' ? ' bad' : k === 'I_REQUEST' ? ' warn' : ''));
      row.appendChild(el2('i', '', k));
      row.appendChild(el2('b', '', val.length > 88 ? val.slice(0, 86) + '…' : val));
      box.appendChild(row);
    }
  }

  /** Long press: how it became this way, with its prior states standing in the world. */
  showBecoming(id) {
    const e = this.world.get(id);
    if (!e) return;
    this.becoming = id;
    const states = geometryHistory(this.world, id);
    this.scrubIndex = states.length - 1;
    this.view.showGhosts(states, this.scrubIndex);
    this.view.sync(this.world);

    const body = this.openSheet(`${id} · ${states.length} state${states.length === 1 ? '' : 's'}`);
    // the encounter ribbon: consequential states, not arbitrary frames
    const ribbon = el2('div', 'ribbon');
    states.forEach((st, i) => {
      const dot = el2('button', 'dot' + (st.current ? ' now' : '') + (i === this.scrubIndex ? ' on' : ''));
      dot.title = st.note;
      dot.addEventListener('click', () => this.scrubTo(id, states, i));
      ribbon.appendChild(dot);
      if (i < states.length - 1) ribbon.appendChild(el2('span', 'rail'));
    });
    body.appendChild(ribbon);
    body.appendChild(el2('div', 'dim', states.length > 1
      ? 'Tap a dot, or a ghost in the world, to put this member back there. The runtime judges the old position against the building as it is now.'
      : 'This member has not moved since it was placed.'));

    const g = this.world.grounded();
    const under = g.under.get(id) || [], over = g.over.get(id) || [];
    const bearsOn = under.filter(x => x.via === 'bear').map(x => x.id);
    const carries = over.filter(x => x.via === 'bear').map(x => x.id);
    const fastened = under.filter(x => x.via === 'fasten').map(x => x.id);
    const list = (a) => a.length > 8 ? `${a.slice(0, 8).join(', ')} +${a.length - 8} more` : a.join(', ');
    body.appendChild(this.kv('is', `${e.kind}${e.section ? ' · ' + e.section : ''} in ${e.layer}`));
    body.appendChild(this.kv('made of', e.material.replace(/_/g, ' ')));
    body.appendChild(this.kv('sits at', `x ${e.lo[0].toFixed(1)}–${e.hi[0].toFixed(1)} · y ${e.lo[1].toFixed(1)}–${e.hi[1].toFixed(1)} · z ${e.lo[2].toFixed(1)}–${e.hi[2].toFixed(1)} in`));
    if (bearsOn.length) body.appendChild(this.kv('bears on', list(bearsOn)));
    if (carries.length) body.appendChild(this.kv('carries', list(carries)));
    if (fastened.length) body.appendChild(this.kv('fastened to', list(fastened)));
    for (const p of e.meta.penetrations || [])
      body.appendChild(this.kv('bored', `${p.dia.toFixed(2)} in for ${p.run}, ${p.edge !== undefined ? p.edge.toFixed(2) + ' in of edge left' : 'through'}`));

    for (const c of (this.world.conditions || []).filter(c => c.elements.includes(id))) {
      const d = el2('div', 'cond sev' + c.severity);
      d.appendChild(el2('b', '', c.code));
      d.appendChild(el2('span', '', c.message));
      if (c.repair) {
        const b = el2('button', 'mini go', 'answer this');
        b.addEventListener('click', () => { this.runRepair({ condition: c, move: c.repair }); this.showBecoming(id); });
        d.appendChild(b);
      }
      body.appendChild(d);
    }

    body.appendChild(el2('h4', '', 'what passed through it'));
    if (!e.trace.length) body.appendChild(el2('div', 'dim', 'placed with the seed kit; untouched since.'));
    for (const tr of e.trace.slice(-14)) {
      const d = el2('div', 'trace');
      d.appendChild(el2('i', '', 't' + tr.t));
      d.appendChild(el2('span', '', `${tr.kind}${tr.cause ? ` (answering ${tr.cause})` : ''} — ${tr.note}`));
      body.appendChild(d);
    }
  }

  /** Move the highlight along the ribbon and put that old state up for judgement. */
  scrubTo(id, states, i) {
    this.scrubIndex = i;
    this.view.showGhosts(states, i);
    if (states[i].current) { this.springBack(); this.view.sync(this.world); return; }
    this.adoptGhost(i);
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
