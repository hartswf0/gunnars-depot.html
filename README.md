# Gunnar's Depot

**Build the Vision. Command the Job.**

Gunnar's Depot is a browser-based modular structure forge for builders, contractors, designers, and clients who need to see it, split it, change it, explain it, and build it.

The GitHub Pages entry point is `index.html`. The Three.js building environment that answers back is `operative-builder.html`; the mobile-first builder base is `gunnar-thunder-builder.html`; the family game surfaces are `builders-game.html` and `city-builder-game.html`; the branded depot app remains `gunnars-depot.html`.

## What Is Included

- `index.html` - mobile-friendly launcher for GitHub Pages.
- `hospital.html` - a diagnostic bay. Admit any model in this repository - a built world with a full chart, or a bare mesh in STL, Collada or glTF - and run the same instruments on it: escape scan, CT with a slice scrubber, radiographs, per-part exposure, contact sheet. Calibrated against a box known to be sealed before anything it says is believed. No key, no network.
- `whats-fucked.html` - assumes the build is wrong and goes looking. Photographs the model from twelve named views, scores each one, and runs two agents with separate context windows - a critic that only accuses, a builder that only acts. Worst view wins, never the average; a clean view moves the camera rather than ending anything.
- `ingold-trailer.html` - the 8'-6" x 20'-0" trailer from the reference sheets: 407 members, 558 joints, five connected systems, 7,050 lb, built by the operative loop and replayed move by move.
- `making-of.html` - a plain transcript of how it was made: what was asked for against what got built, then the consequential loops with their commands, answers and screenshots.
- `tools/session-record.mjs` - regenerates that record from a Claude Code session transcript.
- `operative-builder.html` - Three.js building environment where instructions become framing operations and the framing answers back. See [OPERATIVE_BUILDER.md](OPERATIVE_BUILDER.md).
- `operative/` - the world model, deterministic checks, operations, reference comparison, and view behind it.
- `vendor/three/` - vendored three.js (r185, MIT) so the app runs with no CDN.
- `tests/run.mjs` - `node tests/run.mjs` runs 302 assertions against the world model and the built trailer.
- `tools/spec-report.mjs` - rebuilds `data/spec-report.json` by running the builder and measuring the result against the spec sheet.
- `tools/shoot.mjs` - photographs the built trailer from all twelve views into `assets/views/`, with a manifest that records which pictures are renders and which are references.
- `tools/taxonomy.mjs` - counts what actually goes wrong, in three separate populations: what the checks caught, what went wrong writing the builder, and what a person caught by looking. Writes `data/error-taxonomy.json`.
- `tools/flyseye.mjs` - a close-up of every part on one contact sheet, subject painted and neighbours ghosted, so a model can compare ninety of them at once instead of looking at ninety images. Writes `assets/flyseye/sheet.html`.
- `tools/scan.mjs` - fills the building with light and records where it gets out. Calibrates against a box known to be sealed first, then writes an unfolded exposure plate, three radiographs and a list of leaks with the parts that bound each one. `--stl path` scans any existing structure instead. Writes `assets/scan/scan.html`.
- `making-of.html` - the 18 decisions the builder made, and the session that produced the builder, as a plain transcript.
- `gunnar-thunder-builder.html` - mobile-first parts/layers builder for importing one DAE/STL as the base and building with editable widgets.
- `builders-game.html` - mobile Builder's Language trailer game where commands become parts on a build grid.
- `city-builder-game.html` - mobile city-builder sim with map layers, reversible planning, Gemini advisor/drafts, roads, zones, utilities, cash, and happiness.
- `gunnars-depot.html` - branded modular 3D structure command center.
- `gunnar-trailer-configurer.html` - earlier trailer-focused DAE/STL/OBJ configurator.
- `thors-forge.html` - single-file STL editor/viewer.
- `assets/branding/` - favicon, logo, and brand mark.
- `assets/models/modules/` - five build modules exported as DAE, GLB, and STL.
- `assets/models/concepts/` - five trailer studies exported as DAE, GLB, and STL.
- `data/asset-manifest.json` - scalable asset manifest.
- `data/materials.json` - material/color/cost logic.
- `data/module-rules.json` - module order, dependencies, snap-point types, future categories.

## Apps

Open `index.html` on GitHub Pages, then launch:

- **Operative Builder**: a building environment that resists. Cut an opening and the interrupted studs say so; route a 2 in supply and the bore rules refuse it; bind one of the five concept studies and the silhouette comparison names what disagrees. Drag a member and its neighbours answer live before anything is committed; long-press it and its earlier positions stand in the world as ghosts you can argue with. Every member can report how it became what it is, every move walks back, and rules the build keeps breaking get promoted to invariants at runtime.
- **Gunnar's Depot**: main branded modular structure tool.
- **Gunnar Thunder Builder**: sharper builder surface with widgets, scene hierarchy, layer visibility, haptics, sound, DAE/STL import, and STL/JSON export.
- **Builder's Game**: family-friendly mobile game where block, pillar, slab, and beam commands become trailer-building actions.
- **City Builder**: family-friendly city sim where roads, homes, shops, factories, power, water, parks, map layers, and Gemini planning drive population, budget, and happiness.
- **Gunnar Trailer Configurer**: simple trailer iteration tool.
- **Thor's Forge**: STL-oriented editor and primitive builder.
- **SOLIDBENCH**: OpenSCAD-authoritative printable-solid workbench with streamed
  AI iteration, rendered critique, mesh inspection, and BYOAI providers. Launch
  the static surface at `SOLIDBENCH/`; run `SOLIDBENCH/solidbench_server.py` for
  complete VOLUND execution.

## SOLIDBENCH

SOLIDBENCH is the active printable-solid development path in this repository.
Its static interface works on GitHub Pages. Full OpenSCAD generation requires
the local Python server because GitHub Pages cannot execute OpenSCAD or protect
provider keys.

- [Overview](SOLIDBENCH/README.md)
- [Quickstart](SOLIDBENCH/QUICKSTART.md)
- [Expert onboarding](SOLIDBENCH/EXPERT_ONBOARDING.md)
- [Help](SOLIDBENCH/HELP.md)

## Asset Strategy

DAE is preserved as the stronger editable source format because it can carry names, material intent, hierarchy, and scene relationships better than STL.

GLB is exported as the production web runtime target.

STL is kept as the lightweight fallback geometry format because it loads reliably in a self-contained browser tool.

```text
Original DAE / STL source
  -> split into five modular asset groups
  -> exported as DAE, GLB, and STL
  -> described by manifest JSON
  -> loaded independently in Gunnar's Depot
```

## Core Modules

1. Foundation / Base
2. Structural Frame
3. Walls / Exterior Shell
4. Roof / Cover System
5. Interior / Finish Layer

Each module can be loaded, selected, hidden, locked, duplicated, transformed, recolored, annotated, and exported.

## Five Trailer Studies

1. Wright / Usonian Trailer
2. Shigeru Ban Shelter Trailer
3. Lacaton & Vassal Economy Trailer
4. Alexander Pattern Cabin Trailer
5. Contractor Reality Trailer

## Scaling The Depot

Add future structure types by extending:

- `data/asset-manifest.json`
- `data/materials.json`
- `data/module-rules.json`
- `assets/models/`

Planned categories include garages, ADUs, cabins, decks, pergolas, kitchens, bathrooms, retail interiors, luxury interiors, showrooms, workshops, restaurants, trade booths, and outdoor kitchens.

## Notes

The very large legacy raw SketchUp web export files are intentionally ignored for GitHub because they duplicate the websafe assets and are not needed by the Pages app. The usable web assets are in `assets/models/`.
