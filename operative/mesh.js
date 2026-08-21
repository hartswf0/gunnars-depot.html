// operative/mesh.js — load a patient, whatever format it arrived in.
//
// The diagnostic bay is useless if it can only look at the one building this
// project happens to generate. Every model in this repository exists as STL, DAE
// and GLB, and all three store the same thing the same way: a library of unit
// boxes, instanced by a scene graph that scales and places them. Read the
// triangles and skip the graph and every model is a 1 x 1 x 1 cube at the origin.
//
// So this walks the graph. No dependencies, runs in node and in a browser.

// ---------------------------------------------------------------- 4x4 matrices
export const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major, the way glTF and Collada both store them. */
export function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
export function apply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]
  ];
}
export function fromTRS(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ];
}
/** Collada writes matrices row-major inside <matrix>; glTF writes column-major. */
export const transpose = (m) => [
  m[0], m[4], m[8], m[12], m[1], m[5], m[9], m[13],
  m[2], m[6], m[10], m[14], m[3], m[7], m[11], m[15]];

// ---------------------------------------------------------------- STL
export function parseSTL(buffer) {
  const dv = new DataView(buffer);
  // ASCII STLs start with "solid" — but so do some binary ones, so the length
  // check decides and the text check is only the fallback.
  const n = buffer.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  if (buffer.byteLength >= 84 && 84 + n * 50 === buffer.byteLength) {
    const tris = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;
      for (let v = 0; v < 9; v++) tris[i * 9 + v] = dv.getFloat32(o + v * 4, true);
    }
    return { tris, parts: [{ name: 'solid', start: 0, count: n }], format: 'stl', upAxis: 'Z_UP' };
  }
  const text = new TextDecoder().decode(buffer);
  if (!/^\s*solid/i.test(text)) throw new Error('not an STL');
  const nums = [];
  const re = /vertex\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)\s+(-?[\d.eE+-]+)/g;
  let m;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  const tris = Float32Array.from(nums);
  return { tris, parts: [{ name: 'solid', start: 0, count: tris.length / 9 }], format: 'stl-ascii', upAxis: 'Z_UP' };
}

// ---------------------------------------------------------------- GLB / glTF
const COMPONENT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
                    5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const ELEMENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

export function parseGLB(buffer) {
  const dv = new DataView(buffer);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a GLB');
  const total = dv.getUint32(8, true);
  let o = 12, json = null, bin = null;
  while (o < total) {
    const len = dv.getUint32(o, true), type = dv.getUint32(o + 4, true);
    const body = buffer.slice(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === 0x004e4942) bin = body;
    o += 8 + len;
  }
  if (!json) throw new Error('GLB has no JSON chunk');
  const read = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
    const Ctor = COMPONENT[a.componentType];
    const n = ELEMENTS[a.type];
    const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    // A strided buffer view cannot be wrapped directly; copy element by element.
    if (bv.byteStride && bv.byteStride !== n * Ctor.BYTES_PER_ELEMENT) {
      const out = new Ctor(a.count * n);
      const view = new DataView(bin);
      for (let k = 0; k < a.count; k++)
        for (let c = 0; c < n; c++)
          out[k * n + c] = Ctor === Float32Array
            ? view.getFloat32(base + k * bv.byteStride + c * 4, true)
            : view.getUint16(base + k * bv.byteStride + c * 2, true);
      return out;
    }
    return new Ctor(bin, base, a.count * n);
  };
  const out = [], parts = [];
  let written = 0;
  const walk = (idx, parent) => {
    const node = json.nodes[idx];
    const local = node.matrix ? node.matrix.slice()
      : fromTRS(node.translation, node.rotation, node.scale);
    const world = mul(parent, local);
    if (node.mesh !== undefined) {
      const start = written;
      for (const prim of json.meshes[node.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;   // triangles only
        const pos = read(prim.attributes.POSITION);
        const idxs = prim.indices !== undefined ? read(prim.indices)
          : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
        for (let k = 0; k < idxs.length; k += 3) {
          for (let v = 0; v < 3; v++) {
            const p = apply(world, [pos[idxs[k + v] * 3], pos[idxs[k + v] * 3 + 1], pos[idxs[k + v] * 3 + 2]]);
            out.push(p[0], p[1], p[2]);
          }
          written++;
        }
      }
      if (written > start) parts.push({ name: node.name || `node.${idx}`, start, count: written - start });
    }
    for (const c of node.children || []) walk(c, world);
  };
  const scene = json.scenes[json.scene || 0];
  for (const r of scene.nodes) walk(r, IDENTITY);
  return { tris: Float32Array.from(out), parts, format: 'glb', upAxis: 'Y_UP' };
}

