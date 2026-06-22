# Expert onboarding

## Authority model

Treat versioned OpenSCAD as the design authority. Treat PNG as visual evidence,
STL as the evaluated manufacturing artifact, and Three.js as an inspection
surface. Never infer that a button state proves a file operation.

The browser’s Manifold parts tools remain useful for immediate sketches. They do
not supersede the accepted OpenSCAD artifact returned by VOLUND.

## Request lifecycle

`POST /api/chat` accepts JSON and returns newline-delimited JSON:

```json
{
  "requirement": "literal build requirement",
  "name": "model_name",
  "current_source": "optional complete OpenSCAD source",
  "provider": "anthropic|openai|gemini",
  "api_key": "optional request-scoped key",
  "max_iterations": 4
}
```

Stream event order:

```text
state
source
iteration
source
iteration
...
complete | error
```

An `iteration` event identifies its exact SCAD and PNG artifacts and carries the
vision result:

```json
{
  "satisfied": false,
  "critique": "specific visible mismatch",
  "what_changed": "smallest requested next operation"
}
```

## Provider adapters

All providers receive the same operational OpenSCAD system instruction and the
same rendered PNG during critique. Provider-specific code is limited to request
shape and response extraction.

Defaults are controlled by:

```text
ANTHROPIC_MODEL
OPENAI_MODEL
GEMINI_MODEL
```

Update defaults only after checking the provider’s current multimodal model
support. Keep provider failures explicit; do not silently switch providers.

## Geometry execution

The server calls only these scripts:

```text
scripts/version-scad.sh
scripts/render-scad.sh
scripts/export-stl.sh
```

Each script uses `set -euo pipefail`, checks artifact size, and returns a nonzero
status for missing or empty outputs. On Apple Silicon, a universal OpenSCAD
snapshot is executed through its x86_64 slice because some native Qt snapshots
fail their NEON capability check.

## Validation boundaries

- OpenSCAD/CGAL warnings come from the authoritative compiler/export path.
- Watertight topology is reported from the loaded mesh/kernel path.
- Overhang is computed from triangle normals.
- Minimum wall is a three-axis estimate, not a slicer guarantee.
- Visual critique checks the rendered view, not hidden internal geometry.
- Final print approval still belongs in the target slicer with the intended
  material, nozzle, layer height, supports, and machine profile.

## Development checks

```sh
npm install
npm run build:css
python3 -m py_compile solidbench_server.py
bash -n scripts/*.sh
ruby -e 's=File.read("solidbench.html")[/<script type="module">(.*)<\/script>/m,1];File.write("/tmp/solidbench.mjs",s)'
node --check /tmp/solidbench.mjs
```

Smoke-test OpenSCAD:

```sh
tmp=$(mktemp -d)
printf 'cube([10,10,10]);\n' > "$tmp/smoke.scad"
scripts/render-scad.sh "$tmp/smoke.scad" --output "$tmp/smoke.png" --render
scripts/export-stl.sh "$tmp/smoke.scad" --output "$tmp/smoke.stl" --binary
file "$tmp/smoke.png" "$tmp/smoke.stl"
```

## Production deployment

`solidbench_server.py` is a local development server. Before an internet-facing
deployment, add:

- HTTPS and authenticated users.
- Secret management instead of browser-supplied keys.
- Per-user artifact directories.
- Request size, iteration, cost, and concurrency limits.
- OpenSCAD subprocess isolation and resource limits.
- Input/output retention rules.
- CSRF/CORS policy and structured audit logs.
- A job queue for long renders.

GitHub Pages hosts only the static application. Configure an authenticated HTTPS
VOLUND deployment separately before enabling AI/OpenSCAD operations from Pages.
