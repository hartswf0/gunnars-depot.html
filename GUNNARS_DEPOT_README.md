# Gunnar's Depot Build Notes

Gunnar's Depot is a structure-vision command center, not a fantasy viewer.

It treats a build as a set of named, loadable, editable modules:

- Foundation / Base
- Structural Frame
- Walls / Exterior Shell
- Roof / Cover System
- Interior / Finish Layer

The first shipped project is a 6 ft x 12 ft trailer tiny-home study set. The tool is already shaped so those same module rules can expand into ADUs, cabins, kitchens, showrooms, workshops, decks, pergolas, garages, and luxury interiors.

## Format Policy

- Use **DAE** when preserving material intent, names, hierarchy, and editability matters.
- Use **GLB** as the production web delivery format.
- Use **STL** as a reliable lightweight fallback for offline browser parsing and export.

## Runtime Behavior

`gunnars-depot.html` can:

- load five starter modules from `assets/models/modules/`
- load five separate trailer studies from `assets/models/concepts/`
- accept dropped DAE/STL/OBJ files
- assign a dropped file to a module slot
- toggle visibility
- lock/unlock parts
- duplicate parts
- edit position, rotation, scale, material, color, cost category, and notes
- show grid, x-ray, exploded view, isolate selected, and client view
- export a project JSON package
- export visible geometry as STL

## Product Direction

The app should keep moving toward this loop:

```text
visualize -> modify -> specify -> present -> build
```

Every new feature should answer at least one of these:

```text
What are we building?
What does it look like?
What is it made of?
What can change?
What will it cost?
How do I explain this to the client, crew, or vendor?
```
