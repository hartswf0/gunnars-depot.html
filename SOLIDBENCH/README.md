# SOLIDBENCH

SOLIDBENCH turns a literal object requirement into versioned OpenSCAD source,
rendered evidence, an inspected mesh, and an exportable STL.

The interface has two execution modes:

| Mode | Where it runs | Available operations |
|---|---|---|
| Static bench | GitHub Pages or any static server | Three.js viewport, local Manifold sketches, transforms, reports, project import/export |
| VOLUND | `solidbench_server.py` or a deployed HTTPS backend | AI-generated OpenSCAD, numbered source versions, PNG render/vision critique loop, STL export, persistent artifacts |

GitHub Pages cannot run Python or OpenSCAD. The hosted page reports this boundary
and does not claim that a server-side build succeeded.

## Full pipeline

```text
requirement
  → provider generates executable OpenSCAD
  → scripts/version-scad.sh selects <name>_NNN
  → <name>_NNN.scad is written
  → scripts/render-scad.sh produces <name>_NNN.png
  → the selected multimodal provider critiques the literal render
  → VOLUND revises the complete source
  → scripts/export-stl.sh produces <name>_NNN.stl
  → Three.js loads that exact STL
  → SOLIDBENCH measures and exposes the mesh
```

Each successful iteration persists its SCAD source, PNG render, critique report,
and—on the final iteration—its STL under `SOLIDBENCH/artifacts/`.

## Start locally

See [QUICKSTART.md](QUICKSTART.md) for a clean-machine setup. The minimal path is:

```sh
cd SOLIDBENCH
npm install
npm run build:css
export ANTHROPIC_API_KEY="..." # or OPENAI_API_KEY / GEMINI_API_KEY
python3 solidbench_server.py
```

Open the URL printed by the server. Do not open the HTML as a `file://` URL.

## BYOAI providers

The VOLUND server supports:

- Anthropic Messages API: `ANTHROPIC_API_KEY`, optional `ANTHROPIC_MODEL`
- OpenAI Responses API: `OPENAI_API_KEY`, optional `OPENAI_MODEL`
- Gemini `generateContent`: `GEMINI_API_KEY`, optional `GEMINI_MODEL`

Keys may be supplied through environment variables. A key entered in the local
Builder panel is sent only to the loopback server for that request and is not
written to disk. Do not use per-request browser keys with an untrusted backend.

## Source layout

- `solidbench.html` — primary application.
- `solidbench.css` — compiled production Tailwind stylesheet.
- `solidbench_server.py` — static server, provider adapters, iteration stream, and artifact owner.
- `scripts/version-scad.sh` — immutable three-digit version selection.
- `scripts/render-scad.sh` — real OpenSCAD PNG rendering.
- `scripts/export-stl.sh` — real OpenSCAD binary STL export and statistics.
- `artifacts/` — generated outputs; intentionally ignored by Git.
- `sb-01.html` through `sb-04.html` — retained design and architecture studies.

## Documentation

- [Quickstart](QUICKSTART.md)
- [Expert onboarding](EXPERT_ONBOARDING.md)
- [Help and troubleshooting](HELP.md)
- [VOLUND runtime details](VOLUND.md)

## Security boundary

The server binds to `127.0.0.1` by default. Keep it on loopback unless you add
authentication, TLS, request limits, artifact isolation, and a trusted deployment
boundary. OpenSCAD source is executable model input; do not expose the current
server directly to the public internet.
