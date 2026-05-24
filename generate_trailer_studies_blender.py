import math
import os
import re
import json
import subprocess
import textwrap

import bpy


ROOT = "/Users/gaia/Documents/Codex/2026-05-24/design-inside-sketchup-a-cost-effective"
WEBSAFE = os.environ.get("TRAILER_STUDIES_WEBSAFE", "0") == "1"
if WEBSAFE:
    DAE_PATH = os.path.join(ROOT, "6x12_trailer_tiny_home_five_design_studies_WEBSAFE.dae")
    BLEND_PATH = os.path.join(ROOT, "6x12_trailer_tiny_home_five_design_studies_WEBSAFE_source.blend")
else:
    DAE_PATH = os.path.join(ROOT, "6x12_trailer_tiny_home_five_design_studies_for_sketchup_web.dae")
    BLEND_PATH = os.path.join(ROOT, "6x12_trailer_tiny_home_five_design_studies_source.blend")
LABEL_TEXTURE_DIR = os.path.join(ROOT, "websafe_label_textures")
LABEL_PNG_SCRIPT = os.path.join(ROOT, "make_label_png.py")
SYSTEM_PYTHON = "/Users/gaia/anaconda3/bin/python3"
if not os.path.exists(SYSTEM_PYTHON):
    SYSTEM_PYTHON = "python3"

INCH = 0.0254
WIDTH = 72.0
LENGTH = 144.0
GAP = 78.0
PITCH = WIDTH + GAP

TEXT_OBJECTS = []
TEXTURE_MATERIALS = {}


def m(v):
    return v * INCH


def v3(x, y, z):
    return (m(x), m(y), m(z))


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for collection in list(bpy.data.collections):
        if collection.users == 0 or collection.name != "Scene Collection":
            bpy.data.collections.remove(collection)


def mat(name, rgb, alpha=1.0):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (rgb[0] / 255.0, rgb[1] / 255.0, rgb[2] / 255.0, alpha)
    if alpha < 1.0:
        material.use_nodes = True
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Alpha"].default_value = alpha
            bsdf.inputs["Base Color"].default_value = material.diffuse_color
        material.blend_method = "BLEND"
        material.use_screen_refraction = True
        material.show_transparent_back = True
    return material


def build_materials():
    return {
        "steel": mat("simple black-painted steel", (35, 38, 40)),
        "steel_light": mat("galvanized trailer steel", (126, 132, 136)),
        "tire": mat("rubber tires", (18, 18, 18)),
        "plywood": mat("cheap plywood / sheathing", (186, 139, 79)),
        "warm_plywood": mat("warm stained plywood", (156, 96, 45)),
        "framing": mat("standard 2x framing lumber", (214, 170, 106)),
        "pale_wood": mat("pale replaceable wood frame", (222, 191, 132)),
        "osb": mat("OSB / rough utility panels", (172, 132, 76)),
        "corrugated": mat("corrugated galvanized metal", (160, 166, 166)),
        "dark_roof": mat("dark low-slope roof membrane", (58, 55, 50)),
        "poly": mat("translucent polycarbonate panels", (185, 225, 232), 0.42),
        "recycled": mat("recycled mixed panels", (132, 142, 118)),
        "canvas": mat("canvas / curtain partition", (218, 207, 178), 0.72),
        "glass": mat("off-the-shelf window glass", (126, 178, 210), 0.38),
        "path": mat("clear central movement path", (83, 142, 164), 0.45),
        "table": mat("fold-down plywood work surface", (204, 156, 88)),
        "utility": mat("utility cabinet / water / battery", (80, 113, 122)),
        "label": mat("matte white label boards", (238, 236, 228)),
        "text": mat("black label text mesh", (22, 24, 24)),
        "redline": mat("cutaway red line", (196, 58, 48)),
        "floor": mat("unfinished plywood floor", (198, 154, 91)),
        "shadow": mat("soft gray comparison base", (225, 225, 218), 0.45),
        "green": mat("low-cost storage bins", (79, 125, 93)),
        "warm_center": mat("warm center floor mat", (171, 92, 60)),
        "whitewash": mat("whitewashed cheap panels", (226, 220, 204)),
        "dark_trim": mat("dark horizontal trim", (63, 52, 40)),
    }


def collection(name, parent=None):
    col = bpy.data.collections.new(name)
    if parent is None:
        bpy.context.scene.collection.children.link(col)
    else:
        parent.children.link(col)
    return col


def link(obj, col):
    if col:
        col.objects.link(obj)
        for existing in list(obj.users_collection):
            if existing != col:
                existing.objects.unlink(obj)
    return obj


def slug(text):
    clean = re.sub(r"[^A-Za-z0-9_.-]+", "_", text).strip("_")
    return clean[:96] or "label"


def ensure_label_png(name, body, size):
    out = os.path.join(LABEL_TEXTURE_DIR, f"{slug(name)}.png")
    payload = {"path": out, "text": body, "size": size}
    subprocess.run(
        [SYSTEM_PYTHON, LABEL_PNG_SCRIPT],
        input=json.dumps(payload),
        text=True,
        check=True,
    )
    return out


