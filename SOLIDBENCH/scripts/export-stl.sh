#!/bin/bash
set -euo pipefail
INPUT="${1:-}"; shift || true
OUTPUT=""; FORMAT="binstl"
while [[ $# -gt 0 ]]; do case "$1" in
  --output) OUTPUT="$2"; shift 2;; --ascii) FORMAT="asciistl"; shift;;
  --binary) FORMAT="binstl"; shift;; *) echo "Unknown option: $1" >&2; exit 2;; esac; done
[[ -f "$INPUT" ]] || { echo "Input not found: $INPUT" >&2; exit 2; }
OPENSCAD_BIN="${OPENSCAD_BIN:-/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD}"
[[ -x "$OPENSCAD_BIN" ]] || OPENSCAD_BIN="$(command -v openscad || true)"
[[ -n "$OPENSCAD_BIN" ]] || { echo "OpenSCAD executable not found" >&2; exit 127; }
OPENSCAD_CMD=("$OPENSCAD_BIN")
if [[ "$(uname -s)" == Darwin && "$(uname -m)" == arm64 ]] && file "$OPENSCAD_BIN" | grep -q 'universal binary'; then OPENSCAD_CMD=(arch -x86_64 "$OPENSCAD_BIN"); fi
[[ -n "$OUTPUT" ]] || OUTPUT="${INPUT%.scad}.stl"
LOG=$("${OPENSCAD_CMD[@]}" --export-format "$FORMAT" -o "$OUTPUT" "$INPUT" 2>&1) || { CODE=$?; echo "$LOG"; exit "$CODE"; }
echo "$LOG"; [[ -s "$OUTPUT" ]] || { echo "Export produced no STL: $OUTPUT" >&2; exit 3; }
if [[ "$FORMAT" == binstl ]]; then TRIANGLES=$(od -An -tu4 -j80 -N4 "$OUTPUT" | tr -d ' '); echo "TRIANGLES=$TRIANGLES"; fi
echo "BYTES=$(wc -c < "$OUTPUT" | tr -d ' ')"; echo "ARTIFACT=$OUTPUT"
