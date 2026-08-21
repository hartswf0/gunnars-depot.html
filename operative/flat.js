// operative/flat.js — draw the building without a GPU.
//
// `new THREE.WebGLRenderer()` throws when a browser cannot give it a context —
// a locked-down machine, a sandboxed frame, a laptop that has fallen back to
// software and been refused. The throw was uncaught, so it killed the whole
// module: not just the 3D, but the punch list, the findings table, the chat, the
// controls. Six pages in this repository went completely blank on a machine
// where every one of their measurements would have worked fine.
//
// So: an orthographic painter on a 2D canvas. It needs nothing but the geometry,
// which we already have exactly — every member is a box or a sheared box, and a
// box seen along an axis is two rectangles and four edges. Painter's algorithm,
// back to front. It is not a rendering; it is a drawing, which for a building is
// arguably the right register anyway.

import { poly, verts } from './poly.js';

/** Which way the camera looks, as a right-handed basis. Z is up in this world. */
export const PROJECTIONS = {
  plan:   { right: [1, 0, 0],  up: [0, 1, 0],  into: [0, 0, -1], label: 'PLAN' },
  front:  { right: [1, 0, 0],  up: [0, 0, 1],  into: [0, 1, 0],  label: 'FRONT' },
  rear:   { right: [-1, 0, 0], up: [0, 0, 1],  into: [0, -1, 0], label: 'REAR' },
  left:   { right: [0, 1, 0],  up: [0, 0, 1],  into: [1, 0, 0],  label: 'LEFT' },
  right:  { right: [0, -1, 0], up: [0, 0, 1],  into: [-1, 0, 0], label: 'RIGHT' },
  // a true axonometric, so one drawing carries all three dimensions
  iso:    { right: [0.707, 0.707, 0], up: [-0.409, 0.409, 0.816], into: [0.577, -0.577, 0.577], label: 'ISOMETRIC' }
};

export const LAYER_INK = {
  foundation: '#6b7785', chassis: '#6b7785', frame: '#b98a4e', walls: '#8c9aa8',
  roof: '#7d8f9c', interior: '#9d8e77', services: '#7c6fa8'
};
const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];

/** Every face of every member, as a 2D polygon with a depth. */
function faces(world, p, { hide = null } = {}) {
  const out = [];
  const FACE = [
    [0,1,3,2], [4,6,7,5],   // -z, +z
    [0,4,5,1], [2,3,7,6],   // -y, +y
    [0,2,6,4], [1,5,7,3]    // -x, +x
  ];
  for (const e of world.solids()) {
    if (hide && hide.has(e.kind)) continue;
    const P = poly(e.box, e.shear);
    const v = verts(P);                       // 8 corners, in world space
    for (const f of FACE) {
      const pts = f.map(i => v[i]);
      // outward-ish normal from the first three corners
      const a = pts[0], b = pts[1], c = pts[2];
      const u = [b[0]-a[0], b[1]-a[1], b[2]-a[2]], w = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
      const n = [u[1]*w[2]-u[2]*w[1], u[2]*w[0]-u[0]*w[2], u[0]*w[1]-u[1]*w[0]];
      const nl = Math.hypot(...n) || 1;
      const facing = dot([n[0]/nl, n[1]/nl, n[2]/nl], p.into);
      if (facing > -0.02) continue;           // back face: skip it, this is a solid
      out.push({
        id: e.id, kind: e.kind, layer: e.layer,
        xy: pts.map(q => [dot(q, p.right), dot(q, p.up)]),
        depth: pts.reduce((s, q) => s + dot(q, p.into), 0) / 4,
        shade: Math.min(1, Math.max(0.35, -facing))
      });
    }
  }
  out.sort((a, b) => b.depth - a.depth);      // painter: furthest first
  return out;
}

/**
 * Draw the world onto a 2D context. Returns the transform, so callers can put
 * their own marks on top in world coordinates.
 */
export function draw(ctx, world, {
  view = 'iso', width, height, pad = 24, background = '#0d1117',
  ink = LAYER_INK, hide = null, wire = false, alpha = 1
} = {}) {
  const p = PROJECTIONS[view] || PROJECTIONS.iso;
  const W = width || ctx.canvas.width, H = height || ctx.canvas.height;
  ctx.save();
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, W, H); }
  const fs = faces(world, p, { hide });
  if (!fs.length) { ctx.restore(); return null; }
  let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const f of fs) for (const q of f.xy) {
    if (q[0] < lo[0]) lo[0] = q[0]; if (q[0] > hi[0]) hi[0] = q[0];
    if (q[1] < lo[1]) lo[1] = q[1]; if (q[1] > hi[1]) hi[1] = q[1];
  }
  const s = Math.min((W - pad*2) / Math.max(1e-6, hi[0]-lo[0]), (H - pad*2) / Math.max(1e-6, hi[1]-lo[1]));
  const ox = (W - (hi[0]-lo[0]) * s) / 2, oy = (H - (hi[1]-lo[1]) * s) / 2;
  const toPx = (q) => [ox + (q[0]-lo[0]) * s, H - oy - (q[1]-lo[1]) * s];   // y up

  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha;
  for (const f of fs) {
    ctx.beginPath();
    const first = toPx(f.xy[0]);
    ctx.moveTo(first[0], first[1]);
    for (let i = 1; i < f.xy.length; i++) { const q = toPx(f.xy[i]); ctx.lineTo(q[0], q[1]); }
    ctx.closePath();
    if (!wire) {
      const base = ink[f.layer] || '#8a929c';
      ctx.fillStyle = shade(base, f.shade);
      ctx.fill();
    }
    ctx.strokeStyle = wire ? (ink[f.layer] || '#8a929c') : 'rgba(0,0,0,.35)';
    ctx.lineWidth = wire ? 0.7 : 0.5;
    ctx.stroke();
  }
  ctx.restore();
  return { toPx: (world3) => toPx([dot(world3, p.right), dot(world3, p.up)]), scale: s, view: p.label };
}

/** A hex colour dimmed toward black by k. */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

/** Is there a GPU to talk to at all? Asked once, cached, never throws. */
let webgl = null;
export function hasWebGL() {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl');
    webgl = !!gl;
    if (gl && gl.getExtension) gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { webgl = false; }
  return webgl;
}
