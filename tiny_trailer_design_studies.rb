# frozen_string_literal: true

# Run this file from inside SketchUp:
# Window > Ruby Console, then:
# load "/Users/gaia/Documents/Codex/2026-05-24/design-inside-sketchup-a-cost-effective/tiny_trailer_design_studies.rb"
#
# The script generates and saves:
# 6x12_trailer_tiny_home_five_design_studies.skp

unless defined?(Sketchup)
  raise "Run this file from inside SketchUp using Ruby Console > load path/to/tiny_trailer_design_studies.rb"
end

module CodexTrailerTinyHomeStudies
  extend self

  WIDTH = 72.0
  LENGTH = 144.0
  GAP = 78.0
  PITCH = WIDTH + GAP
  OUTPUT_SKP = File.expand_path("6x12_trailer_tiny_home_five_design_studies.skp", __dir__)

  def run
    model = Sketchup.active_model
    model.start_operation("Generate five 6x12 trailer tiny home studies", true)
    model.entities.clear!

    @model = model
    @m = build_materials(model)

    add_comparison_ground(model.entities)

    build_wright(model.entities, 0)
    build_ban(model.entities, 1)
    build_lacaton_vassal(model.entities, 2)
    build_alexander(model.entities, 3)
    build_contractor(model.entities, 4)
    add_material_logic_board(model.entities)
    add_scenes(model)

    model.commit_operation
    model.save(OUTPUT_SKP)
    UI.messagebox("Generated and saved:\n#{OUTPUT_SKP}")
  rescue StandardError => e
    model.abort_operation if model && model.respond_to?(:abort_operation)
    raise e
  end

  def build_materials(model)
    {
      steel: material(model, "simple black-painted steel", [35, 38, 40]),
      steel_light: material(model, "galvanized trailer steel", [126, 132, 136]),
      tire: material(model, "rubber tires", [18, 18, 18]),
      plywood: material(model, "cheap plywood / sheathing", [186, 139, 79]),
      warm_plywood: material(model, "warm stained plywood", [156, 96, 45]),
      framing: material(model, "standard 2x framing lumber", [214, 170, 106]),
      pale_wood: material(model, "pale replaceable wood frame", [222, 191, 132]),
      osb: material(model, "OSB / rough utility panels", [172, 132, 76]),
      corrugated: material(model, "corrugated galvanized metal", [160, 166, 166]),
      dark_roof: material(model, "dark low-slope roof membrane", [58, 55, 50]),
      poly: material(model, "translucent polycarbonate panels", [185, 225, 232], 0.42),
      recycled: material(model, "recycled mixed panels", [132, 142, 118]),
      canvas: material(model, "canvas / curtain partition", [218, 207, 178], 0.72),
      glass: material(model, "off-the-shelf window glass", [126, 178, 210], 0.38),
      path: material(model, "clear central movement path", [83, 142, 164], 0.45),
      table: material(model, "fold-down plywood work surface", [204, 156, 88]),
      utility: material(model, "utility cabinet / water / battery", [80, 113, 122]),
      label: material(model, "matte white label boards", [238, 236, 228]),
      redline: material(model, "cutaway red line", [196, 58, 48]),
      floor: material(model, "unfinished plywood floor", [198, 154, 91]),
      shadow: material(model, "soft gray comparison base", [225, 225, 218], 0.45),
      green: material(model, "low-cost storage bins", [79, 125, 93]),
      warm_center: material(model, "warm center floor mat", [171, 92, 60]),
      whitewash: material(model, "whitewashed cheap panels", [226, 220, 204]),
      dark_trim: material(model, "dark horizontal trim", [63, 52, 40])
    }
  end

  def material(model, name, rgb, alpha = 1.0)
    mat = model.materials[name] || model.materials.add(name)
    mat.color = Sketchup::Color.new(rgb[0], rgb[1], rgb[2])
    mat.alpha = alpha
    mat
  end

  def add_comparison_ground(entities)
    g = entities.add_group
    g.name = "Comparison Board - five side-by-side 6x12 trailer footprints"
    add_box(g.entities, "continuous study-board base", -18, -52, -1, (PITCH * 4) + WIDTH + 36, 256, 1, @m[:shadow])
    5.times do |i|
      x = i * PITCH
      add_outline(g.entities, "6 ft x 12 ft footprint outline #{i + 1}", x, 0, 0.25, WIDTH, LENGTH, @m[:steel])
      add_text(g.entities, "footprint label #{i + 1}", "6 ft x 12 ft trailer footprint", [x + 10, -13, 1])
    end
  end

  def new_design_group(parent, index, name)
    group = parent.add_group
    group.name = name
    group.transform!(Geom::Transformation.translation([index * PITCH, 0, 0]))
    group
  end

  def add_trailer_base(parent, concept_name)
    base = parent.add_group
    base.name = "#{concept_name} - identical trailer frame, wheels, axle, hitch"

    add_box(base.entities, "6x12 plywood trailer deck", 0, 0, 12, WIDTH, LENGTH, 2, @m[:floor])
    add_box(base.entities, "left steel frame rail", 5, 0, 6, 4, LENGTH, 4, @m[:steel])
    add_box(base.entities, "right steel frame rail", WIDTH - 9, 0, 6, 4, LENGTH, 4, @m[:steel])
    [0, 24, 48, 72, 96, 120, 141].each do |y|
      add_box(base.entities, "steel crossmember y=#{y}", 5, y, 7, WIDTH - 10, 3, 3, @m[:steel_light])
    end

    add_box(base.entities, "single axle bar", -8, 70, 8, WIDTH + 16, 4, 4, @m[:steel])
    add_wheel(base.entities, "left trailer wheel", -8, 72, 12, -6)
    add_wheel(base.entities, "right trailer wheel", WIDTH + 8, 72, 12, 6)
    add_box(base.entities, "left simple metal fender", -15, 60, 25, 11, 25, 2, @m[:corrugated])
    add_box(base.entities, "right simple metal fender", WIDTH + 4, 60, 25, 11, 25, 2, @m[:corrugated])

    add_bar_xy(base.entities, "left A-frame hitch rail", 14, 0, 8, 36, -36, 3, 2, @m[:steel])
    add_bar_xy(base.entities, "right A-frame hitch rail", WIDTH - 14, 0, 8, 36, -36, 3, 2, @m[:steel])
    add_box(base.entities, "off-the-shelf hitch coupler", 31, -43, 7, 10, 10, 5, @m[:steel])
    add_box(base.entities, "simple jack stand", 34, -24, -6, 4, 4, 18, @m[:steel_light])
    base
  end

  def add_wheel(parent, name, x_face, y, z, depth)
    wheel = parent.add_group
    wheel.name = name
    circle = wheel.entities.add_circle([x_face, y, z], [1, 0, 0], 12, 32)
    face = wheel.entities.add_face(circle)
    face.pushpull(depth)
    paint_group(wheel, @m[:tire])

    hub = parent.add_group
    hub.name = "#{name} galvanized hub"
    hub_circle = hub.entities.add_circle([x_face + (depth.positive? ? depth : 0), y, z], [1, 0, 0], 4.5, 20)
    hub_face = hub.entities.add_face(hub_circle)
    hub_face.pushpull(depth.positive? ? 1 : -1)
    paint_group(hub, @m[:steel_light])
  end

  def build_wright(parent, index)
    d = new_design_group(parent, index, "01 Wright / Usonian Trailer - warm low horizontal study")
    add_trailer_base(d.entities, "Wright / Usonian Trailer")

    shell = d.entities.add_group
    shell.name = "Exterior shell - low horizontal plywood box with cutaway side"
    add_box(shell.entities, "left warm plywood wall", 0, 0, 14, 2, LENGTH, 58, @m[:warm_plywood])
    add_box(shell.entities, "front compressed wall", 0, 0, 14, WIDTH, 2, 58, @m[:warm_plywood])
    add_box(shell.entities, "rear wall with door panel", 0, LENGTH - 2, 14, WIDTH, 2, 58, @m[:warm_plywood])
    add_box(shell.entities, "cutaway right low sill", WIDTH - 2, 22, 14, 2, 112, 18, @m[:warm_plywood])
    add_box(shell.entities, "dark horizontal base trim", -0.5, -0.5, 25, WIDTH + 1, LENGTH + 1, 2, @m[:dark_trim])
    add_box(shell.entities, "dark clerestory trim", -0.5, -0.5, 58, WIDTH + 1, LENGTH + 1, 2, @m[:dark_trim])
    add_box(shell.entities, "rear flush plywood door", 43, LENGTH - 2.3, 16, 25, 0.8, 55, @m[:plywood])
    add_box(shell.entities, "long narrow clerestory window band", 2.2, 14, 56, 0.8, 92, 11, @m[:glass])
    add_box(shell.entities, "small rear window", 12, LENGTH - 2.5, 42, 24, 0.8, 18, @m[:glass])

    roof = d.entities.add_group
    roof.name = "Roof form - thin overhanging low-slope Usonian roof"
    add_box(roof.entities, "single flat roof slab with overhang", -8, -7, 74, WIDTH + 16, LENGTH + 14, 4, @m[:dark_roof])
    add_box(roof.entities, "warm underside soffit", -6, -5, 72.5, WIDTH + 12, LENGTH + 10, 1.5, @m[:warm_plywood])
    [-5, 23, 51, 79, 107, 135].each do |y|
      add_box(roof.entities, "exposed thin roof batten #{y}", -8, y, 78.2, WIDTH + 16, 1.2, 1.2, @m[:dark_trim])
    end

    interior = d.entities.add_group
    interior.name = "Interior program - integrated built-ins and compressed dignity"
    add_common_path(interior.entities)
    add_box(interior.entities, "sleeping platform built into rear", 24, 101, 14, 46, 39, 14, @m[:warm_plywood])
    add_box(interior.entities, "thin sleeping pad", 26, 103, 29, 42, 35, 3, @m[:canvas])
    add_box(interior.entities, "continuous storage bench under window", 3, 18, 14, 19, 82, 18, @m[:warm_plywood])
    add_box(interior.entities, "kitchenette counter in same built-in line", 3, 24, 32, 19, 42, 3, @m[:table])
    add_box(interior.entities, "utility zone hidden in front built-in", 3, 4, 14, 24, 16, 31, @m[:utility])
    add_box(interior.entities, "fold-down eating/work surface lowered", 23, 68, 37, 24, 21, 1.5, @m[:table])
    add_box(interior.entities, "low storage drawers below bed", 25, 104, 14.4, 42, 9, 6, @m[:dark_trim])
    add_kitchen_marks(interior.entities, 8, 34, 35.2)
    add_callouts(interior.entities, {
      "sleeping area" => [48, 121, 38],
      "kitchenette" => [8, 48, 43],
      "fold-down table" => [48, 76, 43],
      "utility zone" => [10, 9, 51],
      "storage edge" => [7, 91, 40],
      "central movement path" => [36, 55, 18]
    })

    add_design_label(d.entities, "Wright / Usonian Trailer",
                     "Design philosophy: low, horizontal, warm, integrated built-ins; poverty made architectural.\n" \
                     "Cost-saving move: one continuous plywood storage/kitchen/bed edge does many jobs.\n" \
                     "Main material system: plywood box, dark trim, simple steel trailer, off-the-shelf windows.\n" \
                     "Strongest spatial idea: compressed central path beside a thick useful wall.\n" \
                     "Sacrifice: less headroom and less loose furniture to keep the shell low and cheap.")
  end

  def build_ban(parent, index)
    d = new_design_group(parent, index, "02 Shigeru Ban Shelter Trailer - lightweight modular emergency study")
    add_trailer_base(d.entities, "Shigeru Ban Shelter Trailer")

    shell = d.entities.add_group
    shell.name = "Exterior shell - modular replaceable translucent bays"
    add_modular_frame(shell.entities, @m[:pale_wood], 84)
    add_box(shell.entities, "left translucent wall panels", 1.8, 4, 16, 0.8, 136, 60, @m[:poly])
    add_box(shell.entities, "front translucent removable door panel", 18, 0.7, 16, 36, 0.8, 58, @m[:poly])
    add_box(shell.entities, "rear translucent wall panel", 4, LENGTH - 1.5, 16, 64, 0.8, 58, @m[:poly])
    add_box(shell.entities, "canvas roll-up entry curtain", 23, 0.2, 17, 26, 0.6, 54, @m[:canvas])
    add_box(shell.entities, "cutaway side removable sill rail", WIDTH - 2, 0, 16, 2, LENGTH, 12, @m[:pale_wood])

    roof = d.entities.add_group
    roof.name = "Roof form - translucent gable panels on exposed light frame"
    add_roof_panel(roof.entities, "left polycarbonate gable roof panel", [[-3, -3, 77], [36, -3, 91], [36, LENGTH + 3, 91], [-3, LENGTH + 3, 77]], @m[:poly])
    add_roof_panel(roof.entities, "right polycarbonate gable roof panel", [[36, -3, 91], [75, -3, 77], [75, LENGTH + 3, 77], [36, LENGTH + 3, 91]], @m[:poly])
    [0, 24, 48, 72, 96, 120, 144].each do |y|
      add_bar_xy(roof.entities, "light roof rib y=#{y}", -2, y, 77, 36, y, 2.0, 2.0, @m[:pale_wood])
      add_bar_xy(roof.entities, "light roof rib y=#{y} opposite", 36, y, 89, 74, y, 2.0, 2.0, @m[:pale_wood])
    end
    add_box(roof.entities, "simple ridge cap", 34.5, -3, 90.5, 3, LENGTH + 6, 2, @m[:pale_wood])

    interior = d.entities.add_group
    interior.name = "Interior program - relief-shelter modules on a clear path"
    add_common_path(interior.entities)
    add_box(interior.entities, "replaceable sleeping cot module", 22, 103, 15, 45, 34, 13, @m[:canvas])
    add_box(interior.entities, "crate kitchenette module", 3, 28, 14, 21, 34, 30, @m[:pale_wood])
    add_box(interior.entities, "stacked storage crate 1", 4, 70, 14, 18, 18, 13, @m[:recycled])
    add_box(interior.entities, "stacked storage crate 2", 4, 70, 28, 18, 18, 13, @m[:recycled])
    add_box(interior.entities, "water and battery crate utility zone", 4, 6, 14, 24, 18, 22, @m[:utility])
    add_box(interior.entities, "hinged emergency work shelf", 27, 63, 37, 28, 17, 1.3, @m[:table])
    add_box(interior.entities, "canvas privacy partition at cot", 20, 100, 28, 1, 38, 38, @m[:canvas])
    add_kitchen_marks(interior.entities, 8, 36, 45.2)
    add_callouts(interior.entities, {
      "sleeping cot" => [44, 119, 35],
      "kit module" => [11, 45, 52],
      "replaceable storage crates" => [10, 80, 48],
      "fold-down shelf" => [47, 70, 44],
      "utility crate" => [12, 13, 43],
      "central movement path" => [38, 52, 19]
    })

    add_design_label(d.entities, "Shigeru Ban Shelter Trailer",
                     "Design philosophy: emergency shelter logic; light, modular, replaceable, visibly framed.\n" \
                     "Cost-saving move: repeated 24-inch bays and removable panels reduce custom work.\n" \
                     "Main material system: 2x light frame, translucent polycarbonate, canvas, crate modules.\n" \
                     "Strongest spatial idea: a clear service path with replaceable room-size components.\n" \
                     "Sacrifice: acoustic and thermal privacy are limited; durability depends on replaceable skins.")
  end

  def build_lacaton_vassal(parent, index)
    d = new_design_group(parent, index, "03 Lacaton & Vassal Economy Trailer - maximum space minimum money study")
    add_trailer_base(d.entities, "Lacaton & Vassal Economy Trailer")

    shell = d.entities.add_group
    shell.name = "Exterior shell - generous cheap polycarbonate volume"
    add_box(shell.entities, "left translucent polycarbonate wall", 0, 0, 14, 1.5, LENGTH, 68, @m[:poly])
    add_box(shell.entities, "front polycarbonate wall", 0, 0, 14, WIDTH, 1.5, 62, @m[:poly])
    add_box(shell.entities, "rear polycarbonate wall", 0, LENGTH - 1.5, 14, WIDTH, 1.5, 68, @m[:poly])
    add_box(shell.entities, "cutaway open long-side guard rail", WIDTH - 2, 18, 14, 2, 108, 13, @m[:steel_light])
    [0, 24, 48, 72, 96, 120, 144].each do |y|
      add_box(shell.entities, "cheap galvanized portal frame #{y}", 0, y, 14, 2, 2, 73, @m[:steel_light])
      add_box(shell.entities, "cheap galvanized portal frame open side #{y}", WIDTH - 2, y, 14, 2, 2, 61, @m[:steel_light])
    end
    add_box(shell.entities, "wide sliding polycarbonate door panel", 18, -0.5, 15, 38, 1, 56, @m[:poly])
    add_box(shell.entities, "large stock ventilation window", 2, 48, 48, 0.8, 36, 20, @m[:glass])

    roof = d.entities.add_group
    roof.name = "Roof form - cheap single-slope translucent roof"
    add_roof_panel(roof.entities, "one large shed polycarbonate roof", [[-2, -4, 91], [76, -4, 78], [76, LENGTH + 4, 78], [-2, LENGTH + 4, 91]], @m[:poly])
    [0, 24, 48, 72, 96, 120, 144].each do |y|
      add_bar_xy(roof.entities, "straight shed roof purlin #{y}", 0, y, 88, WIDTH, y, 2.0, 2.0, @m[:steel_light])
    end

    interior = d.entities.add_group
    interior.name = "Interior program - least objects for most usable volume"
    add_common_path(interior.entities, 26, 18)
    add_box(interior.entities, "daybed platform also storage", 22, 103, 14, 48, 36, 15, @m[:plywood])
    add_box(interior.entities, "open shelf wall from unfinished plywood", 3, 68, 14, 18, 66, 48, @m[:plywood])
    add_box(interior.entities, "minimal kitchenette block", 3, 26, 14, 18, 34, 31, @m[:whitewash])
    add_box(interior.entities, "exposed utility corner", 3, 4, 14, 22, 17, 30, @m[:utility])
    add_box(interior.entities, "long fold-down table for work and eating", 24, 42, 37, 38, 19, 1.2, @m[:table])
    add_box(interior.entities, "clear flexible empty floor zone", 26, 64, 14.3, 31, 36, 0.4, @m[:path])
    add_kitchen_marks(interior.entities, 8, 34, 46.2)
    add_callouts(interior.entities, {
      "daybed + storage" => [48, 122, 36],
      "unfinished shelf wall" => [9, 106, 66],
      "minimal kitchenette" => [9, 42, 52],
      "long fold-down table" => [51, 48, 44],
      "utility corner" => [11, 12, 48],
      "extra clear floor" => [45, 81, 21]
    })

    add_design_label(d.entities, "Lacaton & Vassal Economy Trailer",
                     "Design philosophy: maximum usable space from the cheapest generous envelope.\n" \
                     "Cost-saving move: spend on one big translucent shed shell, not finish layers.\n" \
                     "Main material system: polycarbonate sheets, straight galvanized frame, raw plywood furniture.\n" \
                     "Strongest spatial idea: oversized light volume makes a 6x12 trailer feel less punishing.\n" \
                     "Sacrifice: refinement, insulation, and cabinetry detailing are deliberately minimal.")
  end

  def build_alexander(parent, index)
    d = new_design_group(parent, index, "04 Alexander Pattern Cabin Trailer - human pattern-language study")
    add_trailer_base(d.entities, "Alexander Pattern Cabin Trailer")

    shell = d.entities.add_group
    shell.name = "Exterior shell - small cabin with entry transition and nook"
    add_box(shell.entities, "left thick storage wall exterior", 0, 0, 14, 2, LENGTH, 64, @m[:warm_plywood])
    add_box(shell.entities, "front wall with centered entry", 0, 0, 14, WIDTH, 2, 64, @m[:warm_plywood])
    add_box(shell.entities, "rear sleeping nook wall", 0, LENGTH - 2, 14, WIDTH, 2, 64, @m[:warm_plywood])
    add_box(shell.entities, "cutaway right low wall", WIDTH - 2, 28, 14, 2, 98, 22, @m[:warm_plywood])
    add_box(shell.entities, "entry threshold step", 20, -9, 10, 32, 9, 4, @m[:framing])
    add_box(shell.entities, "centered simple front door", 23, 0.2, 15, 26, 0.8, 58, @m[:plywood])
    add_box(shell.entities, "small window place side window", 1.8, 52, 42, 0.8, 27, 19, @m[:glass])
    add_box(shell.entities, "sleeping nook rear window", 24, LENGTH - 2.5, 43, 24, 0.8, 18, @m[:glass])
    add_box(shell.entities, "small entry light", 52, 0.3, 44, 13, 0.8, 16, @m[:glass])

    roof = d.entities.add_group
    roof.name = "Roof form - simple pitched cabin roof"
    add_roof_panel(roof.entities, "left warm metal roof plane", [[-5, -5, 78], [36, -5, 96], [36, LENGTH + 5, 96], [-5, LENGTH + 5, 78]], @m[:corrugated])
    add_roof_panel(roof.entities, "right warm metal roof plane", [[36, -5, 96], [77, -5, 78], [77, LENGTH + 5, 78], [36, LENGTH + 5, 96]], @m[:corrugated])
    add_box(roof.entities, "ridge cap", 34, -5, 95, 4, LENGTH + 10, 3, @m[:steel_light])
    add_box(roof.entities, "front porch overhang", 18, -15, 77, 36, 12, 3, @m[:corrugated])

    interior = d.entities.add_group
    interior.name = "Interior program - entrance transition, thick storage edge, warm center"
    add_common_path(interior.entities, 29, 14)
    add_box(interior.entities, "sleeping nook raised platform", 22, 104, 14, 48, 36, 17, @m[:warm_plywood])
    add_box(interior.entities, "canvas curtain defining sleeping nook", 21, 101, 28, 1.2, 39, 39, @m[:canvas])
    add_box(interior.entities, "thick storage edge lower cabinets", 3, 22, 14, 17, 94, 24, @m[:warm_plywood])
    add_box(interior.entities, "upper storage cubbies in thick edge", 3, 62, 47, 17, 50, 16, @m[:warm_plywood])
    add_box(interior.entities, "kitchenette in storage edge", 3, 24, 38, 17, 30, 3, @m[:table])
    add_box(interior.entities, "built-in bench at window place", 45, 52, 14, 25, 24, 16, @m[:warm_plywood])
    add_box(interior.entities, "small warm center floor", 27, 52, 14.4, 25, 29, 0.5, @m[:warm_center])
    add_box(interior.entities, "fold-down shared table at warm center", 21, 61, 37, 24, 17, 1.4, @m[:table])
    add_box(interior.entities, "utility cabinet below entry shelf", 4, 5, 14, 21, 16, 28, @m[:utility])
    add_kitchen_marks(interior.entities, 7, 31, 42.2)
    add_callouts(interior.entities, {
      "entrance transition" => [36, 4, 36],
      "sleeping nook" => [46, 122, 42],
      "small window place" => [58, 65, 38],
      "thick storage edge" => [9, 91, 70],
      "fold-down table" => [40, 69, 44],
      "warm center" => [40, 55, 22]
    })

    add_design_label(d.entities, "Alexander Pattern-Language Cabin",
                     "Design philosophy: human-scale patterns: entry pause, sleeping nook, window place, warm center.\n" \
                     "Cost-saving move: one thick plywood edge stores, cooks, seats, and divides space.\n" \
                     "Main material system: plywood cabin shell, simple metal roof, canvas curtain, standard windows.\n" \
                     "Strongest spatial idea: small rooms within one room, made by edges and thresholds.\n" \
                     "Sacrifice: more carpentry cuts than the plain contractor version.")
  end

  def build_contractor(parent, index)
    d = new_design_group(parent, index, "05 Contractor Reality Trailer - cheapest plausible build study")
    add_trailer_base(d.entities, "Contractor Reality Trailer")

    shell = d.entities.add_group
    shell.name = "Exterior shell - off-the-shelf box, plywood, studs, metal roof"
    add_box(shell.entities, "left plywood sheathing wall", 0, 0, 14, 2, LENGTH, 62, @m[:osb])
    add_box(shell.entities, "front plywood wall", 0, 0, 14, WIDTH, 2, 62, @m[:osb])
    add_box(shell.entities, "rear plywood wall with cheap door", 0, LENGTH - 2, 14, WIDTH, 2, 62, @m[:osb])
    add_box(shell.entities, "cutaway right framed half wall", WIDTH - 2, 18, 14, 2, 112, 28, @m[:osb])
    [0, 16, 32, 48, 64, 80, 96, 112, 128, 144].each do |y|
      add_box(shell.entities, "visible 2x stud left #{y}", 2, y, 14, 2, 1.5, 62, @m[:framing])
      add_box(shell.entities, "visible 2x stud cutaway #{y}", WIDTH - 4, y, 14, 2, 1.5, 48, @m[:framing])
    end
    add_box(shell.entities, "cheap stock rear door", 42, LENGTH - 2.4, 15, 25, 0.8, 58, @m[:whitewash])
    add_box(shell.entities, "stock front window", 12, 0.3, 40, 22, 0.8, 20, @m[:glass])
    add_box(shell.entities, "stock side window", 1.8, 50, 41, 0.8, 25, 18, @m[:glass])

    roof = d.entities.add_group
    roof.name = "Roof form - one-slope corrugated metal with minimal overhang"
    add_roof_panel(roof.entities, "single corrugated metal shed roof", [[-3, -3, 82], [75, -3, 76], [75, LENGTH + 3, 76], [-3, LENGTH + 3, 82]], @m[:corrugated])
    (-2).step(74, 8).each do |x|
      add_bar_xy(roof.entities, "corrugation rib x=#{x}", x, -3, 82, x + 3, LENGTH + 3, 76, 1.1, 0.8, @m[:steel_light])
    end

    interior = d.entities.add_group
    interior.name = "Interior program - plywood platforms, bins, simple utility cabinet"
    add_common_path(interior.entities)
    add_box(interior.entities, "plywood bed platform", 24, 100, 14, 45, 39, 16, @m[:plywood])
    add_box(interior.entities, "plastic storage bin 1 under bed", 26, 105, 15, 18, 13, 10, @m[:green])
    add_box(interior.entities, "plastic storage bin 2 under bed", 48, 105, 15, 18, 13, 10, @m[:green])
    add_box(interior.entities, "simple kitchenette cabinet", 3, 27, 14, 20, 34, 32, @m[:plywood])
    add_box(interior.entities, "open wall shelf", 3, 70, 48, 19, 44, 5, @m[:plywood])
    add_box(interior.entities, "utility cabinet with water jug and battery", 4, 5, 14, 22, 17, 31, @m[:utility])
    add_box(interior.entities, "plain hinged plywood work/eating flap", 25, 63, 36, 28, 18, 1.2, @m[:table])
    add_box(interior.entities, "replaceable repair panel leaning inside", 54, 28, 14, 2, 34, 38, @m[:osb])
    add_kitchen_marks(interior.entities, 8, 36, 47.2)
    add_callouts(interior.entities, {
      "plywood bed" => [47, 121, 38],
      "storage bins" => [47, 108, 28],
      "simple kitchen" => [10, 44, 53],
      "fold-down flap" => [45, 71, 43],
      "utility cabinet" => [11, 13, 49],
      "central path" => [37, 52, 19]
    })

    add_design_label(d.entities, "Non-Design / Contractor Reality",
                     "Design philosophy: no architect ego; cheapest plausible shelter build from store materials.\n" \
                     "Cost-saving move: square cuts, common studs, plywood sheets, one sloped metal roof.\n" \
                     "Main material system: off-the-shelf trailer, 2x studs, plywood/OSB, corrugated metal, bins.\n" \
                     "Strongest spatial idea: everything is obvious to build, replace, and repair.\n" \
                     "Sacrifice: beauty, finesse, and spatial generosity.")
  end

  def add_common_path(parent, x = 29, width = 16)
    add_box(parent, "central movement path - keep clear", x, 18, 14.2, width, 111, 0.5, @m[:path])
  end

  def add_kitchen_marks(parent, x, y, z)
    add_box(parent, "two-burner hotplate", x, y, z, 8, 6, 0.4, @m[:steel])
    add_cylinder(parent, "round sink basin", [x + 13, y + 8, z + 0.4], [0, 0, 1], 4, 0.5, @m[:steel_light], 24)
  end

  def add_callouts(parent, labels)
    labels.each do |text, point|
      add_text(parent, "callout - #{text}", text, point)
    end
  end

  def add_design_label(parent, title, body)
    board = parent.add_group
    board.name = "Text labels - #{title}"
    add_box(board.entities, "label board backing", -2, LENGTH + 15, 13, WIDTH + 4, 2, 58, @m[:label])
    add_text(board.entities, "label text - #{title}", "#{title}\n#{body}", [1, LENGTH + 18, 68])
    add_box(board.entities, "material swatch plywood", 2, LENGTH + 16, 18, 10, 2.5, 8, @m[:plywood])
    add_box(board.entities, "material swatch steel", 14, LENGTH + 16, 18, 10, 2.5, 8, @m[:steel])
    add_box(board.entities, "material swatch translucent / light", 26, LENGTH + 16, 18, 10, 2.5, 8, @m[:poly])
    add_box(board.entities, "material swatch utility / service", 38, LENGTH + 16, 18, 10, 2.5, 8, @m[:utility])
    add_text(board.entities, "swatch label", "material logic / cost logic", [2, LENGTH + 20, 31])
  end

  def add_material_logic_board(parent)
    g = parent.add_group
    g.name = "Cost / Material Logic Board - comparison labels"
    y = -47
    add_box(g.entities, "long cost logic board backing", -10, y, 16, (PITCH * 4) + WIDTH + 20, 2, 48, @m[:label])
    text = "Cost / Material Logic\n" \
           "Identical constraint: every study sits on the same 6 ft x 12 ft trailer deck, with the same wheels, axle, frame, and hitch.\n" \
           "Cheap materials used across studies: plywood, 2x framing, corrugated metal, polycarbonate, recycled panels, steel, canvas, simple cabinets.\n" \
           "Comparison question: which sacrifice is acceptable: low headroom, thin shelter, rough finish, extra carpentry, or plain contractor ugliness?"
    add_text(g.entities, "cost material logic comparison note", text, [0, y + 4, 62])
  end

  def add_modular_frame(parent, mat, height)
    [0, 24, 48, 72, 96, 120, 144].each do |y|
      add_box(parent, "left replaceable bay post #{y}", 0, y, 14, 2, 2, height - 14, mat)
      add_box(parent, "right replaceable bay post #{y}", WIDTH - 2, y, 14, 2, 2, height - 14, mat)
      add_box(parent, "cross tie bay #{y}", 0, y, height - 2, WIDTH, 2, 2, mat)
    end
    add_box(parent, "left bottom rail", 0, 0, 14, 2, LENGTH, 2, mat)
    add_box(parent, "right bottom rail", WIDTH - 2, 0, 14, 2, LENGTH, 2, mat)
    add_box(parent, "left top rail", 0, 0, height - 2, 2, LENGTH, 2, mat)
    add_box(parent, "right top rail", WIDTH - 2, 0, height - 2, 2, LENGTH, 2, mat)
  end

  def add_roof_panel(parent, name, points, mat)
    g = parent.add_group
    g.name = name
    face = g.entities.add_face(points)
    face.reverse! if face.normal.z < 0
    face.pushpull(1.2)
    paint_group(g, mat)
    g
  end

  def add_box(parent, name, x, y, z, w, d, h, mat)
    g = parent.add_group
    g.name = name
    face = g.entities.add_face([[x, y, z], [x + w, y, z], [x + w, y + d, z], [x, y + d, z]])
    face.reverse! if face.normal.z < 0
    face.pushpull(h)
    paint_group(g, mat)
    g
  end

  def add_cylinder(parent, name, center, normal, radius, depth, mat, segments = 24)
    g = parent.add_group
    g.name = name
    circle = g.entities.add_circle(center, normal, radius, segments)
    face = g.entities.add_face(circle)
    face.pushpull(depth)
    paint_group(g, mat)
    g
  end

  def add_bar_xy(parent, name, x1, y1, z, x2, y2, width, height, mat)
    dx = x2 - x1
    dy = y2 - y1
    length = Math.sqrt((dx * dx) + (dy * dy))
    return if length.zero?

    px = -dy / length * width / 2.0
    py = dx / length * width / 2.0
    g = parent.add_group
    g.name = name
    pts = [
      [x1 + px, y1 + py, z],
      [x2 + px, y2 + py, z],
      [x2 - px, y2 - py, z],
      [x1 - px, y1 - py, z]
    ]
    face = g.entities.add_face(pts)
    face.reverse! if face.normal.z < 0
    face.pushpull(height)
    paint_group(g, mat)
    g
  end

  def add_outline(parent, name, x, y, z, w, d, mat)
    g = parent.add_group
    g.name = name
    edges = []
    edges << g.entities.add_line([x, y, z], [x + w, y, z])
    edges << g.entities.add_line([x + w, y, z], [x + w, y + d, z])
    edges << g.entities.add_line([x + w, y + d, z], [x, y + d, z])
    edges << g.entities.add_line([x, y + d, z], [x, y, z])
    edges.each { |edge| edge.material = mat }
    g
  end

  def paint_group(group, mat)
    group.material = mat
    group.entities.grep(Sketchup::Face).each do |face|
      face.material = mat
      face.back_material = mat
    end
  end

  def add_text(parent, name, text, point)
    t = parent.add_text(text, point)
    t.name = name if t.respond_to?(:name=)
    t
  end

  def add_scenes(model)
    pages = model.pages
    pages.to_a.each { |p| pages.erase(p) } if pages.respond_to?(:erase)

    add_scene(model, "Five Design Comparison", [330, -330, 260], [330, 75, 38], [0, 0, 1])
    add_scene(model, "Wright / Usonian Trailer", [35, -135, 110], [35, 70, 42], [0, 0, 1])
    add_scene(model, "Shigeru Ban Shelter Trailer", [PITCH + 35, -135, 118], [PITCH + 35, 70, 48], [0, 0, 1])
    add_scene(model, "Lacaton & Vassal Economy Trailer", [(PITCH * 2) + 35, -135, 125], [(PITCH * 2) + 35, 70, 48], [0, 0, 1])
    add_scene(model, "Alexander Pattern Cabin Trailer", [(PITCH * 3) + 35, -135, 124], [(PITCH * 3) + 35, 70, 48], [0, 0, 1])
    add_scene(model, "Contractor Reality Trailer", [(PITCH * 4) + 35, -135, 115], [(PITCH * 4) + 35, 70, 45], [0, 0, 1])
    add_scene(model, "Interior Cutaway Comparison", [330, -185, 115], [330, 85, 32], [0, 0, 1])
    add_scene(model, "Cost / Material Logic", [330, -145, 105], [330, -47, 48], [0, 0, 1])
  end

  def add_scene(model, name, eye, target, up)
    view = model.active_view
    view.camera = Geom::Camera.new(eye, target, up)
    page = model.pages.add(name)
    page.use_camera = true if page.respond_to?(:use_camera=)
    page.update if page.respond_to?(:update)
    page
  end
end

CodexTrailerTinyHomeStudies.run
