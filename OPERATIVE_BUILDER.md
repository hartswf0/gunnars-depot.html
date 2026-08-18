# Operative Builder

`operative-builder.html` — a Three.js building environment in which an instruction
acts, the world answers, and the answer changes what happens next.

It is built on the geometry this repository already carries. The trailer datum
(deck top at 14 in, shell 72 × 144 in, wall top at 76 in, a shed roof falling
across the width) was measured out of `assets/models/**/*.stl`, not invented; the
layer names, the module dependencies and the material list come from
`data/module-rules.json` and `data/materials.json`.

Open `operative-builder.html` from GitHub Pages or any local static server
(`npx http-server .`) — it is an ES-module page, so `file://` will not load it.
Everything else runs offline: `three` (r185, MIT) is vendored under
`vendor/three/`, and the reference studies are read from this repository.

Run the receipts with `node tests/run.mjs` (59 assertions, no dependencies).

---

## What is actually here

The scene is a **projection** of world state, never a second copy of it. The
world is 81 individually addressable members — rails, crossmembers, pads, wheels,
joists, deck, sole plates, studs, top plates, sheathing, rafters, cover — each
with a real section, a real place in the support graph, and its own history.

```
operative/
  geom.js        axis-aligned box algebra, inches, Z up
  poly.js        exact convex tests for boxes and sheared boxes (SAT)
  world.js       elements, support graph, journal, per-member trace, state hash
  kit.js         the seed build, generated from the measured datum
  checks.js      the deterministic conditions — where the world pushes back
  ops.js         the operative vocabulary; every move reversible and journalled
  reference.js   STL silhouette extraction and comparison against the concepts
  language.js    sentences become operations
  invariants.js  rules promoted at runtime after repeated failure
  view.js        the Three.js projection
  app.js         the mobile interface
```

## The loop

Every move goes through `commit()`, which measures the open conditions before and
after, so the world's answer stays attached to the instruction that provoked it:

```
instruction → operation → world changes → conditions open and close → history
```

`SETTLED` is the resting state, not `DONE`. It means only: no known consequential
failure demands another move. Any disturbance reopens it.

## What answers back

Deterministic, measured, and each citing its basis:

| condition | what it means |
|---|---|
| `OVERLAP` | two solids occupy the same space, with the interpenetration depth |
| `UNSUPPORTED` | a member has no load path to the ground |
| `ONE_END_BEARING` | a spanning member bears at one end; the other is in the air |
| `SPAN_EXCEEDED` | clear span past the allowable for that section (IRC-style table) |
| `OPENING_ABOVE_PLATE` | the opening plus its header does not fit the wall |
| `OPENING_UNHEADED` | studs were interrupted with nothing carrying over them |
| `NO_BEARING` | a header without two jack studs |
| `BORE_OVERSIZE` | a bore past 40% of a bearing stud, or a third of a joist (IRC R602.6 / R502.8) |
| `EDGE_CLEARANCE` | a bore too close to the edge of its member |
| `PLATE_TIE_REQUIRED` | a top or sole plate cut past 50% needs a steel tie (R602.6.1) |
| `SERVICE_ORPHAN` | a fixture or run with no continuous path to a source |
| `ENVELOPE` | past the road-legal towing envelope |
| `PROFILE_DEVIATION` | the silhouette disagrees with the bound concept study |

The support graph distinguishes **bearing** (gravity, seated) from **fastening**
(nailed, welded, lagged), because construction does. Sheathing hangs; a
crossmember is welded to a rail web; neither is carrying the building.

## The building service

Power and water are connected systems, not decoration. A run is routed as a
path; every member it crosses is bored, and the bore is recorded **on that
member** with its diameter, its remaining edge distance and the rule it is
measured against. `reroute` then computes a legal path from the world itself:

- **bay** — the line moves out of a stud into the cavity beside it
- **centre** — the line moves to the member's centreline to recover edge distance
- **under** — when no bore position in a joist can take the diameter at all, the
  line goes under the framing instead of through it