// ---------------------------------------------------------------- XML + Collada
/**
 * A tiny XML tree. DOMParser exists in a browser and not in node, and a
 * diagnostic that only works in one of them is a diagnostic you cannot check.
 */
export function parseXML(text) {
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  const re = /<([?!\/]?)([\w:.-]*)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(text))) {
    const [, prefix, tag, attrText, selfClose, chars] = m;
    if (chars !== undefined) { stack[stack.length - 1].text += chars; continue; }
    if (prefix === '?' || prefix === '!') continue;
    if (prefix === '/') { if (stack.length > 1) stack.pop(); continue; }
    const attrs = {};
    const ar = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
    let a;
    while ((a = ar.exec(attrText))) attrs[a[1]] = a[2];
    const node = { tag, attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}
export const find = (n, tag) => n.children.find(c => c.tag === tag);
export const findAll = (n, tag) => {
  const out = [];
  const go = (x) => { for (const c of x.children) { if (c.tag === tag) out.push(c); go(c); } };
  go(n);
  return out;
};
const nums = (s) => (s.trim() ? s.trim().split(/\s+/).map(Number) : []);

export function parseDAE(text) {
  const doc = parseXML(text);
  const up = findAll(doc, 'up_axis')[0];
  const upAxis = up ? up.text.trim() : 'Y_UP';
  // geometry id -> { positions, triangles: [i0,i1,i2, ...] }
  const geo = new Map();
  for (const g of findAll(doc, 'geometry')) {
    const mesh = find(g, 'mesh');
    if (!mesh) continue;
    const sources = new Map();
    for (const s of mesh.children.filter(c => c.tag === 'source')) {
      const fa = find(s, 'float_array');
      if (fa) sources.set('#' + s.attrs.id, nums(fa.text));
    }
    // <vertices> indirects the position source, so a <p> index is via that
    let posSource = null;
    const verts = find(mesh, 'vertices');
    if (verts) {
      const inp = verts.children.find(c => c.tag === 'input' && c.attrs.semantic === 'POSITION');
      if (inp) posSource = sources.get(inp.attrs.source);
    }
    const tri = [];
    for (const t of mesh.children.filter(c => c.tag === 'triangles' || c.tag === 'polylist')) {
      const inputs = t.children.filter(c => c.tag === 'input');
      const stride = Math.max(...inputs.map(i => +(i.attrs.offset || 0))) + 1;
      const vin = inputs.find(i => i.attrs.semantic === 'VERTEX');
      const off = vin ? +(vin.attrs.offset || 0) : 0;
      const src = vin && sources.has(vin.attrs.source) ? sources.get(vin.attrs.source) : posSource;
      const p = nums((find(t, 'p') || { text: '' }).text);
      const vcount = find(t, 'vcount');
      if (vcount) {
        // polylist: fan-triangulate each face
        const counts = nums(vcount.text);
        let cur = 0;
        for (const c of counts) {
          const face = [];
          for (let k = 0; k < c; k++) face.push(p[(cur + k) * stride + off]);
          for (let k = 1; k + 1 < c; k++) tri.push(face[0], face[k], face[k + 1]);
          cur += c;
        }
      } else {
        for (let k = 0; k * stride + off < p.length; k++) tri.push(p[k * stride + off]);
      }
      if (src) geo.set('#' + g.attrs.id, { positions: src, tri: geo.has('#' + g.attrs.id)
        ? geo.get('#' + g.attrs.id).tri.concat(tri) : tri });
    }
  }
  // the scene graph
  const out = [], parts = [];
  let written = 0;
  const walk = (node, parent) => {
    let m = parent;
    for (const c of node.children) {
      if (c.tag === 'matrix') m = mul(m, transpose(nums(c.text)));
      else if (c.tag === 'translate') { const t = nums(c.text); m = mul(m, fromTRS(t)); }
      else if (c.tag === 'scale') { const s = nums(c.text); m = mul(m, fromTRS([0, 0, 0], [0, 0, 0, 1], s)); }
      else if (c.tag === 'rotate') {
        const [x, y, z, deg] = nums(c.text);
        const a = (deg * Math.PI) / 360, s = Math.sin(a), n = Math.hypot(x, y, z) || 1;
        m = mul(m, fromTRS([0, 0, 0], [(x / n) * s, (y / n) * s, (z / n) * s, Math.cos(a)]));
      }
    }
    for (const inst of node.children.filter(c => c.tag === 'instance_geometry')) {
      const g = geo.get(inst.attrs.url);
      if (!g) continue;
      const start = written;
      for (let k = 0; k + 2 < g.tri.length; k += 3) {
        for (let v = 0; v < 3; v++) {
          const i = g.tri[k + v] * 3;
          const p = apply(m, [g.positions[i], g.positions[i + 1], g.positions[i + 2]]);
          out.push(p[0], p[1], p[2]);
        }
        written++;
      }
      if (written > start) parts.push({ name: node.attrs.name || node.attrs.id || 'part', start, count: written - start });
    }
    for (const c of node.children.filter(c => c.tag === 'node')) walk(c, m);
  };
  for (const scene of findAll(doc, 'visual_scene')) for (const n of scene.children.filter(c => c.tag === 'node')) walk(n, IDENTITY);
  return { tris: Float32Array.from(out), parts, format: 'dae', upAxis };
}

// ---------------------------------------------------------------- dispatch
export function loadMesh(name, data) {
  const ext = String(name).toLowerCase().split('.').pop();
  if (ext === 'glb' || ext === 'gltf') return parseGLB(data);
  if (ext === 'dae') return parseDAE(typeof data === 'string' ? data : new TextDecoder().decode(data));
  if (ext === 'stl') return parseSTL(data);
  // no extension to go on: sniff
  if (data instanceof ArrayBuffer && data.byteLength > 4) {
    const dv = new DataView(data);
    if (dv.getUint32(0, true) === 0x46546c67) return parseGLB(data);
    const head = new TextDecoder().decode(data.slice(0, 200));
    if (/<COLLADA/i.test(head)) return parseDAE(new TextDecoder().decode(data));
    return parseSTL(data);
  }
  throw new Error(`cannot tell what ${name} is`);
}

/** Bounds of a flat triangle array. */
export function meshBounds(tris) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3)
    for (let k = 0; k < 3; k++) {
      if (tris[i + k] < lo[k]) lo[k] = tris[i + k];
      if (tris[i + k] > hi[k]) hi[k] = tris[i + k];
    }
  return { lo, hi, size: lo.map((v, i) => hi[i] - v), c: lo.map((v, i) => (v + hi[i]) / 2) };
}

