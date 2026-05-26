# Gunnar's Depot

**Build the Vision. Command the Job.**

Gunnar's Depot is a browser-based modular structure forge for builders, contractors, designers, and clients who need to see it, split it, change it, explain it, and build it.

The GitHub Pages entry point is `index.html`. The new mobile-first builder base is `gunnar-thunder-builder.html`; the family game surfaces are `builders-game.html` and `city-builder-game.html`; the branded depot app remains `gunnars-depot.html`.

## What Is Included

- `index.html` - mobile-friendly launcher for GitHub Pages.
- `gunnar-thunder-builder.html` - mobile-first parts/layers builder for importing one DAE/STL as the base and building with editable widgets.
- `builders-game.html` - mobile Builder's Language trailer game where commands become parts on a build grid.
- `city-builder-game.html` - mobile city-builder sim where roads, zones, utilities, cash, and happiness interact.
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

- **Gunnar's Depot**: main branded modular structure tool.
- **Gunnar Thunder Builder**: sharper builder surface with widgets, scene hierarchy, layer visibility, haptics, sound, DAE/STL import, and STL/JSON export.
- **Builder's Game**: family-friendly mobile game where block, pillar, slab, and beam commands become trailer-building actions.
- **City Builder**: family-friendly city sim where roads, homes, shops, factories, power, water, and parks drive population, budget, and happiness.
- **Gunnar Trailer Configurer**: simple trailer iteration tool.
- **Thor's Forge**: STL-oriented editor and primitive builder.

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