def textured_label_material(name, path):
    if path in TEXTURE_MATERIALS:
        return TEXTURE_MATERIALS[path]

    image = bpy.data.images.load(path)
    image.filepath = bpy.path.relpath(path)
    material = bpy.data.materials.new(f"label texture - {slug(name)}")
    material.use_nodes = True
    material.blend_method = "BLEND"
    material.diffuse_color = (1, 1, 1, 1)
    nodes = material.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    tex = nodes.new(type="ShaderNodeTexImage")
    tex.image = image
    if bsdf:
        material.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        material.node_tree.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    TEXTURE_MATERIALS[path] = material
    return material


def add_textured_label(col, name, body, x, y, z, size):
    path = ensure_label_png(name, body, size)
    material = textured_label_material(name, path)
    image = bpy.data.images.load(path, check_existing=True)
    px_w, px_h = image.size
    line_count = max(1, body.count("\n") + 1)
    height = max(size * 1.35, min(46.0, line_count * size * 1.35))
    width = max(size * 4.0, height * (px_w / max(1, px_h)))
    if "\n" in body:
        width = min(width, 108.0)
    verts = [
        v3(x, y, z),
        v3(x + width, y, z),
        v3(x + width, y, z - height),
        v3(x, y, z - height),
    ]
    mesh = bpy.data.meshes.new(f"{name} image label mesh")
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    mesh.update()
    uv = mesh.uv_layers.new(name="label UV")
    for loop, uv_co in zip(mesh.polygons[0].loop_indices, [(0, 1), (1, 1), (1, 0), (0, 0)]):
        uv.data[loop].uv = uv_co
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    link(obj, col)
    return obj


