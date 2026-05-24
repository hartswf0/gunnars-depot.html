import os

import bpy


ROOT = "/Users/gaia/Documents/Codex/2026-05-24/design-inside-sketchup-a-cost-effective"
OUT = os.path.join(ROOT, "6x12_trailer_tiny_home_five_design_studies_SKETCHUP_FREE.stl")

INCH = 0.0254
WIDTH = 72.0
PITCH = 150.0


def m(v):
    return v * INCH


def add_box(name, x, y, z, w, d, h):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(m(x + w / 2), m(y + d / 2), m(z + h / 2)))
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = (m(w), m(d), m(h))
    return obj


SEGMENTS = {
    1: "bc",
    2: "abged",
    3: "abgcd",
    4: "fgbc",
    5: "afgcd",
}


def add_block_digit(number, ox):
    # Seven-segment style numerals made only from simple boxes so they survive STL.
    x = ox + 24
    y = -34
    z = 3
    t = 3.0
    w = 24.0
    h = 36.0
    seg = {
        "a": (x + t, y, z + h - t, w - 2 * t, t, t),
        "g": (x + t, y, z + h / 2 - t / 2, w - 2 * t, t, t),
        "d": (x + t, y, z, w - 2 * t, t, t),
        "f": (x, y, z + h / 2, t, t, h / 2 - t),
        "b": (x + w - t, y, z + h / 2, t, t, h / 2 - t),
        "e": (x, y, z + t, t, t, h / 2 - t),
        "c": (x + w - t, y, z + t, t, t, h / 2 - t),
    }
    for key in SEGMENTS[number]:
        add_box(f"STL visible concept number {number} segment {key}", *seg[key])
    add_box(f"STL concept {number} simple plaque", ox + 7, -39, 0, WIDTH - 14, 3, 2)


def remove_non_geometry_labels():
    reject = (
        "label",
        "callout",
        "swatch",
        "cost material",
        "requested_scene",
        "footprint label",
        "scene camera",
    )
    for obj in list(bpy.data.objects):
        lowered = obj.name.lower()
        if obj.type == "CAMERA" or any(term in lowered for term in reject):
            bpy.data.objects.remove(obj, do_unlink=True)


def main():
    remove_non_geometry_labels()
    for i in range(5):
        add_block_digit(i + 1, i * PITCH)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.data.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.ops.export_mesh.stl(
        filepath=OUT,
        check_existing=False,
        use_selection=True,
        ascii=False,
        use_mesh_modifiers=True,
        global_scale=39.37007874015748,
    )
    print(f"Saved {OUT}")


if __name__ == "__main__":
    main()
