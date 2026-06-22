#!/bin/bash
set -euo pipefail
NAME="${1:-model}"; DIR="${2:-.}"
LATEST=$(find "$DIR" -maxdepth 1 -type f -name "${NAME}_[0-9][0-9][0-9].scad" -print | sort -V | tail -1)
if [[ -z "$LATEST" ]]; then N=1; else B="${LATEST##*/}"; V="${B%.scad}"; V="${V##*_}"; N=$((10#$V+1)); fi
printf '%s_%03d\n' "$NAME" "$N"