Terminals never move: a run that loses its source or its fixture has not been
repaired, it has been abandoned.

## The drawing gets a say

`reference contractor` (or `wright`, `ban`, `lacaton`, `alexander`) reads one of
the five concept studies from `assets/models/concepts/`, aligns it to the build
datum, projects both the study and the current build to end and side elevations,
and reports the difference in operational language:

```
end elevation agrees 64% with Contractor Reality Trailer
· reference roof rises -4 in over 104 in of width; yours rises 0 in
· reference has 1384 in² of material you do not, at x 72..96, z 0..76
```

The seed roof is deliberately flat. The reference has an opinion about that, and
its proposal — half the correction up on the high wall, half down on the low one,
then reseat the roof — closes the measured gap. The reference never blocks: it is
a reference, not a code rule.

## Two gestures

- **touch anything** → what it is, what bears on it, what it carries, what it is
  fastened to, what has been bored through it, and how it became that way
- **change anything** → the members that had to answer pulse in the world, and the
  conditions that opened and closed are named

History is a journal of before/after state hashes with a full snapshot, so any
move walks back exactly. Each member also carries its own trace — what systems,
constraints, neighbours and instructions passed through it and left marks.

## Rules the build had to learn

`invariants.js` counts what the world keeps complaining about. A condition code
that has opened three times is promoted to an invariant and from then on is
checked **before** the operation runs rather than after it. The promotion is a
visible event in the history, and the warning names the invariant that produced
it. Currently promotable: bore limits, edge clearance, opening height against
wall height, reseating the roof after a wall moves, header sizing.

---

## Correspondence record

What changed during construction, and what encounter caused it. These are not
polish; each one is a place where running the thing contradicted the plan.

| what changed | what caused it |
|---|---|
| Support graph gained two edge kinds, `bear` and `fasten` | the first probe called every welded crossmember and every sheet of nailed sheathing "unsupported" |
| Members became parallelepipeds with an exact SAT test (`poly.js`) | a shed rafter cannot be told the truth as an axis-aligned block; its bounding box swallowed the roof cover |
| `fastenedTo` stopped comparing bounding boxes | it reported a sloped rafter as fastened to a plate its material floated 8.3 in above |
| `bearsOn` compares tops, not centroids | a rafter's centroid sits out over the room, below the plate it lands on; 8 of 10 rafters lost their bearing |
| Crossmembers moved between the rail webs | cut through the rails they read as interpenetration — which in steel is what they would have been |
| Wheels moved outboard of the shell | placed inboard they punched through rail, deck, sole plate, stud and shell at once |
| The seed roof was flattened | so the bound reference has something real to disagree with |
| `pitch` seats on the plate's downhill edge | anchored on the centreline the sloped rafter dipped 0.2 in into every top plate, twenty times over |
| `pitch` reshapes the S and N walls | left flat, the end walls stood straight through the tilted rafters |
| End-wall studs are cut at their downhill edge | a 1.5 in wide stud under a sloping plate still overlapped it by 0.09 in |
| `raise` takes one wall or all four, and accepts negative | a shed roof needs its two bearing walls at different heights, and pitching by raising alone grew the building until it read 8 in taller than the reference |
| `OPENING_ABOVE_PLATE` includes the header depth | reported on head height alone, the proposed raise was always 4–6 in short and the header refused a second time |
| Its repair raises all four walls, not the named one | raising one wall under an existing roof opened thirteen conflicts |
| `OVERLAP` proposes no repair | sliding one of two colliding members by the penetration depth is almost never the move, and a confident wrong proposal is worse than none |
| `reroute` gained the "under the framing" correction | a 2 in line does not fit a 2x6 joist at any bore position, so shifting it sideways never converged |
| `reroute` holds its terminals still | the first version moved the whole path into a stud bay and left the sink unfed |
| Per-run penetrations are cleared once, not per segment | segment 2 deleted the bore segment 1 had just recorded in the same member |
| The reference renders as a ghost solid | a dense triangle wireframe buried the building it was meant to be compared with |
| Openings render as visible voids | a cut is a thing that happened and should look like one |
| Roof fall is fitted over the longest run of roof columns | measured over every occupied column it reported the fender as a 48 in slope |
| A proposed repair runs as one transaction (`commitChain`) | judged step by step, pitching the roof reported forty conflicts that the very next step closed, and the invariant counter learned thirty-one "overlaps" from states the building was never in |

