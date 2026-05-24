# Gunnar's Forge

Open:

`gunnar-trailer-configurer.html`

This is a local, single-file trailer model configurator. It is meant to replace the blocked SketchUp Free workflow for this project, not to imitate SketchUp's paywall.

What it loads locally:

- `.stl`
- `.obj`
- `.dae` / Collada, bounded support for common mesh geometry
- `.gunnar.json` project files saved from this app

What it does:

- Keeps every loaded trailer or part as a separate model entry.
- Starts with a 6 ft x 12 ft trailer kit.
- Shows a 6 ft x 12 ft x 7 ft editable envelope.
- Lets the text/logic panel directly mutate selected geometry.
- Supports click-to-select in the viewport and click-to-select in the model stack.
- Adds builder primitives: block, panel, 2x stud, deck, wheel, roof sheet.
- Moves, rotates, scales, fits, grounds, centers, duplicates, and removes models.
- Exports the selected model or all visible models as STL.
- Saves a `.gunnar.json` project with embedded geometry for iteration in Codex or the browser.

Important parser boundaries:

- DAE support is intentionally local and bounded. It covers common `<triangles>`, `<polylist>`, `<vertices>`, `<source>`, and float-array mesh structures.
- Full Collada animation, skeletal rigs, advanced materials, cameras, lights, and every possible transform stack are not implemented in this first forge.
- STL and OBJ are geometry-only formats. Materials and groups are recovered as forge metadata, not from those formats.

Hard caps:

- 32 MB per file
- 24 files at once
- 420 model entries
- 240,000 triangles per model
- 420,000 triangles per export

Files:

- `gunnar-trailer-configurer.html` - the actual single-file app
- `thors-forge.html` - earlier STL-focused editor
- `6x12_trailer_tiny_home_five_design_studies_SKETCHUP_FREE.stl` - current trailer comparison STL
- `6x12_trailer_tiny_home_five_design_studies_WEBSAFE.dae` - current lightweight DAE source for testing paid/DAE workflows
