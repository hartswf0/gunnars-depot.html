# FINAL HOUSES / SUBDIVISION SEED

This branch is intentionally small. It contains only the five complete house/trailer concept studies declared in Gunnar's Depot `data/asset-manifest.json`, plus the minimum instructions needed to let an autonomous building agent branch from them.

## Seed houses

- `houses/wright-usonian/`
- `houses/shigeru-ban/`
- `houses/lacaton-vassal/`
- `houses/alexander-pattern/`
- `houses/contractor-reality/`

Each seed keeps three representations:

- `source.dae` — source-preferred representation
- `model.glb` — production web representation
- `fallback.stl` — bounded fallback

Do not edit seed houses in place. New work belongs under `subdivision/`.

## Overnight question

Yes: an agent can be given this branch and asked to return a subdivision rather than one design, provided it works under a bounded output contract. The agent should generate many candidates, inspect them, reject broken candidates, preserve provenance, and leave a morning index.

Read `AGENT.md` before generating anything.
