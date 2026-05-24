import os
import re

import bpy


ROOT = "/Users/gaia/Documents/Codex/2026-05-24/design-inside-sketchup-a-cost-effective"
OUT = os.path.join(ROOT, "assets", "models")

CONCEPTS = [
    ("01 Wright / Usonian Trailer - warm low horizontal study", "wright-usonian-trailer"),
    ("02 Shigeru Ban Shelter Trailer - lightweight modular emergency ", "shigeru-ban-shelter-trailer"),
    ("03 Lacaton & Vassal Economy Trailer - maximum space minimum mon", "lacaton-vassal-economy-trailer"),
    ("04 Alexander Pattern Cabin Trailer - human pattern-language stu", "alexander-pattern-cabin-trailer"),
    ("05 Contractor Reality Trailer - cheapest plausible build study", "contractor-reality-trailer"),
]

CONTRACTOR_PREFIXES = {
    "base": "Contractor Reality Trailer - identical trailer frame, wheels, a",
    "shell": "Exterior shell - off-the-shelf box, plywood, studs, metal roof",
    "roof": "Roof form - one-slope corrugated metal with minimal overhang",
    "interior": "Interior program - plywood platforms, bins, simple utility cabi",
}


def ensure_dirs():
    for path in [
        os.path.join(OUT, "concepts"),
        os.path.join(OUT, "modules"),
        os.path.join(OUT, "stl"),
    ]:
        os.makedirs(path, exist_ok=True)


def collection_by_prefix(prefix):
    for collection in bpy.data.collections:
        if collection.name.startswith(prefix):
            return collection
    raise RuntimeError(f"Collection not found: {prefix}")


def objects_in_collection_recursive(collection):
    found = []
    seen = set()

    def walk(col):
        for obj in col.objects:
            if obj.name not in seen and obj.type == "MESH":
                found.append(obj)
                seen.add(obj.name)
        for child in col.children:
            walk(child)

    walk(collection)
    return found


def select_only(objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.select_set(True)
    if objects:
        bpy.context.view_layer.objects.active = objects[0]


def export_selected(base_path):
    if not bpy.context.selected_objects:
        raise RuntimeError(f"No selected objects for export {base_path}")
    bpy.ops.wm.collada_export(filepath=f"{base_path}.dae", selected=True, apply_modifiers=True)
    bpy.ops.export_scene.gltf(filepath=f"{base_path}.glb", use_selection=True, export_format="GLB", export_apply=True)
    bpy.ops.export_mesh.stl(filepath=f"{base_path}.stl", use_selection=True, ascii=False, use_mesh_modifiers=True, global_scale=39.37007874015748)


def export_concepts():
    for prefix, slug in CONCEPTS:
        collection = collection_by_prefix(prefix)
        objects = objects_in_collection_recursive(collection)
        select_only(objects)
        export_selected(os.path.join(OUT, "concepts", slug))
        print(f"exported concept {slug}: {len(objects)} objects")


def classify_module_object(obj):
    name = obj.name.lower()
    if any(token in name for token in ["trailer wheel", "axle", "hitch", "coupler", "jack", "fender", "frame rail", "crossmember", "trailer deck"]):
        return "foundation"
    if any(token in name for token in ["stud", "frame", "rail", "repair panel"]):
        return "frame"
    if any(token in name for token in ["wall", "door", "window", "sheathing", "cutaway"]):
        return "walls"
    return "walls"


def export_depot_modules():
    groups = {
        "foundation": [],
        "frame": [],
        "walls": [],
        "roof": [],
        "interior": [],
    }

    base = objects_in_collection_recursive(collection_by_prefix(CONTRACTOR_PREFIXES["base"]))
    shell = objects_in_collection_recursive(collection_by_prefix(CONTRACTOR_PREFIXES["shell"]))
    roof = objects_in_collection_recursive(collection_by_prefix(CONTRACTOR_PREFIXES["roof"]))
    interior = objects_in_collection_recursive(collection_by_prefix(CONTRACTOR_PREFIXES["interior"]))

    for obj in base:
        groups[classify_module_object(obj)].append(obj)
    for obj in shell:
        groups[classify_module_object(obj)].append(obj)
    groups["roof"].extend(roof)
    groups["interior"].extend(interior)

    names = {
        "foundation": "foundation-base",
        "frame": "structural-frame",
        "walls": "walls-exterior-shell",
        "roof": "roof-cover-system",
        "interior": "interior-finish-layer",
    }

    for key, objects in groups.items():
        select_only(objects)
        export_selected(os.path.join(OUT, "modules", names[key]))
        print(f"exported module {key}: {len(objects)} objects")


def main():
    ensure_dirs()
    export_concepts()
    export_depot_modules()


if __name__ == "__main__":
    main()
