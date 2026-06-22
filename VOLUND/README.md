# OpenSCAD Agent

A Claude Code-powered 3D modeling agent environment for creating 3D printable designs using OpenSCAD.

## Overview

This project provides an AI-assisted workflow for designing 3D models through natural language. Describe what you want to create, and the agent will iteratively generate OpenSCAD code, render previews, and refine the design based on your feedback.

## Features

- **Natural language 3D modeling**: Describe objects in plain English and get OpenSCAD code
- **Iterative refinement**: Each design iteration is versioned (e.g., `model_001.scad`, `model_002.scad`)
- **Visual feedback loop**: Automatic PNG rendering lets the agent see and self-correct its work
- **Geometry validation**: STL export checks for non-manifold geometry and other printability issues

## Requirements

- [Claude Code](https://claude.ai/claude-code) CLI
- [OpenSCAD](https://openscad.org/) installed locally

## Usage

Start Claude Code in this directory and use the `/openscad` skill:

```
/openscad make a phone stand
```

The agent will:
1. Create `phone_stand_001.scad` with an initial design
2. Render `phone_stand_001.png` to preview the result
3. Evaluate the design and iterate if needed
4. Continue refining until the design meets your requirements
5. Export to STL with geometry validation when ready

## Skills

| Skill | Description |
|-------|-------------|
| `/openscad` | Create versioned OpenSCAD files with automatic rendering and iteration |
| `/preview-scad` | Render any `.scad` file to PNG for visual inspection |
| `/export-stl` | Convert finalized `.scad` files to STL with geometry validation |

### Workflow

```
/openscad → /preview-scad → /export-stl
    ↑______________|              ↓
    (iterate until correct)   Geometry validation
                                  ↓
                            Ready for slicer
```

## File Structure

```
.
├── .claude/
│   ├── settings.local.json    # Claude Code permissions
│   └── skills/
│       ├── openscad/          # Main modeling skill
│       ├── preview-scad/      # PNG rendering skill
│       └── export-stl/        # STL export with validation
├── CLAUDE.md                  # Agent instructions
└── *.scad / *.png / *.stl     # Generated models, previews, and exports
```

## Example Session

```
> /openscad make a mini piano

Creating mini_piano_001.scad...
[renders preview]
The initial design has basic keys but looks toy-like.

> make it more realistic

Creating mini_piano_002.scad...
[renders and compares with 001]
Added rounded edges, proper proportions, and pedals.

> the keys are too hidden

Creating mini_piano_003.scad...
[renders and compares]
Recessed the upper cabinet so the keyboard is more visible.

> export it

Exporting mini_piano_003.stl...
Geometry validation: PASSED
Ready for slicing!
```

## License

MIT
