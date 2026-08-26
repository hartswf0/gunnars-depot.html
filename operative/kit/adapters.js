/**
 * The two seams, filled in.
 *
 * `ask` is the whole model surface: system prompt in, text and images in, parsed JSON
 * out. Both adapters below are about twenty lines, which is the point — swapping
 * provider, or putting your own server in front of one, does not touch the loop.
 *
 * A note on keys, since these run in a browser: a key in the page is a key you have
 * given to everyone who loads the page. That is fine for a local tool you run against
 * your own key, and not fine for anything you deploy. For deployment, point `ask` at
 * your own endpoint and keep the key on the server — the loop cannot tell the
 * difference.
 */

/** Pull the object out, whatever fencing it arrived in. */
export function parseJSON(text) {
  let t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) t = t.slice(a, b + 1);
  return JSON.parse(t);
}

async function withRetry(fn, tries = 2) {
  let last;
  for (let i = 0; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      const retryable = e.status === 429 || e.status >= 500 || /abort|network|fetch/i.test(String(e));
      if (i === tries || !retryable) throw e;
      await new Promise(r => setTimeout(r, 700 * Math.pow(2, i)));
    }
  }
  throw last;
}

/** data:image/png;base64,AAA… → the two halves the Messages API wants separately. */
function splitDataUrl(url) {
  const m = /^data:([^;,]+);base64,(.*)$/.exec(url || '');
  return m ? { media_type: m[1], data: m[2] } : null;
}

/**
 * Claude. Images go as content blocks before the text, which is the order that reads
 * best when the text is a list of image roles.
 */
export function claudeAsk({ apiKey, model = 'claude-opus-5', fetchImpl = fetch, endpoint = 'https://api.anthropic.com/v1/messages', headers = {} }) {
  return async ({ system, text, images = [], maxTokens = 2000 }) => {
    const content = [];
    for (const src of images) {
      const parts = splitDataUrl(src);
      content.push(parts
        ? { type: 'image', source: { type: 'base64', ...parts } }
        : { type: 'image', source: { type: 'url', url: src } });
    }
    content.push({ type: 'text', text });

    const data = await withRetry(async () => {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          // Only needed when calling straight from a page; harmless on a server.
          'anthropic-dangerous-direct-browser-access': 'true',
          ...headers
        },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { const err = new Error('HTTP ' + res.status + ' · ' + (body?.error?.message || '')); err.status = res.status; throw err; }
      return body;
    });

    // A refusal comes back 200 with no text block; say so rather than failing on parse.
    if (data.stop_reason === 'refusal') throw new Error('model declined: ' + (data.stop_details?.category || 'unspecified'));
    const out = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    try { return parseJSON(out); }
    catch { throw new Error('MODEL DID NOT RETURN VALID JSON: ' + out.slice(0, 220)); }
  };
}

/** OpenAI, via the responses endpoint — this is what recorded the traces in this repo. */
export function openaiAsk({ apiKey, model = 'gpt-5', fetchImpl = fetch, endpoint = 'https://api.openai.com/v1/responses' }) {
  return async ({ system, text, images = [], maxTokens = 2000 }) => {
    const content = [{ type: 'input_text', text }];
    for (const src of images) content.push({ type: 'input_image', image_url: src, detail: 'auto' });

    const data = await withRetry(async () => {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + apiKey },
        body: JSON.stringify({ model, instructions: system, store: false,
          max_output_tokens: maxTokens, input: [{ role: 'user', content }] })
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { const err = new Error('HTTP ' + res.status + ' · ' + (body?.error?.message || '')); err.status = res.status; throw err; }
      return body;
    });

    const out = data.output_text || (data.output || []).flatMap(o => (o.content || []))
      .filter(c => c.type === 'output_text').map(c => c.text).join('');
    try { return parseJSON(out); }
    catch { throw new Error('MODEL DID NOT RETURN VALID JSON: ' + String(out).slice(0, 220)); }
  };
}

/**
 * A stage is anything that can hold a world and photograph it from a named view.
 *
 * This one is three.js, because that is what the traces were made with, but nothing in
 * the loop knows that. A stage over a CAD kernel, a 2D canvas, a game engine, or a
 * server-side renderer satisfies the same four methods and the loop is unchanged.
 *
 * @param THREE the module, so this file has no import of its own
 */