## A run that shows the whole chain

Reproducible end to end; this is the actual output.

```
reference contractor                       end agrees 64%; reference roof rises -4 in
                                           over 104 in of width; yours rises 0 in

$ cut a door in the south wall from 20 to 56
    door 36x80 in cut in wall S; 3 studs interrupted
    answers: door.S.20 needs 101.0 in (head plus a (2)2x6 header) but wall S's
             plate is at 73.0 in — 28.0 in short
    answers: door.S.20 interrupted 3 studs with nothing carrying the load over it

[world proposes] raise                     (for OPENING_ABOVE_PLATE)
    all four walls raised 28 in; wall W now tops out at 104.0 in
    closed:  OPENING_ABOVE_PLATE

[world proposes] header                    (for OPENING_UNHEADED)
    (2)2x6 header over door.S.20, 36 in clear, on 2 jacks
    closed:  OPENING_UNHEADED

[world proposes] pitch the roof 4 in toward E   (for PROFILE_DEVIATION)
    wall W raised 2 in; wall E lowered 2 in
    roof reseated on the plates: falls 4.0 in from W to E; end walls follow it
    answers: top1.S and header.door.S.20 occupy the same 1.15 in of space
    answers: door.S.20 needs 101.0 in but wall S's plate is at 99.2 in — 1.8 in short

[world proposes] raise                     (for OPENING_ABOVE_PLATE)
    all four walls raised 2 in
    closed:  OVERLAP, OPENING_ABOVE_PLATE

$ inlet water at 0 4 10
$ put a sink at 30 33 46
    answers: sink is not connected to any water source

$ route water from inlet.water to sink 2 in
    answers: 2.00 in bore in joist.33 exceeds one third of its 5.5 in depth
    answers: bore in joist.33 sits -0.50 in from the edge; joists need 2 in
    answers: 2.00 in bore in stud.W.33 is 57% of a 3.5 in bearing stud; limit is 40%
    answers: 2.00 in bore removes 57% of sole.W; a plate cut past 50% needs a steel tie
    closed:  SERVICE_ORPHAN
    INVARIANT after 3: a service line larger than 40% of a bearing member does not
                       pass through it — plan the riser in a bay
    INVARIANT after 3: a bore is centred in its member unless something forces it off

$ reroute water.sink
    under joists at z=6.3 in (a 2 in line does not fit a 2x6);
    out of stud.W.33 into the bay at y=40.8 in
    closed:  BORE_OVERSIZE, EDGE_CLEARANCE, BORE_OVERSIZE, EDGE_CLEARANCE,
             BORE_OVERSIZE, EDGE_CLEARANCE

$ strap sole.W
    closed:  PLATE_TIE_REQUIRED

open at the end: PROFILE_DEVIATION x2   roof fall now -4.4 in, matching the reference exactly
```

Nothing past the first sentence was specified in advance. Each move was chosen
from what the previous move ran into: the door did not fit the wall, the raised
wall left the opening unheaded, the reference disagreed about the roof, the
pitched roof dropped its end plate into the header that had just been built, and
a 2 in supply would not pass through either a 2x6 joist or a bearing stud.

The build ends **SETTLING**, not settled, and that is the honest reading. Two
profile deviations stay open: a standard 80 in door forced this trailer 30 in
taller than the concept study it is being compared against, and the study has a
covered porch on its east side that this build does not. Neither is a code
failure. They are recorded, measured, and left for the next move.
