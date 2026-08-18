// operative/view.js — the world, seen.
//
// The scene is a projection of world state, never a second copy of it. Every
// frame of geometry here is derived from an Element; nothing is drawn that the
// world cannot account for.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { poly } from './poly.js';

THREE.Object3D.DEFAULT_UP.set(0, 0, 1);   // the model is Z-up, in inches

export const MATERIAL_COLORS = {
  concrete: 0xa3a3a3, steel: 0x3a3f45, treated_wood: 0x8b5e34, engineered_lumber: 0xc08457,
  plywood: 0xc9a06a, siding: 0x6b7280, polycarbonate: 0x9ec9ee, corrugated_metal: 0xa3a3a3,
  standing_seam: 0x7a7f87, stone: 0xb8aea1, tile: 0xe5e7eb, paint: 0xf4efe7, fabric: 0xd4bfa5
};
const SYSTEM_COLOR = { power: 0xf59e0b, water: 0x38bdf8, waste: 0x8b5cf6 };
// for the film: which stage of the making a member belongs to
export const LAYER_COLOR = {
  foundation: 0x64748b, frame: 0xc08457, walls: 0x8a94a3,
  roof: 0x9aa3ad, interior: 0x4ade80, services: 0x38bdf8
};
export const SEVERITY_COLOR = { 3: 0xef4444, 2: 0xf97316, 1: 0xfacc15 };

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0d1014);
    this.scene.fog = new THREE.Fog(0x0d1014, 320, 900);

    this.camera = new THREE.PerspectiveCamera(45, 1, 1, 4000);
    this.camera.position.set(190, -210, 150);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(36, 72, 42);
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.minDistance = 40;
    this.controls.maxDistance = 900;

    const hemi = new THREE.HemisphereLight(0xdfe9f5, 0x1a1d22, 1.15);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff2dd, 1.5);
    key.position.set(-140, -180, 260);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x93c5fd, 0.5);
    rim.position.set(200, 160, 80);
    this.scene.add(rim);

    const grid = new THREE.GridHelper(720, 30, 0x2b3b52, 0x1a2431);
    grid.rotation.x = Math.PI / 2;
    grid.position.set(36, 72, 0);
    this.scene.add(grid);

    this.elementGroup = new THREE.Group(); this.scene.add(this.elementGroup);
    this.serviceGroup = new THREE.Group(); this.scene.add(this.serviceGroup);
    this.markerGroup = new THREE.Group(); this.scene.add(this.markerGroup);
    this.refGroup = new THREE.Group(); this.scene.add(this.refGroup);

    this.xray = true;             // skins translucent, so the frame can be read
    this.tintByLayer = false;     // for the making, colour tells you which stage a member belongs to
    this.ghostGroup = new THREE.Group(); this.scene.add(this.ghostGroup);
    this.linkGroup = new THREE.Group(); this.scene.add(this.linkGroup);
    this.pending = null;          // { id, box, shear, ok } — a disturbance not yet committed
    this.ghosts = [];             // prior states of the selected member
    this.meshes = new Map();      // element id -> mesh
    this.hidden = new Set();      // hidden layer ids
    this.selected = null;
    this.pulse = new Map();       // element id -> { until, color }
    this.unitBox = new THREE.BoxGeometry(1, 1, 1);
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth;
    const h = this.canvas.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  matrixFor(el) {
    const P = poly(el.box, el.shear);
    const m = new THREE.Matrix4();
    m.makeBasis(new THREE.Vector3(...P.a), new THREE.Vector3(...P.b), new THREE.Vector3(...P.c3));
    m.setPosition(P.c[0], P.c[1], P.c[2]);
    return m;
  }

  /** Rebuild the scene from world state. Cheap enough at this scale to be honest rather than clever. */
  sync(world) {
    const seen = new Set();
    while (this.openingGroup && this.openingGroup.children.length) {
      const c = this.openingGroup.children.pop();
      c.geometry.dispose(); c.material.dispose();
    }
    if (!this.openingGroup) { this.openingGroup = new THREE.Group(); this.scene.add(this.openingGroup); }
    for (const op of world.all({ kind: 'opening' })) {
      // A cut is a thing that happened; it should be visible as one.
      const g = new THREE.BoxGeometry(1, 1, 1);
      const line = new THREE.LineSegments(new THREE.EdgesGeometry(g),
        new THREE.LineBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.9 }));
      g.dispose();
      line.matrixAutoUpdate = false;
      line.matrix.copy(this.matrixFor(op));
      this.openingGroup.add(line);
    }
    for (const el of world.all()) {
      if (el.kind === 'opening') continue;
      seen.add(el.id);
      let mesh = this.meshes.get(el.id);
      const isService = el.layer === 'services';
      if (!mesh) {
        const color = isService ? (SYSTEM_COLOR[el.system] || 0x94a3b8) : (MATERIAL_COLORS[el.material] || 0x9aa3ad);
        const mat = new THREE.MeshStandardMaterial({
          color, roughness: el.material === 'steel' ? 0.42 : 0.86,
          metalness: el.material === 'steel' || el.material === 'corrugated_metal' ? 0.55 : 0.05,
          transparent: true, opacity: 1
        });
        mesh = new THREE.Mesh(this.unitBox, mat);
        mesh.userData.id = el.id;
        (el.kind === 'run' || isService ? this.serviceGroup : this.elementGroup).add(mesh);
        this.meshes.set(el.id, mesh);
      }
      mesh.matrixAutoUpdate = false;
      const held = this.pending && this.pending.id === el.id;
      mesh.matrix.copy(held ? this.matrixFor({ box: this.pending.box, shear: this.pending.shear }) : this.matrixFor(el));
      mesh.userData.layer = el.layer;
      const base = isService ? (SYSTEM_COLOR[el.system] || 0x94a3b8)
        : this.tintByLayer ? (LAYER_COLOR[el.layer] || 0x9aa3ad)
        : (MATERIAL_COLORS[el.material] || 0x9aa3ad);
      mesh.material.color.setHex(base);
      mesh.visible = !this.hidden.has(el.layer);
      const skin = el.kind === 'sheathing' || el.kind === 'panel' || el.kind === 'deck';
      let op = this.xray && skin ? 0.3 : 1;
      if (this.selected && this.selected !== el.id && !this.related?.has(el.id)) op = Math.min(op, 0.16);
      mesh.material.opacity = op;
      mesh.material.depthWrite = op > 0.9;
      mesh.renderOrder = op < 1 ? 1 : 0;
      if (mesh.material.emissive) {
        if (held) { mesh.material.emissive.setHex(this.pending.ok ? 0x22c55e : 0xef4444); mesh.material.emissiveIntensity = 0.55; }
        else if (!this.pulse.has(el.id)) { mesh.material.emissive.setHex(0x000000); mesh.material.emissiveIntensity = 0; }
      }
    }
    for (const [id, mesh] of this.meshes) {
      if (seen.has(id)) continue;
      mesh.parent.remove(mesh);
      mesh.material.dispose();
      this.meshes.delete(id);
    }
    this.syncMarkers(world);
  }

  /** Conditions are shown on the thing that has the condition, not in a list beside the world. */
  syncMarkers(world) {
    while (this.markerGroup.children.length) {
      const c = this.markerGroup.children.pop();
      c.geometry.dispose?.(); c.material.dispose?.();
    }
    const shown = new Set();
    for (const c of world.conditions || []) {
      for (const id of c.elements) {
        if (shown.has(id)) continue;
        const el = world.get(id);
        if (!el) continue;
        shown.add(id);
        const color = c.severity >= 3 ? 0xef4444 : c.severity >= 2 ? 0xf97316 : 0xfacc15;
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const edges = new THREE.LineSegments(
          new THREE.EdgesGeometry(geo),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 })
        );
        geo.dispose();
        const m = this.matrixFor(el);
        const grow = new THREE.Matrix4().makeScale(1.14, 1.14, 1.14);
        edges.matrixAutoUpdate = false;
        edges.matrix.copy(m).multiply(grow);
        edges.userData.severity = c.severity;
        this.markerGroup.add(edges);
      }
    }
  }

  /** The reference study, ghosted into the same frame the build is in. */
  showReference(tris, on = true) {
    while (this.refGroup.children.length) {
      const c = this.refGroup.children.pop();
      c.geometry.dispose(); c.material.dispose();
    }
    if (!on || !tris) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris), 3));
    geo.computeVertexNormals();
    // A dense triangle wireframe buried the building it was meant to be compared
    // with. The reference reads better as a ghost solid you can see the build inside.
    const mat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8, transparent: true, opacity: 0.09, roughness: 1, metalness: 0,
      side: THREE.DoubleSide, depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    this.refGroup.add(mesh);
  }

  setSelection(id, related) {
    this.selected = id;
    this.related = related || new Set();
  }

  flash(ids, color = 0x38bdf8, ms = 1600) {
    const until = performance.now() + ms;
    for (const id of ids || []) this.pulse.set(id, { until, color });
  }

  pick(clientX, clientY) {
    const stack = this.pickStack(clientX, clientY);
    return stack.length ? stack[0] : null;
  }

  /** Everything under the point, front to back — so a tap can step behind what it hit. */
  pickStack(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects([...this.elementGroup.children, ...this.serviceGroup.children], false)
      .filter(h => h.object.visible && h.object.material.opacity > 0.14);
    const seen = [];
    for (const h of hits) {
      const id = h.object.userData.id;
      if (id && !seen.includes(id)) seen.push(id);
    }
    return seen;
  }

  frame(world) {
    const b = { lo: [Infinity, Infinity, Infinity], hi: [-Infinity, -Infinity, -Infinity] };
    for (const e of world.solids()) {
      const l = e.lo, h = e.hi;
      for (let i = 0; i < 3; i++) { b.lo[i] = Math.min(b.lo[i], l[i]); b.hi[i] = Math.max(b.hi[i], h[i]); }
    }
    if (!Number.isFinite(b.lo[0])) return;
    const c = b.lo.map((v, i) => (v + b.hi[i]) / 2);
    const size = Math.max(...b.hi.map((v, i) => v - b.lo[i]));
    const fov = this.camera.fov * Math.PI / 180;
    const aspect = Math.max(0.4, this.camera.aspect);
    this.framedSize = size;
    const dist = (size / 2) / Math.tan(fov / 2) / Math.min(1, aspect) * 0.92;
    // the command dock owns the lower third of a phone screen; sit the building above it
    this.controls.target.set(c[0], c[1], c[2] - size * 0.16);
    const dir = new THREE.Vector3(0.62, -0.72, 0.42).normalize();
    this.camera.position.set(c[0] + dir.x * dist, c[1] + dir.y * dist, c[2] + dir.z * dist);
    this.controls.update();
  }

  /**
   * Prior states of one member, standing in the world as translucent solids.
   * Recovered from journal snapshots, so this costs no extra bookkeeping.
   */
  showGhosts(states, activeIndex) {
    while (this.ghostGroup.children.length) {
      const c = this.ghostGroup.children.pop();
      c.geometry.dispose?.(); c.material.dispose?.();
    }
    this.ghosts = states || [];
    if (!states) return;
    states.forEach((st, i) => {
      if (st.current) return;                          // the present state is already solid
      const active = i === activeIndex;
      const g = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({
        color: active ? 0xa78bfa : 0x94a3b8, transparent: true,
        opacity: active ? 0.36 : 0.2, depthWrite: false, side: THREE.DoubleSide
      });
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(this.matrixFor(st));
      mesh.renderOrder = 3;
      mesh.userData.ghostIndex = i;
      this.ghostGroup.add(mesh);
      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(g),
        new THREE.LineBasicMaterial({ color: active ? 0xc4b5fd : 0xcbd5e1, transparent: true, opacity: active ? 0.95 : 0.6 }));
      edge.matrixAutoUpdate = false;
      edge.matrix.copy(this.matrixFor(st));
      edge.renderOrder = 4;
      this.ghostGroup.add(edge);
    });
  }

  /**
   * Dependency drawn through the building rather than beside it. Only while
   * something is being disturbed, and only the relationships that are answering.
   */
  showLinks(world, id, probe) {
    while (this.linkGroup.children.length) {
      const c = this.linkGroup.children.pop();
      c.geometry.dispose(); c.material.dispose();
    }
    if (!id || !probe) return;
    const from = this.pending && this.pending.id === id ? this.pending.box.p : (world.get(id) || {}).box?.p;
    if (!from) return;
    const draw = (ids, color) => {
      for (const otherId of ids || []) {
        const o = world.get(otherId);
        if (!o) continue;
        const g = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(...from), new THREE.Vector3(...o.box.p)
        ]);
        this.linkGroup.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 })));
      }
    };
    draw(probe.clashes.map(c => c.id), 0xef4444);        // conflicts with
    draw(probe.orphaned, 0xf97316);                      // would let down
    draw(probe.bearing, 0x22c55e);                       // is carried by
    draw((probe.dependents || []).filter(d => !probe.orphaned.includes(d)), 0x38bdf8);  // carries
  }

  /** Where the finger lands, on the plane the drag is locked to. */
  planePoint(clientX, clientY, origin, axis) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    let normal;
    if (axis === 'z') {
      // a vertical plane facing the camera, so up-down on screen reads as height
      const dir = new THREE.Vector3().subVectors(this.camera.position, new THREE.Vector3(...origin));
      dir.z = 0;
      normal = dir.normalize();
    } else {
      normal = new THREE.Vector3(0, 0, 1);
    }
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(...origin));
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, hit) ? [hit.x, hit.y, hit.z] : null;
  }

  pickGhost(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.ghostGroup.children.filter(c => c.userData.ghostIndex !== undefined), false);
    return hits.length ? hits[0].object.userData.ghostIndex : null;
  }

  /** Refit only when the building has actually outgrown the view, so the camera
   *  does not lurch on every small move. */
  refitIfGrown(world) {
    let size = 0;
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const e of world.solids()) {
      const l = e.lo, h = e.hi;
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], l[i]); hi[i] = Math.max(hi[i], h[i]); }
    }
    if (!Number.isFinite(lo[0])) return;
    for (let i = 0; i < 3; i++) size = Math.max(size, hi[i] - lo[i]);
    if (!this.framedSize || size > this.framedSize * 1.12 || size < this.framedSize * 0.7) this.frame(world);
  }

  render() {
    const t = performance.now();
    for (const [id, p] of this.pulse) {
      const mesh = this.meshes.get(id);
      if (!mesh) { this.pulse.delete(id); continue; }
      if (t > p.until) { this.pulse.delete(id); mesh.material.emissive?.setHex(0x000000); continue; }
      const k = 0.5 + 0.5 * Math.sin(t / 90);
      mesh.material.emissive?.setHex(p.color);
      mesh.material.emissiveIntensity = k * 0.85;
    }
    for (const m of this.markerGroup.children) {
      m.material.opacity = 0.45 + 0.5 * Math.abs(Math.sin(t / (m.userData.severity >= 3 ? 320 : 620)));
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  start() {
    const loop = () => { this.render(); requestAnimationFrame(loop); };
    loop();
  }
}