export function threeStage(THREE, { width = 900, height = 650, views } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fb6c8);
  const camera = new THREE.PerspectiveCamera(40, width / height, .1, 4000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(width, height, false);
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0x6e665c, 1.5));
  const sun = new THREE.DirectionalLight(0xfff0d7, 2.2); sun.position.set(-30, 60, 36); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000),
    new THREE.MeshStandardMaterial({ color: 0xc2a97c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const group = new THREE.Group(), diffGroup = new THREE.Group();
  scene.add(group, diffGroup);

  function geometryFor(o) {
    const [x, y, z] = o.size || [1, 1, 1];
    if (o.primitive === 'cylinder') return new THREE.CylinderGeometry(x / 2, x / 2, y, 24);
    if (o.primitive === 'cone') return new THREE.ConeGeometry(x / 2, y, 24);
    if (o.primitive === 'sphere') return new THREE.SphereGeometry(x / 2, 24, 16);
    if (o.primitive === 'gable') {
      const s = new THREE.Shape();
      s.moveTo(-x / 2, 0); s.lineTo(x / 2, 0); s.lineTo(0, y); s.closePath();
      const g = new THREE.ExtrudeGeometry(s, { depth: z, bevelEnabled: false });
      g.translate(0, 0, -z / 2); return g;
    }
    return new THREE.BoxGeometry(x, y, z);
  }

  function apply(world) {
    group.clear();
    for (const o of world) {
      const m = new THREE.Mesh(geometryFor(o), new THREE.MeshStandardMaterial({
        color: new THREE.Color(o.color || '#d8c8a9'),
        roughness: o.material === 'metal' ? .35 : .9, metalness: o.material === 'metal' ? .6 : .03 }));
      m.position.set(...(o.position || [0, 0, 0]));
      m.rotation.y = o.rotation_y || 0;
      m.scale.set(...(o.scale || [1, 1, 1]));
      m.userData.id = o.id;
      group.add(m);
    }
  }

  /** Same framing every time, so two shots of the same world are comparable. */
  function place(view) {
    const b = new THREE.Box3().setFromObject(group);
    if (b.isEmpty()) b.set(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 10, 5));
    const c = b.getCenter(new THREE.Vector3()), r = Math.max(4, b.getSize(new THREE.Vector3()).length() * .95);
    const A = { FRONT: [Math.PI, 1.03], BACK: [0, 1.03], LEFT: [-Math.PI / 2, 1.03], RIGHT: [Math.PI / 2, 1.03],
      TOP: [Math.PI, .15], ENTRY: [Math.PI, 1.14], FRONT_3Q: [Math.PI * 1.25, .93], REAR_3Q: [Math.PI * .25, .93],
      LOW_FRONT: [Math.PI, 1.34], LOW_REAR: [0, 1.34], HIGH_LEFT: [-Math.PI / 2, .63], HIGH_RIGHT: [Math.PI / 2, .63] };
    const [az, pol] = A[view] || A.FRONT;
    const d = view === 'TOP' ? r * .92 : view === 'ENTRY' ? r * .72 : r;
    camera.position.set(c.x + d * Math.sin(pol) * Math.sin(az), c.y + d * Math.cos(pol), c.z + d * Math.sin(pol) * Math.cos(az));
    camera.lookAt(c);
  }

  const draw = (view) => { place(view); renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); };

  return {
    views, canvas: renderer.domElement, scene, camera, renderer,
    apply(world) { apply(world); },
    shoot(view) { diffGroup.visible = false; return draw(view); },
    /** Cyan added, yellow changed, red removed — the legend the critic prompt names. */
    shootDiff(view, diff) {
      diffGroup.clear();
      const paint = (ids, color) => { for (const id of ids) {
        const m = group.children.find(c => c.userData.id === id); if (!m) continue;
        const box = new THREE.Box3Helper(new THREE.Box3().setFromObject(m), new THREE.Color(color));
        diffGroup.add(box); } };
      paint(diff.added, 0x22d3ee); paint(diff.changed, 0xfacc15);
      diffGroup.visible = true;
      const url = draw(view);
      diffGroup.visible = false;
      return url;
    }
  };
}
