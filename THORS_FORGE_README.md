# Thors Forge

Open this file directly in a browser:

`thors-forge.html`

It is a single-file STL viewer/editor for mobile or desktop. It does not use SketchUp, paid import formats, external libraries, or a cloud service.

What it can do:

- Open STL files through the browser file picker.
- Show and orbit a 3D model with native WebGL.
- Add editable builder parts: block, panel, 2x stud, 6x12 deck, wheel, roof sheet.
- Select, move, rotate, scale, duplicate, delete, and drop parts to the floor.
- Export the edited scene as a new STL.
- Save/open a `.tforge` project file for later editing.

Important limits:

- Imported STL is geometry-only because STL is geometry-only.
- Imported STL can be moved, rotated, scaled, duplicated, deleted, and exported.
- Imported STL is not triangle-sculpted in this version.
- Editable construction parts remain Lego-like primitives.
- File size is capped at 20 MB, objects at 360, and export at 260,000 triangles.

Included package:

`thors-forge_single_file_app.zip`

The zip contains `thors-forge.html`, the current SketchUp-Free STL, and the PNG reference board.