/**
 * Put a patient on the table the same way up as everything else here: Z up,
 * inches, resting on z = 0. Collada and glTF are Y-up metres by convention; the
 * models in this repository were exported from Blender and arrive Z-up in metres.
 * The rule is read off the geometry rather than assumed: if the model is taller in
 * y than in z, it is Y-up and gets turned over.
 */
export function standardise(tris, { unit = null, upAxis = null, format = null } = {}) {
  const b = meshBounds(tris);
  // The format says which way is up, so ask it rather than guessing from the
  // proportions. glTF is Y-up by specification; Collada declares <up_axis>; an
  // STL declares nothing and these were authored Z-up in inches. Guessed from
  // "taller in y than in z" the foundation module came out lying on its side,
  // because a trailer chassis is not taller than it is long in any orientation.
  const yUp = upAxis ? upAxis === 'Y_UP' : format === 'glb' || format === 'gltf';
  const out = new Float32Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const p = yUp ? [tris[i], -tris[i + 2], tris[i + 1]] : [tris[i], tris[i + 1], tris[i + 2]];
    out[i] = p[0]; out[i + 1] = p[1]; out[i + 2] = p[2];
  }
  const b2 = meshBounds(out);
  // metres or inches? A building is between 6 and 60 feet across its longest axis.
  const span = Math.max(...b2.size);
  const k = unit || (span < 40 ? 39.3701 : 1);
  for (let i = 0; i < out.length; i += 3) {
    out[i] = (out[i] - b2.c[0]) * k;
    out[i + 1] = (out[i + 1] - b2.c[1]) * k;
    out[i + 2] = (out[i + 2] - b2.lo[2]) * k;      // sitting on the ground
  }
  return { tris: out, yUp, scale: k, was: b2 };
}