def add_box(col, name, x, y, z, w, d, h, material):
    bpy.ops.mesh.primitive_cube_add(size=1, location=v3(x + w / 2.0, y + d / 2.0, z + h / 2.0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = f"{name} mesh"
    obj.dimensions = (m(w), m(d), m(h))
    obj.data.materials.append(material)
    link(obj, col)
    return obj


def add_bar_xy(col, name, x1, y1, z, x2, y2, width, height, material):
    dx = x2 - x1
    dy = y2 - y1
    length = math.hypot(dx, dy)
    if length == 0:
        return None
    px = -dy / length * width / 2.0
    py = dx / length * width / 2.0
    bottom = [
        v3(x1 + px, y1 + py, z),
        v3(x2 + px, y2 + py, z),
        v3(x2 - px, y2 - py, z),
        v3(x1 - px, y1 - py, z),
    ]
    top = [(x, y, zz + m(height)) for x, y, zz in bottom]
    verts = bottom + top
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    link(obj, col)
    return obj


def add_roof_panel(col, name, points, material, thickness=1.2):
    verts = [v3(*pt) for pt in points]
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(verts, [], [(0, 1, 2, 3)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    link(obj, col)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    solid = obj.modifiers.new("thin roof/panel thickness", "SOLIDIFY")
    solid.thickness = m(thickness)
    bpy.ops.object.modifier_apply(modifier=solid.name)
    obj.select_set(False)
    return obj


def add_cylinder(col, name, center, normal_axis, radius, depth, material, vertices=32):
    rotation = (0, 0, 0)
    if normal_axis == "X":
        rotation = (0, math.radians(90), 0)
    elif normal_axis == "Y":
        rotation = (math.radians(90), 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=m(radius),
        depth=m(abs(depth)),
        location=v3(*center),
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.name = f"{name} mesh"
    obj.data.materials.append(material)
    link(obj, col)
    return obj


def add_wheel(col, name, x_face, y, z, depth, mats):
    add_cylinder(col, name, (x_face + depth / 2.0, y, z), "X", 12, depth, mats["tire"], 32)
    hub_x = x_face + (depth if depth > 0 else 0) + (0.45 if depth > 0 else -0.45)
    add_cylinder(col, f"{name} galvanized hub", (hub_x, y, z), "X", 4.5, 1, mats["steel_light"], 20)


def add_text(col, name, body, x, y, z, size=2.0, align="LEFT"):
    if WEBSAFE:
        return add_textured_label(col, name, body, x, y, z, size)

    bpy.ops.object.text_add(location=v3(x, y, z), rotation=(math.radians(90), 0, 0))
    obj = bpy.context.object
    obj.name = name
    obj.data.name = f"{name} text"
    obj.data.body = body
    obj.data.align_x = align
    obj.data.align_y = "TOP"
    obj.data.size = m(size)
    obj.data.space_line = 0.85
    obj.data.extrude = m(0.03)
    obj.data.materials.append(MATS["text"])
    link(obj, col)
    TEXT_OBJECTS.append(obj)
    return obj


def add_wrapped_label(col, name, title, body, x, y, z):
    add_box(col, f"{name} label board backing", x - 3, y, z - 52, 116, 2, 58, MATS["label"])
    add_text(col, f"{name} title label", title, x, y - 0.4, z, size=2.25)
    lines = []
    for item in body:
        lines.extend(textwrap.wrap(item, width=70))
    add_text(col, f"{name} design logic label", "\n".join(lines), x, y - 0.4, z - 8, size=1.28)
    add_box(col, f"{name} swatch plywood", x, y - 0.6, z - 48, 10, 1, 5, MATS["plywood"])
    add_box(col, f"{name} swatch steel", x + 12, y - 0.6, z - 48, 10, 1, 5, MATS["steel"])
    add_box(col, f"{name} swatch translucent", x + 24, y - 0.6, z - 48, 10, 1, 5, MATS["poly"])
    add_box(col, f"{name} swatch utility", x + 36, y - 0.6, z - 48, 10, 1, 5, MATS["utility"])
    add_text(col, f"{name} material swatch label", "material logic / cost logic", x, y - 0.4, z - 41, size=1.2)


def add_callouts(col, items):
    for label, pt in items.items():
        add_text(col, f"callout - {label}", label, pt[0], pt[1] - 0.3, pt[2], size=1.45)


def add_outline(col, name, x, y, z, w, d, material):
    add_bar_xy(col, f"{name} front edge", x, y, z, x + w, y, 0.8, 0.4, material)
    add_bar_xy(col, f"{name} back edge", x, y + d, z, x + w, y + d, 0.8, 0.4, material)
    add_bar_xy(col, f"{name} left edge", x, y, z, x, y + d, 0.8, 0.4, material)
    add_bar_xy(col, f"{name} right edge", x + w, y, z, x + w, y + d, 0.8, 0.4, material)


def add_comparison_ground(root):
    col = collection("Comparison Board - five side-by-side 6x12 trailer footprints", root)
    add_box(col, "continuous study-board base", -18, -52, -1, (PITCH * 4) + WIDTH + 36, 256, 1, MATS["shadow"])
    for i in range(5):
        x = i * PITCH
        add_outline(col, f"6 ft x 12 ft footprint outline {i + 1}", x, 0, 0.25, WIDTH, LENGTH, MATS["steel"])
        add_text(col, f"footprint label {i + 1}", "6 ft x 12 ft trailer footprint", x + 8, -13, 4, size=1.5)


def add_trailer_base(root, ox, concept_name):
    col = collection(f"{concept_name} - identical trailer frame, wheels, axle, hitch", root)
    def x(v): return ox + v

    add_box(col, "6x12 plywood trailer deck", x(0), 0, 12, WIDTH, LENGTH, 2, MATS["floor"])
    add_box(col, "left steel frame rail", x(5), 0, 6, 4, LENGTH, 4, MATS["steel"])
    add_box(col, "right steel frame rail", x(WIDTH - 9), 0, 6, 4, LENGTH, 4, MATS["steel"])
    for y in [0, 24, 48, 72, 96, 120, 141]:
        add_box(col, f"steel crossmember y={y}", x(5), y, 7, WIDTH - 10, 3, 3, MATS["steel_light"])
    add_box(col, "single axle bar", x(-8), 70, 8, WIDTH + 16, 4, 4, MATS["steel"])
    add_wheel(col, "left trailer wheel", x(-8), 72, 12, -6, MATS)
    add_wheel(col, "right trailer wheel", x(WIDTH + 8), 72, 12, 6, MATS)
    add_box(col, "left simple metal fender", x(-15), 60, 25, 11, 25, 2, MATS["corrugated"])
    add_box(col, "right simple metal fender", x(WIDTH + 4), 60, 25, 11, 25, 2, MATS["corrugated"])
    add_bar_xy(col, "left A-frame hitch rail", x(14), 0, 8, x(36), -36, 3, 2, MATS["steel"])
    add_bar_xy(col, "right A-frame hitch rail", x(WIDTH - 14), 0, 8, x(36), -36, 3, 2, MATS["steel"])
    add_box(col, "off-the-shelf hitch coupler", x(31), -43, 7, 10, 10, 5, MATS["steel"])
    add_box(col, "simple jack stand", x(34), -24, -6, 4, 4, 18, MATS["steel_light"])


def add_common_path(col, ox, x0=29, width=16):
    add_box(col, "central movement path - keep clear", ox + x0, 18, 14.2, width, 111, 0.5, MATS["path"])


def add_kitchen_marks(col, ox, x, y, z):
    add_box(col, "two-burner hotplate", ox + x, y, z, 8, 6, 0.4, MATS["steel"])
    add_cylinder(col, "round sink basin", (ox + x + 13, y + 8, z + 0.65), "Z", 4, 0.5, MATS["steel_light"], 24)


def build_wright(root, index):
    ox = index * PITCH
    design = collection("01 Wright / Usonian Trailer - warm low horizontal study", root)
    add_trailer_base(design, ox, "Wright / Usonian Trailer")

    shell = collection("Exterior shell - low horizontal plywood box with cutaway side", design)
    add_box(shell, "left warm plywood wall", ox, 0, 14, 2, LENGTH, 58, MATS["warm_plywood"])
    add_box(shell, "front compressed wall", ox, 0, 14, WIDTH, 2, 58, MATS["warm_plywood"])
    add_box(shell, "rear wall with door panel", ox, LENGTH - 2, 14, WIDTH, 2, 58, MATS["warm_plywood"])
    add_box(shell, "cutaway right low sill", ox + WIDTH - 2, 22, 14, 2, 112, 18, MATS["warm_plywood"])
    add_box(shell, "dark horizontal base trim", ox - 0.5, -0.5, 25, WIDTH + 1, LENGTH + 1, 2, MATS["dark_trim"])
    add_box(shell, "dark clerestory trim", ox - 0.5, -0.5, 58, WIDTH + 1, LENGTH + 1, 2, MATS["dark_trim"])
    add_box(shell, "rear flush plywood door", ox + 43, LENGTH - 2.3, 16, 25, 0.8, 55, MATS["plywood"])
    add_box(shell, "long narrow clerestory window band", ox + 2.2, 14, 56, 0.8, 92, 11, MATS["glass"])
    add_box(shell, "small rear window", ox + 12, LENGTH - 2.5, 42, 24, 0.8, 18, MATS["glass"])

    roof = collection("Roof form - thin overhanging low-slope Usonian roof", design)
    add_box(roof, "single flat roof slab with overhang", ox - 8, -7, 74, WIDTH + 16, LENGTH + 14, 4, MATS["dark_roof"])
    add_box(roof, "warm underside soffit", ox - 6, -5, 72.5, WIDTH + 12, LENGTH + 10, 1.5, MATS["warm_plywood"])
    for y in [-5, 23, 51, 79, 107, 135]:
        add_box(roof, f"exposed thin roof batten {y}", ox - 8, y, 78.2, WIDTH + 16, 1.2, 1.2, MATS["dark_trim"])

    interior = collection("Interior program - integrated built-ins and compressed dignity", design)
    add_common_path(interior, ox)
    add_box(interior, "sleeping platform built into rear", ox + 24, 101, 14, 46, 39, 14, MATS["warm_plywood"])
    add_box(interior, "thin sleeping pad", ox + 26, 103, 29, 42, 35, 3, MATS["canvas"])
    add_box(interior, "continuous storage bench under window", ox + 3, 18, 14, 19, 82, 18, MATS["warm_plywood"])
    add_box(interior, "kitchenette counter in same built-in line", ox + 3, 24, 32, 19, 42, 3, MATS["table"])
    add_box(interior, "utility zone hidden in front built-in", ox + 3, 4, 14, 24, 16, 31, MATS["utility"])
    add_box(interior, "fold-down eating/work surface lowered", ox + 23, 68, 37, 24, 21, 1.5, MATS["table"])
    add_box(interior, "low storage drawers below bed", ox + 25, 104, 14.4, 42, 9, 6, MATS["dark_trim"])
    add_kitchen_marks(interior, ox, 8, 34, 35.2)
    add_callouts(interior, {
        "sleeping area": (ox + 48, 121, 38),
        "kitchenette": (ox + 8, 48, 43),
        "fold-down table": (ox + 48, 76, 43),
        "utility zone": (ox + 10, 9, 51),
        "storage edge": (ox + 7, 91, 40),
        "central movement path": (ox + 36, 55, 18),
    })
    add_wrapped_label(design, "Wright / Usonian Trailer", "Wright / Usonian Trailer", [
        "Design: low, horizontal, warm built-ins; poverty made architectural.",
        "Cost-saving: one continuous plywood storage / kitchen / bed edge.",
        "Materials: plywood box, dark trim, simple steel trailer, stock windows.",
        "Spatial idea: compressed central path beside a thick useful wall.",
        "Sacrifice: less headroom and less loose furniture.",
    ], ox - 7, LENGTH + 15, 69)


def build_ban(root, index):
    ox = index * PITCH
    design = collection("02 Shigeru Ban Shelter Trailer - lightweight modular emergency study", root)
    add_trailer_base(design, ox, "Shigeru Ban Shelter Trailer")

    shell = collection("Exterior shell - modular replaceable translucent bays", design)
    for y in [0, 24, 48, 72, 96, 120, 144]:
        add_box(shell, f"left replaceable bay post {y}", ox, y, 14, 2, 2, 70, MATS["pale_wood"])
        add_box(shell, f"right replaceable bay post {y}", ox + WIDTH - 2, y, 14, 2, 2, 70, MATS["pale_wood"])
        add_box(shell, f"cross tie bay {y}", ox, y, 82, WIDTH, 2, 2, MATS["pale_wood"])
    add_box(shell, "left translucent wall panels", ox + 1.8, 4, 16, 0.8, 136, 60, MATS["poly"])
    add_box(shell, "front translucent removable door panel", ox + 18, 0.7, 16, 36, 0.8, 58, MATS["poly"])
    add_box(shell, "rear translucent wall panel", ox + 4, LENGTH - 1.5, 16, 64, 0.8, 58, MATS["poly"])
    add_box(shell, "canvas roll-up entry curtain", ox + 23, 0.2, 17, 26, 0.6, 54, MATS["canvas"])
    add_box(shell, "cutaway side removable sill rail", ox + WIDTH - 2, 0, 16, 2, LENGTH, 12, MATS["pale_wood"])

    roof = collection("Roof form - translucent gable panels on exposed light frame", design)
    add_roof_panel(roof, "left polycarbonate gable roof panel", [(ox - 3, -3, 77), (ox + 36, -3, 91), (ox + 36, LENGTH + 3, 91), (ox - 3, LENGTH + 3, 77)], MATS["poly"])
    add_roof_panel(roof, "right polycarbonate gable roof panel", [(ox + 36, -3, 91), (ox + 75, -3, 77), (ox + 75, LENGTH + 3, 77), (ox + 36, LENGTH + 3, 91)], MATS["poly"])
    for y in [0, 24, 48, 72, 96, 120, 144]:
        add_bar_xy(roof, f"light roof rib y={y}", ox - 2, y, 77, ox + 36, y, 2, 2, MATS["pale_wood"])
        add_bar_xy(roof, f"light roof rib y={y} opposite", ox + 36, y, 89, ox + 74, y, 2, 2, MATS["pale_wood"])
    add_box(roof, "simple ridge cap", ox + 34.5, -3, 90.5, 3, LENGTH + 6, 2, MATS["pale_wood"])

    interior = collection("Interior program - relief-shelter modules on a clear path", design)
    add_common_path(interior, ox)
    add_box(interior, "replaceable sleeping cot module", ox + 22, 103, 15, 45, 34, 13, MATS["canvas"])
    add_box(interior, "crate kitchenette module", ox + 3, 28, 14, 21, 34, 30, MATS["pale_wood"])
    add_box(interior, "stacked storage crate 1", ox + 4, 70, 14, 18, 18, 13, MATS["recycled"])
    add_box(interior, "stacked storage crate 2", ox + 4, 70, 28, 18, 18, 13, MATS["recycled"])
    add_box(interior, "water and battery crate utility zone", ox + 4, 6, 14, 24, 18, 22, MATS["utility"])
    add_box(interior, "hinged emergency work shelf", ox + 27, 63, 37, 28, 17, 1.3, MATS["table"])
    add_box(interior, "canvas privacy partition at cot", ox + 20, 100, 28, 1, 38, 38, MATS["canvas"])
    add_kitchen_marks(interior, ox, 8, 36, 45.2)
    add_callouts(interior, {
        "sleeping cot": (ox + 44, 119, 35),
        "kit module": (ox + 11, 45, 52),
        "replaceable crates": (ox + 10, 80, 48),
        "fold-down shelf": (ox + 47, 70, 44),
        "utility crate": (ox + 12, 13, 43),
        "central path": (ox + 38, 52, 19),
    })
    add_wrapped_label(design, "Shigeru Ban Shelter Trailer", "Shigeru Ban Shelter Trailer", [
        "Design: emergency shelter logic; light, modular, replaceable, visibly framed.",
        "Cost-saving: repeated 24-inch bays and removable panels.",
        "Materials: 2x light frame, polycarbonate, canvas, crate modules.",
        "Spatial idea: clear service path with replaceable room-size components.",
        "Sacrifice: limited acoustic and thermal privacy.",
    ], ox - 7, LENGTH + 15, 69)


def build_lacaton(root, index):
    ox = index * PITCH
    design = collection("03 Lacaton & Vassal Economy Trailer - maximum space minimum money study", root)
    add_trailer_base(design, ox, "Lacaton & Vassal Economy Trailer")
    shell = collection("Exterior shell - generous cheap polycarbonate volume", design)
    add_box(shell, "left translucent polycarbonate wall", ox, 0, 14, 1.5, LENGTH, 68, MATS["poly"])
    add_box(shell, "front polycarbonate wall", ox, 0, 14, WIDTH, 1.5, 62, MATS["poly"])
    add_box(shell, "rear polycarbonate wall", ox, LENGTH - 1.5, 14, WIDTH, 1.5, 68, MATS["poly"])
    add_box(shell, "cutaway open long-side guard rail", ox + WIDTH - 2, 18, 14, 2, 108, 13, MATS["steel_light"])
    for y in [0, 24, 48, 72, 96, 120, 144]:
        add_box(shell, f"cheap galvanized portal frame {y}", ox, y, 14, 2, 2, 73, MATS["steel_light"])
        add_box(shell, f"cheap galvanized portal frame open side {y}", ox + WIDTH - 2, y, 14, 2, 2, 61, MATS["steel_light"])
    add_box(shell, "wide sliding polycarbonate door panel", ox + 18, -0.5, 15, 38, 1, 56, MATS["poly"])
    add_box(shell, "large stock ventilation window", ox + 2, 48, 48, 0.8, 36, 20, MATS["glass"])
    roof = collection("Roof form - cheap single-slope translucent roof", design)
    add_roof_panel(roof, "one large shed polycarbonate roof", [(ox - 2, -4, 91), (ox + 76, -4, 78), (ox + 76, LENGTH + 4, 78), (ox - 2, LENGTH + 4, 91)], MATS["poly"])
    for y in [0, 24, 48, 72, 96, 120, 144]:
        add_bar_xy(roof, f"straight shed roof purlin {y}", ox, y, 88, ox + WIDTH, y, 2, 2, MATS["steel_light"])
    interior = collection("Interior program - least objects for most usable volume", design)
    add_common_path(interior, ox, 26, 18)
    add_box(interior, "daybed platform also storage", ox + 22, 103, 14, 48, 36, 15, MATS["plywood"])
    add_box(interior, "open shelf wall from unfinished plywood", ox + 3, 68, 14, 18, 66, 48, MATS["plywood"])
    add_box(interior, "minimal kitchenette block", ox + 3, 26, 14, 18, 34, 31, MATS["whitewash"])
    add_box(interior, "exposed utility corner", ox + 3, 4, 14, 22, 17, 30, MATS["utility"])
    add_box(interior, "long fold-down table for work and eating", ox + 24, 42, 37, 38, 19, 1.2, MATS["table"])
    add_box(interior, "clear flexible empty floor zone", ox + 26, 64, 14.3, 31, 36, 0.4, MATS["path"])
    add_kitchen_marks(interior, ox, 8, 34, 46.2)
    add_callouts(interior, {
        "daybed + storage": (ox + 48, 122, 36),
        "unfinished shelf wall": (ox + 9, 106, 66),
        "minimal kitchenette": (ox + 9, 42, 52),
        "long fold-down table": (ox + 51, 48, 44),
        "utility corner": (ox + 11, 12, 48),
        "extra clear floor": (ox + 45, 81, 21),
    })
    add_wrapped_label(design, "Lacaton & Vassal Economy Trailer", "Lacaton & Vassal Economy Trailer", [
        "Design: maximum usable space from the cheapest generous envelope.",
        "Cost-saving: spend on one big translucent shell, not finish layers.",
        "Materials: polycarbonate sheets, straight galvanized frame, raw plywood.",
        "Spatial idea: oversized light volume makes 6x12 feel less punishing.",
        "Sacrifice: refinement, insulation, and cabinetry detailing.",
    ], ox - 7, LENGTH + 15, 69)


def build_alexander(root, index):
    ox = index * PITCH
    design = collection("04 Alexander Pattern Cabin Trailer - human pattern-language study", root)
    add_trailer_base(design, ox, "Alexander Pattern Cabin Trailer")
    shell = collection("Exterior shell - small cabin with entry transition and nook", design)
    add_box(shell, "left thick storage wall exterior", ox, 0, 14, 2, LENGTH, 64, MATS["warm_plywood"])
    add_box(shell, "front wall with centered entry", ox, 0, 14, WIDTH, 2, 64, MATS["warm_plywood"])
    add_box(shell, "rear sleeping nook wall", ox, LENGTH - 2, 14, WIDTH, 2, 64, MATS["warm_plywood"])
    add_box(shell, "cutaway right low wall", ox + WIDTH - 2, 28, 14, 2, 98, 22, MATS["warm_plywood"])
    add_box(shell, "entry threshold step", ox + 20, -9, 10, 32, 9, 4, MATS["framing"])
    add_box(shell, "centered simple front door", ox + 23, 0.2, 15, 26, 0.8, 58, MATS["plywood"])
    add_box(shell, "small window place side window", ox + 1.8, 52, 42, 0.8, 27, 19, MATS["glass"])
    add_box(shell, "sleeping nook rear window", ox + 24, LENGTH - 2.5, 43, 24, 0.8, 18, MATS["glass"])
    add_box(shell, "small entry light", ox + 52, 0.3, 44, 13, 0.8, 16, MATS["glass"])
    roof = collection("Roof form - simple pitched cabin roof", design)
    add_roof_panel(roof, "left warm metal roof plane", [(ox - 5, -5, 78), (ox + 36, -5, 96), (ox + 36, LENGTH + 5, 96), (ox - 5, LENGTH + 5, 78)], MATS["corrugated"])
    add_roof_panel(roof, "right warm metal roof plane", [(ox + 36, -5, 96), (ox + 77, -5, 78), (ox + 77, LENGTH + 5, 78), (ox + 36, LENGTH + 5, 96)], MATS["corrugated"])
    add_box(roof, "ridge cap", ox + 34, -5, 95, 4, LENGTH + 10, 3, MATS["steel_light"])
    add_box(roof, "front porch overhang", ox + 18, -15, 77, 36, 12, 3, MATS["corrugated"])
    interior = collection("Interior program - entrance transition, thick storage edge, warm center", design)
    add_common_path(interior, ox, 29, 14)
    add_box(interior, "sleeping nook raised platform", ox + 22, 104, 14, 48, 36, 17, MATS["warm_plywood"])
    add_box(interior, "canvas curtain defining sleeping nook", ox + 21, 101, 28, 1.2, 39, 39, MATS["canvas"])
    add_box(interior, "thick storage edge lower cabinets", ox + 3, 22, 14, 17, 94, 24, MATS["warm_plywood"])
    add_box(interior, "upper storage cubbies in thick edge", ox + 3, 62, 47, 17, 50, 16, MATS["warm_plywood"])
    add_box(interior, "kitchenette in storage edge", ox + 3, 24, 38, 17, 30, 3, MATS["table"])
    add_box(interior, "built-in bench at window place", ox + 45, 52, 14, 25, 24, 16, MATS["warm_plywood"])
    add_box(interior, "small warm center floor", ox + 27, 52, 14.4, 25, 29, 0.5, MATS["warm_center"])
    add_box(interior, "fold-down shared table at warm center", ox + 21, 61, 37, 24, 17, 1.4, MATS["table"])
    add_box(interior, "utility cabinet below entry shelf", ox + 4, 5, 14, 21, 16, 28, MATS["utility"])
    add_kitchen_marks(interior, ox, 7, 31, 42.2)
    add_callouts(interior, {
        "entrance transition": (ox + 36, 4, 36),
        "sleeping nook": (ox + 46, 122, 42),
        "small window place": (ox + 58, 65, 38),
        "thick storage edge": (ox + 9, 91, 70),
        "fold-down table": (ox + 40, 69, 44),
        "warm center": (ox + 40, 55, 22),
    })
    add_wrapped_label(design, "Alexander Pattern-Language Cabin", "Alexander Pattern-Language Cabin", [
        "Design: entry pause, sleeping nook, window place, warm center.",
        "Cost-saving: one thick plywood edge stores, cooks, seats, and divides.",
        "Materials: plywood cabin shell, metal roof, canvas curtain, stock windows.",
        "Spatial idea: small rooms within one room, made by edges and thresholds.",
        "Sacrifice: more carpentry cuts than the plain contractor version.",
    ], ox - 7, LENGTH + 15, 69)


def build_contractor(root, index):
    ox = index * PITCH
    design = collection("05 Contractor Reality Trailer - cheapest plausible build study", root)
    add_trailer_base(design, ox, "Contractor Reality Trailer")
    shell = collection("Exterior shell - off-the-shelf box, plywood, studs, metal roof", design)
    add_box(shell, "left plywood sheathing wall", ox, 0, 14, 2, LENGTH, 62, MATS["osb"])
    add_box(shell, "front plywood wall", ox, 0, 14, WIDTH, 2, 62, MATS["osb"])
    add_box(shell, "rear plywood wall with cheap door", ox, LENGTH - 2, 14, WIDTH, 2, 62, MATS["osb"])
    add_box(shell, "cutaway right framed half wall", ox + WIDTH - 2, 18, 14, 2, 112, 28, MATS["osb"])
    for y in [0, 16, 32, 48, 64, 80, 96, 112, 128, 144]:
        add_box(shell, f"visible 2x stud left {y}", ox + 2, y, 14, 2, 1.5, 62, MATS["framing"])
        add_box(shell, f"visible 2x stud cutaway {y}", ox + WIDTH - 4, y, 14, 2, 1.5, 48, MATS["framing"])
    add_box(shell, "cheap stock rear door", ox + 42, LENGTH - 2.4, 15, 25, 0.8, 58, MATS["whitewash"])
    add_box(shell, "stock front window", ox + 12, 0.3, 40, 22, 0.8, 20, MATS["glass"])
    add_box(shell, "stock side window", ox + 1.8, 50, 41, 0.8, 25, 18, MATS["glass"])
    roof = collection("Roof form - one-slope corrugated metal with minimal overhang", design)
    add_roof_panel(roof, "single corrugated metal shed roof", [(ox - 3, -3, 82), (ox + 75, -3, 76), (ox + 75, LENGTH + 3, 76), (ox - 3, LENGTH + 3, 82)], MATS["corrugated"])
    for x in range(-2, 75, 8):
        rib_z = 82 - ((x + 3) / 78.0 * 6)
        add_bar_xy(roof, f"corrugation rib x={x}", ox + x, -3, rib_z, ox + x + 3, LENGTH + 3, 1.1, 0.8, MATS["steel_light"])
    interior = collection("Interior program - plywood platforms, bins, simple utility cabinet", design)
    add_common_path(interior, ox)
    add_box(interior, "plywood bed platform", ox + 24, 100, 14, 45, 39, 16, MATS["plywood"])
    add_box(interior, "plastic storage bin 1 under bed", ox + 26, 105, 15, 18, 13, 10, MATS["green"])
    add_box(interior, "plastic storage bin 2 under bed", ox + 48, 105, 15, 18, 13, 10, MATS["green"])
    add_box(interior, "simple kitchenette cabinet", ox + 3, 27, 14, 20, 34, 32, MATS["plywood"])
    add_box(interior, "open wall shelf", ox + 3, 70, 48, 19, 44, 5, MATS["plywood"])
    add_box(interior, "utility cabinet with water jug and battery", ox + 4, 5, 14, 22, 17, 31, MATS["utility"])
    add_box(interior, "plain hinged plywood work/eating flap", ox + 25, 63, 36, 28, 18, 1.2, MATS["table"])
    add_box(interior, "replaceable repair panel leaning inside", ox + 54, 28, 14, 2, 34, 38, MATS["osb"])
    add_kitchen_marks(interior, ox, 8, 36, 47.2)
    add_callouts(interior, {
        "plywood bed": (ox + 47, 121, 38),
        "storage bins": (ox + 47, 108, 28),
        "simple kitchen": (ox + 10, 44, 53),
        "fold-down flap": (ox + 45, 71, 43),
        "utility cabinet": (ox + 11, 13, 49),
        "central path": (ox + 37, 52, 19),
    })
    add_wrapped_label(design, "Non-Design / Contractor Reality", "Non-Design / Contractor Reality", [
        "Design: no architect ego; cheapest plausible shelter from store materials.",
        "Cost-saving: square cuts, common studs, plywood sheets, one metal roof.",
        "Materials: off-the-shelf trailer, 2x studs, plywood/OSB, metal, bins.",
        "Spatial idea: everything is obvious to build, replace, and repair.",
        "Sacrifice: beauty, finesse, and spatial generosity.",
    ], ox - 7, LENGTH + 15, 69)


def add_material_logic_board(root):
    col = collection("Cost / Material Logic Board - comparison labels", root)
    y = -47
    add_box(col, "long cost logic board backing", -10, y, 16, (PITCH * 4) + WIDTH + 20, 2, 50, MATS["label"])
    note = (
        "Cost / Material Logic\n"
        "Identical constraint: every study sits on the same 6 ft x 12 ft trailer deck, wheels, axle, frame, and hitch.\n"
        "Cheap materials: plywood, 2x framing, corrugated metal, polycarbonate, recycled panels, simple steel, canvas, cabinets.\n"
        "Decision question: which sacrifice is acceptable: low headroom, thin shelter, rough finish, extra carpentry, or plain contractor ugliness?"
    )
    add_text(col, "cost material logic comparison note", note, 0, y - 0.4, 62, size=2.0)
    scenes = (
        "Scene tab guide in SketchUp after import:\n"
        "1 Five Design Comparison  2 Wright / Usonian Trailer  3 Shigeru Ban Shelter Trailer\n"
        "4 Lacaton & Vassal Economy Trailer  5 Alexander Pattern Cabin Trailer  6 Contractor Reality Trailer\n"
        "7 Interior Cutaway Comparison  8 Cost / Material Logic"
    )
    add_text(col, "requested scene tab names as model note", scenes, 0, y - 0.4, 37, size=1.55)


def add_cameras(root):
    cam_col = collection("Scene Tab Camera Guides - create matching SketchUp scenes from these views", root)
    scenes = [
        ("Five Design Comparison", (330, -330, 260), (330, 75, 38)),
        ("Wright / Usonian Trailer", (35, -135, 110), (35, 70, 42)),
        ("Shigeru Ban Shelter Trailer", (PITCH + 35, -135, 118), (PITCH + 35, 70, 48)),
        ("Lacaton & Vassal Economy Trailer", (PITCH * 2 + 35, -135, 125), (PITCH * 2 + 35, 70, 48)),
        ("Alexander Pattern Cabin Trailer", (PITCH * 3 + 35, -135, 124), (PITCH * 3 + 35, 70, 48)),
        ("Contractor Reality Trailer", (PITCH * 4 + 35, -135, 115), (PITCH * 4 + 35, 70, 45)),
        ("Interior Cutaway Comparison", (330, -185, 115), (330, 85, 32)),
        ("Cost / Material Logic", (330, -145, 105), (330, -47, 48)),
    ]
    for name, eye, target in scenes:
        bpy.ops.object.camera_add(location=v3(*eye))
        cam = bpy.context.object
        cam.name = f"Scene camera - {name}"
        direction = mathutils.Vector(v3(*target)) - cam.location
        cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 24
        link(cam, cam_col)


def convert_text_to_mesh():
    if WEBSAFE:
        return
    for obj in list(TEXT_OBJECTS):
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.convert(target="MESH")
        bpy.context.object.name = obj.name
    bpy.ops.object.select_all(action="DESELECT")


def main():
    global MATS, mathutils
    import mathutils as _mathutils
    mathutils = _mathutils

    clear_scene()
    bpy.context.scene.unit_settings.system = "METRIC"
    bpy.context.scene.unit_settings.scale_length = 1.0
    MATS = build_materials()
    root = collection("6x12 Trailer Tiny Home - Five Side-by-Side Design Studies")
    add_comparison_ground(root)
    build_wright(root, 0)
    build_ban(root, 1)
    build_lacaton(root, 2)
    build_alexander(root, 3)
    build_contractor(root, 4)
    add_material_logic_board(root)
    add_cameras(root)
    convert_text_to_mesh()
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    bpy.ops.wm.collada_export(filepath=DAE_PATH, selected=False)
    print(f"Saved {BLEND_PATH}")
    print(f"Saved {DAE_PATH}")


if __name__ == "__main__":
    main()
