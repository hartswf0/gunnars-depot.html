# 6x12 Trailer Tiny Home Design Studies

SketchUp Free / no paid subscription path:

`6x12_trailer_tiny_home_five_design_studies_SKETCHUP_FREE.stl`

Import this STL in SketchUp Free as inches. It is geometry-only, about 307 KB, and includes the five side-by-side trailer studies with raised block numbers 1-5.

Then import this PNG as an image for the text/design logic board:

`6x12_trailer_tiny_home_SKETCHUP_FREE_reference_board.png`

Both files are also packaged here for convenience:

`6x12_trailer_tiny_home_SKETCHUP_FREE_package.zip`

Important: STL cannot carry materials, textures, labels, named groups, or scene tabs. Those constraints are from the file format and SketchUp Free import path, not the model.

Older Collada path, for paid/web importers that support DAE:

`6x12_trailer_tiny_home_five_design_studies_WEBSAFE_upload.zip`

This is the recommended browser version. It is about 600 KB and includes the Collada model plus small PNG label textures. Use this one first.

If that zip import is rejected, try the raw lightweight Collada file:

`websafe_upload_package/6x12_trailer_tiny_home_five_design_studies_WEBSAFE.dae`

The raw `.dae` should still bring in the geometry and named objects; label textures may be missing if SketchUp for Web does not also pick up the PNG files.

Older high-detail file:

`6x12_trailer_tiny_home_five_design_studies_for_sketchup_web.zip`

This version has mesh text and is much larger. Avoid it unless the lightweight version fails for a reason unrelated to file size.

If the zip import is rejected, upload:

`6x12_trailer_tiny_home_five_design_studies_for_sketchup_web.dae`

Files included:

- `6x12_trailer_tiny_home_five_design_studies_for_sketchup_web.zip` - compressed web import package
- `6x12_trailer_tiny_home_five_design_studies_WEBSAFE_upload.zip` - recommended lightweight web import package
- `websafe_upload_package/` - unzipped lightweight import folder
- `6x12_trailer_tiny_home_five_design_studies_for_sketchup_web.dae` - raw Collada import file
- `6x12_trailer_tiny_home_five_design_studies_WEBSAFE.dae` - lightweight raw Collada file
- `6x12_trailer_tiny_home_five_design_studies_source.blend` - editable Blender source used to generate the web import
- `tiny_trailer_design_studies.rb` - optional desktop SketchUp Ruby generator that creates native SketchUp scene tabs and saves a `.skp` when run in desktop SketchUp
- `generate_trailer_studies_blender.py` - generator script for the web import model

Note: SketchUp for Web cannot run Ruby scripts, and Collada import does not reliably create native SketchUp scene tabs. The model includes camera-guide objects and a scene-tab guide label. If you need native scene tabs, run `tiny_trailer_design_studies.rb` in desktop SketchUp.
