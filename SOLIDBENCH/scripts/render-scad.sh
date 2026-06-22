#!/bin/bash
set -euo pipefail
INPUT="${1:-}"; shift || true
OUTPUT=""; SIZE="1100x800"; MODE="render"
while [[ $# -gt 0 ]]; do case "$1" in
  --output) OUTPUT="$2"; shift 2;; --size) SIZE="$2"; shift 2;;
  --preview) MODE="preview"; shift;; --render) MODE="render"; shift;;
  *) echo "Unknown option: $1" >&2; exit 2;; esac; done
[[ -f "$INPUT" ]] || { echo "Input not found: $INPUT" >&2; exit 2; }
OPENSCAD_BIN="${OPENSCAD_BIN:-/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD}"
[[ -x "$OPENSCAD_BIN" ]] || OPENSCAD_BIN="$(command -v openscad || true)"
[[ -n "$OPENSCAD_BIN" ]] || { echo "OpenSCAD executable not found" >&2; exit 127; }
OPENSCAD_CMD=("$OPENSCAD_BIN")
if [[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] && file "$OPENSCAD_BIN" | grep -q 'universal binary'; then OPENSCAD_CMD=(arch -x86_64 "$OPENSCAD_BIN"); fi
[[ -n "$OUTPUT" ]] || OUTPUT="${INPUT%.scad}.png"
CMD=("${OPENSCAD_CMD[@]}" --viewall --autocenter --imgsize "${SIZE/x/,}" --colorscheme Cornfield)
[[ "$MODE" == preview ]] && CMD+=(--preview)
CMD+=(-o "$OUTPUT" "$INPUT")
LOG=$("${CMD[@]}" 2>&1) || { CODE=$?; echo "$LOG"; exit "$CODE"; }
echo "$LOG"; [[ -s "$OUTPUT" ]] || { echo "Render produced no PNG: $OUTPUT" >&2; exit 3; }
echo "ARTIFACT=$OUTPUT"
