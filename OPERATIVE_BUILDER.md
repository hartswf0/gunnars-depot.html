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

Run the receipts with `node tests/run.mjs` (276 assertions, no dependencies).

The trailer is a working MEP model, not decorated geometry: **289 members**, five
connected systems, and every device on its system's graph.

| system | devices | parts |
|---|---|---|
| water | 6/6 connected | 30 |
| waste | 7/7 connected | 20 |
| power | 21/21 connected | 46 |
| propane | 2/2 connected | 9 |
| flue | 2/2 connected | 3 |

400 W of array, a 2400 Wh bank (1920 usable), 13 loads drawing 747 Wh/day. Three
P-traps, two vents through the roof, a bottle on the tongue and a flue in a boxed
chase. Conductors are sized against **both** ampacity (NEC 310.16) and 3% voltage
drop; traps against trap-arm limits (IPC 909.1).

**`ingold-trailer.html` is the building this was for.** The environment above is the
means; the trailer is the result. 402 members and 533 joints on the reference
sheets' 8'-6" x 20'-0" envelope: bath, galley, dinette, bed, five headed
openings, and water, waste and off-grid power as connected systems. Nobody
scripted it — the builder ran the loop for 45 decisions and settled with nothing
outstanding, and the page replays its own construction move by move, with what
the building answered at each one. `making-of.html` shows the 18 decisions as a
table and the session that produced them as a plain transcript.

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
  probe.js       what-would-happen-if: local consequence, member voices, ghosts
  ops.js         the operative vocabulary; every move reversible and journalled
  joints.js      the fastening schedule — what actually holds two members together
  loop.js        the builder's own loop: rank, choose, preview, act, verify, walk back
  gravity.js     switch gravity on and see what falls; working space you can stand in
  loads.js       what it weighs, and what the road does to every fastener
  weather.js     where the water goes: slope, ponding, penetrations, the drip line
  light.js       can you see in here — daylight, and whether the lamps reach the floor
  radiography.js fill it with light and see where it gets out; calibrate the instrument
  views.js       twelve named cameras, and the rule for which one to look from next
  critic.js      the suck score protocol — fucked until proven otherwise
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

### The builder runs it too

`loop.js` is the same loop with nobody typing. The brief is kept alive as
conditions — each line of it is a `REQUIREMENT_FAILED` that proposes the stage
which would answer it — so the builder ranks *build this* and *fix that* against
each other on one list and picks the next move from the top of it:

```
ORIENT   read the world (reuse the last lint if the hash has not moved)
FIND     rank open conditions: severity first, then how much they touch
CHOOSE   take the repair the top condition proposes
PREVIEW  score before
ACT      commit the repair, or run the stage
VERIFY   score after
         worse? walk back to the mark — unless the move answers the brief,
         because building the interior *should* open conditions
RECORD   what changed, what encounter caused it, before and after
REORIENT next pass
```

The Ingold trailer takes **18 decisions** to settle: 6 answering the brief, 11
answering what the previous move opened, in an order nothing scripted. It nails
off, builds a stage, discovers that stage's contacts are unnailed, nails off
again — four times — then spends the tail resizing a conductor that would have
melted, rerouting a bore too near a stud edge, venting a trap, and tying two
over-cut plates. That order is not in any file. It falls out of the ranking.

A move that scores worse is walked back with `rollbackTo(world, mark)` — an
exact, bounded restore, because the first version undid past its own mark and
took the building with it.

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
| `UNJOINED` | two members are touching where the schedule requires fasteners, and there are none |
| `UNDER_NAILED` | a joint exists but carries fewer fasteners than its schedule row requires |
| `FLOATING` | nothing holds it; the measure is how far it would fall |
| `ACCESS_BLOCKED` | you cannot stand where you would have to stand to reach it (NEC 110.26(A), IFGC 303) |
| `SHAKE_FAILURE` | a joint over capacity under road loads (FMCSA 393.102) |
| `PONDING` | the roof is flatter than 1/4 in per foot, so water sits on it (IRC R905.10.1) |
| `UNFLASHED` | something comes through the roof with nothing sealing it (IRC R903.2) |
| `NO_DRIP_EDGE` | the roof does not project past the wall it drains onto (IRC R905.2.8.5) |
| `UNLIT` | the lamps do not reach the floor |
| `NO_DAYLIGHT` | glazing below 8% of the floor it serves (IRC R303.1) |
| `NO_VIEW_OUT` | most of the floor cannot see a window from where a person sits |
| `LEAK` | rays fired from inside got out somewhere that is not an opening |

The support graph distinguishes **bearing** (gravity, seated) from **fastening**
(nailed, welded, lagged), because construction does. Sheathing hangs; a
crossmember is welded to a rail web; neither is carrying the building.

## Switch gravity on

For a long time this check carried an exemption:

```js
if (e.layer === 'services') continue;
// Service equipment is strapped to framing rather than stacked, so it is
// asked for continuity (check 6) instead of for a gravity path.
```

The floating things were exempted from the floating check, with a justification
written next to them. Switch gravity on and **23 of 214 solids fell a total of
678 in**. Six ceiling lights fell 85 in each. Two distribution panels, a charge
controller and four outlets fell 18 in. The world had been asked whether the
lights were *wired*, never whether they were *held*.

`FLOATING` replaces the exemption, and the measure is the honest one: how far
would it fall. The repairs are `mount` (bring it into contact and screw it off),
`hanger` (bridge the gap without moving the thing — a drain that falls 1.25 in
across the trailer must not be shoved 2.5 in to reach the deck), and `blocking`
(a 2x4 flat between the nearest members, what an electrician does when the box
lands in a bay). Each of them refuses rather than inventing: mounting something
six inches from its support is relocating it, and blocking to catch an object
four feet from any framing is not blocking.

The 20-footer now holds every one of its own parts. **0 of 262 solids fall.**

## Nothing is collided with, and still in the way

> "we have hanging shelves that cover things"

A model that only asks whether parts collide will never say this. The bed was not
*touching* the fuse panel — it was parked in front of it, and every geometric
check passed while the panel was unreachable.

`ACCESS_BLOCKED` measures the floor of the working space a rule requires: NEC
110.26(A) is 30 in wide, 36 in deep and 78 in high of clear floor in front of
anything you have to open. It reported 100% of the standing space in front of the
fuse block, the breakers and the inverter taken by the bed base and the mattress.
The panels moved to the aisle wall, which is the only stretch of this trailer with
36 in of clear floor in front of it.

Two things that version got wrong and this one does not: the rule is keyed on
`meta.role`, not on `kind` — every panel in this trailer is kind `fixture`, so a
kind-keyed rule quietly matched a generic 12 in cube and never fired. And it is
deliberately short. The first version put a rule on every fixture and reported
twenty-one violations, most of them nonsense: a sink is *supposed* to be in a
counter, a shower pan is *supposed* to be in a floor. A check that cries about the
sink teaches you to ignore it when it cries about the fuse box.

## Nothing is connected until it is nailed

For a long time the model had 973 relationships and not one joint. Two members
were "fastened" because their faces happened to touch — an inference drawn from
geometry, never an act of construction.

A joint is now **asserted**, not inferred. `world.joints` is state: these two
members, this many of these fasteners, and the schedule row that requires them.
`joints.js` carries IRC Table R602.3(1), the fastening schedule a framer works
to — two 16d end nails stud-to-plate, 8d at 6 in on sheathing edges, a hurricane
tie rather than a toe nail rafter-to-plate — plus the rows a trailer needs and a
house does not, because furniture that sits still in a house travels at 65 mph
here.

Adjacency without a joint is a `touch` edge, and `touch` does not ground
anything. So a bare `seedTrailer()` is now *lumber*: four welded crossmembers
and four hung shell panels report no load path, and one `UNJOINED` names 206
contacts. `nailOff` makes it a frame. Placing and nailing are two acts, and the
tests assert both.

The 20-footer settles at **289 members and 400 joints**, every one of them
carrying a count, a size, a method and the schedule row it answers to.

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

## Disturbing it by hand

The building is edited by disturbing it, not by filling in coordinates.

| gesture | what happens |
|---|---|
| **tap** | the world dims to that member and it says what it is. Tapping the same spot again steps *behind* it, so interior framing and services are reachable without hiding a layer |
| **drag** the selected member | it follows your finger while its neighbours answer, live. The first ten pixels lock the axis: up-down on screen moves it in height, anything else moves it on the floor plane |
| **release** | viable → a `HOLD TO COMMIT` pill. Unviable → it springs back and says why |
| **long press** | its becoming: prior states standing in the world as ghosts, on a scrubable ribbon |
| **tap a ghost** | that old position is put up for judgement against the building *as it is now* |

Nothing is written by playing. A drag is a question; only the hold is an edit, and
only the hold makes a journal entry and a trace.

While a member is being dragged the answer is immediate and measured:

```
stud.W.65  +0.25 / +30.25 / +0.00 in
STRUCTURE  CLEAR
SUPPORT    BEARING
```

Drag the same stud into the middle of the room and it reads `SUPPORT FLOATING`,
refuses the release, and says *nothing would carry it*. Lift the deck and it names
the four sole plates it would drop. The relationships that are answering are drawn
as lines **through the building** for as long as the disturbance lasts — red for
what it hits, orange for what it would let fall, green for what carries it, blue
for what it carries — and then they are gone.

## Arguing with an object's history

Prior geometry is not stored a second time; it is recovered from the journal
snapshots that were already being kept for reversibility. Long-press a member and
its earlier positions stand in the world as translucent ghosts on an encounter
ribbon — consequential states, not frames.

Grabbing one does not restore it. It submits it:

```
the t2 position of stud.W.65 no longer works — shelf.1 is there now
```

The old state is evaluated against the building as it is now, which is usually a
different building from the one that state belonged to.

## Voices

A member speaks only from its own state — identity, relationship, constraint — and
only observes or requests when a consequence has given it something to say:

```
stud.W.33
I_AM               stud 2x4 in frame
I_AM_SUPPORTED_BY  sole.W
I_SUPPORT          top1.W
I_WAS_BORED        2.00 in for water.sink, -0.50 in of edge left
I_OBSERVE          2.00 in bore in stud.W.33 is 57% of a 3.5 in bearing stud; limit is 40%
I_REQUEST          reroute
```

A member with nothing wrong stays quiet.

## Two governing interactions

- **touch anything** → see how it became that way
- **change anything** → watch who has to answer

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
| `supportGraph` got a broad-phase reject | it was 24 ms of the 30 ms lint, running full SAT on 6480 ordered pairs almost none of which were near each other; 30 ms → 15.75 ms, identical graph |
| Disturbance is evaluated locally (`probe.js`), not by re-linting | even at 15.75 ms a full lint is the entire frame budget, so a drag could not have answered at all. The performance limit and the LOCAL principle turned out to want the same thing: 0.6 ms per probe, through the member's actual neighbours |
| Gestures moved to the capture phase | OrbitControls takes pointer capture on the canvas and listens for moves on the document, so a bubble-phase handler never got to claim the gesture for the object; the camera won every drag |
| Any movement cancels the long press | cancelling it only once the drag threshold was crossed meant a slow small movement fired the long press *mid-drag* and stole the gesture — which is exactly what happened, repeatedly, before it was instrumented |
| pointerdown prefers the already-selected member | tap-cycling ran on press as well as on tap, so pressing to drag stepped to a different member and the drag grabbed the wrong thing — or nothing |
| A deduped final state is relabelled "current" | when a member had not moved since its last journalled state, the last dot on its ribbon read "before header" instead of "now" |

## What the MEP decided for itself

| the encounter | what it decided |
|---|---|
| `UNDERSIZED_CONDUCTOR — bank.inverter carries 167 A on 8 AWG, rated 50 A` | The first version of the check only asked about voltage drop, and "repaired" a 167 A inverter feed to **6 AWG** — which passes a drop test over 1.8 ft and would melt. A conductor has to carry the current *and* deliver the voltage. Now 2/0. |
| `4.00 in bore removes 114% of top1.E` | A 4 in flue **cannot** pass through a 3½ in top plate. It left the wall for a boxed chase in the rafter bay. |
| `ENVELOPE — overall width 104.3 in` | A horizontal concentric vent through the side wall protrudes past the skin and busts the towing width. The flue went up through the roof. |
| `UNVENTED_TRAP — 83 in from the nearest vent` | A 1½ in trap arm may run 72 in. The shower got its own vent — and the check now proposes *where*, because proposed without a location the stack rose straight through the shower pan and the floor. |
| four lights reported unpowered | Connectivity measured end to end, so six pucks tapped off one cable read as five orphans. A device on the middle of a run is on the run. |
| traps 5.5 in off their own drains | A trap belongs **in** the line, at the take-off, not merely under the bowl. |

A sleeved-penetration object was written to let a vent cross a roof, and **backed
out**: every sleeve then collided with the roof, the skin and the other sleeves —
nine conflicts to resolve two. A pipe crossing a member is a bore, which this world
already models. Vents and flues became runs.

## Two journals, at two scales

The trailer keeps a journal of the 103 moves that built it. The session that built
the trailer kept one too — Claude Code writes every tool call and result to
`~/.claude/projects/<project>/<session>.jsonl` — but it lives outside the
repository and dies with the container.

`tools/session-record.mjs` lifts it in. `data/session-record.json` holds **216
loops**: what was said before each one, what actually ran, what actually came
back, and the screenshots, in order, with the instructions kept as chapters.
`making-of.html` replays it.

```
act     91    patching the code
verify  59    checking whether the last patch worked
orient  20    reading the repository or the state
probe   20    the smallest experiment that could reveal something
observe 14    looking at a rendered screenshot
record    4   commits pushed
```

Two loops, not one: 216 loops of a session to make a builder that then takes 18
of its own.

Why this is not optional: the correspondence claim — *an instruction acted, the
world answered, the answer changed what happened next* — was only verifiable at
one scale. The building can prove its own becoming; the program could not. The
correspondence records in this document were **prose I wrote afterwards**, which
is exactly what "do not let prose substitute for executable verification" warns
against. Now each of them can be traced to the loop that produced it: the command
that ran, the output that came back, the screenshot at that moment.

The record is regenerated, not maintained by hand:

```
node tools/session-record.mjs ~/.claude/projects/<project>/<session>.jsonl \
     data/session-record.json assets/making
```

It is stale by one commit the moment it is written — the commit that adds it cannot
be inside it. That is a property of the thing, not a defect to paper over.

## What the trailer decided for itself

The sheets give six numbers. Building them produced conditions none of the numbers
mentioned, and each one changed the design:

| the encounter | what it decided |
|---|---|
| `ENVELOPE — overall width 120.0 in exceeds 102` | **8'-6" is the towing width, not the shell width.** Built as a 102 in shell with outboard axles it measures 120 in overall. The framing is 101 and the sheathing makes it exactly 102. |
| 24 conflicts between axle, rail, joist, deck, plate and stud | **the wheels must come inside the width, and the floor must be cut around them.** Lifting the floor over a 26 in tyre instead puts the deck at 32.5 in and busts the 10'-6" height by 5 in. The geometry chose the wheel well; the drawing never mentioned one. |
| the well is 12 in deep but the wall stands on the first 3.5 in | **the wheel well is a shelf, not a seat** — 8.5 in of ledge at 15 in high. The dinette benches are built inboard of it and land on it, instead of being it. |
| rear axle at 55% of the length for tongue weight | **the axle decided the size of the bed.** The back of the well lands at y=183, leaving 52 in to the end wall. A full mattress wants 54. |
| `EDGE_CLEARANCE` on every joist the drain crossed | **the waste system rewrote the floor structure.** A 1.5 in bore needs 2 in of edge each side; in a 5.5 in joist that leaves exactly one legal height, and a drain has to fall. 2x6 gives 0.00 in of freedom, 2x8 gives 1.75, and the run needs 1.25. The floor became 2x8 and the deck rose 1.75 in. |
| 35 placements broke when the deck rose | **anything that sits on the floor is described relative to the floor.** The interior had been written against a remembered height. |
| `UNSUPPORTED — shower.valve` | **a valve in a stud bay has nothing to screw to.** It needed blocking, spanning stud to stud, in the plane of the studs — not inboard of them, where it touched only along an edge. |
| 65 GAL on the sheet | **the requirement sized the tank.** 15,015 cu in through 15 in of bed platform is 44 x 24. |
| the sheet lists no grey capacity | **grey water leaves the building**, which is why the drain main has to thread the joists at all. |

The finished trailer is 102 x 241 x 112.5 in. The sheet says 10'-6" and the build
comes in 13.5 in under it: **height was never the binding constraint — width was.**
That is recorded rather than corrected, because nothing in the building is asking
for the extra height.

## Two bugs the trailer found in the environment

Building something real exercised the checks harder than the 6x12 shed ever did:

- **Edge distance was measured across the wrong axis.** It took whichever dimension
  of a member happened to be smallest, which for a joist is its 1.5 in thickness —
  the *length* of the bore, not its edge. Every diagonal pipe crossing read as a
  violation. It is now measured across the member's depth, the dimension the span
  table is about.
- **Connectivity was measured centre to centre.** A riser landing inside a vanity
  was reported as "not connected" because the basin's centre was 5 in away. A pipe
  that arrives inside a fixture's body is connected to it.

Two limits in `reroute` are known and unfixed: a run with only two points has no
interior vertex to shift, so it cannot be repaired by shifting; and branches that
tee off a trunk are independent runs, so moving the trunk silently orphans the
branch. Both were worked around by deriving the pipe layout from the bore rule and
the joist bays instead of repairing it afterwards — the constraint generating the
design rather than being patched into it.

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


## Fucked until proven otherwise

Every condition above answers a question someone thought to ask. `whats-fucked.html`
exists for the enormous set of problems nobody thought to ask about — the ones you
can only find by looking at the thing.

```
BUILD -> TAKE PICTURE -> REFERENCE vs PICTURE -> ASSUME IT IS FUCKED ->
WHAT SUCKS? -> SUCK SCORE -> CRITICISM BECOMES THE NEXT PROMPT -> BUILD AGAIN
```

The rule that makes this different from a scoring loop: **a low score is not a
result.** It means this camera failed to find a problem, so it triggers a move.

```
"Looks good from here."   ->   "Fine. Look somewhere else."
```

### Are we not taking enough photos?

We were not. Every screenshot in this repository until `tools/shoot.mjs` existed
was the same three-quarter view of the same corner. Six ceiling lights hung in
mid-air across a dozen of them because no picture ever looked up. The first
interior photograph ever taken of this trailer came back a flat brown rectangle:
a conduit run from the fuse block to the bathroom fan, drawn as a box around its
two endpoints, was a **60 x 204 x 38 in solid block** sitting in the middle of the
room. Real conduit runs in axial legs along the framing, so `route` expands a path
into legs before building anything from it — rise early, fall late, except for
gravity drainage, where a shallow slope is a fall and squaring it off costs the
drain every inch of it.

`views.js` holds twelve named cameras — front, rear, left, right, two
three-quarters, plan, three interiors, the underside, an x-ray — and three rules
for choosing the next one:

1. the view that would show what was just criticised
2. after a repair, the opposite of where the repair was judged from
3. otherwise the least recently inspected

No camera-planning intelligence. The third rule guarantees every view comes round.

### The score is the worst view, never the average

```
front 8   left 12   rear 76   interior 84   plan 21
```

The mean is 40.2, which disguises the failure completely. A building that works
from four views and falls apart from the fifth is fucked. `worldScore` takes the
max and names which view it came from.

### It is never DONE

`settlement()` returns **NOT CURRENTLY FUCKED**, and only when a full sweep of
materially different views — three exterior, two interior, a plan, a service view
— has each recently failed to find a problem *and* no deterministic check is open.
Any new camera, request, structural check or reference discrepancy reopens it.

### Two agents, two context windows

The critic gets the reference image and the render, and is told to assume the
build is fucked, to say what it actually sees, and not to propose a fix — an
evaluator that proposes repairs starts defending them. The builder gets the
criticism **verbatim**, with the linters simply joining the accusation:

```
WHAT SUCKS VISUALLY:
The table appears to float slightly above the floor.

WHAT SUCKS DETERMINISTICALLY:
FLOATING table is held by nothing; switch gravity on and it falls 2.3 in
ACCESS_BLOCKED 100% of the space you have to stand in to reach dc.panel is taken by bed.base
```

No translation layer. The builder answers with a JSON array of operations, which
are validated against the real vocabulary before anything touches the building —
and that vocabulary is **read off the functions**, not written down. A hand-kept
list goes stale and the builder starts calling `move(id, by)` against
`move(id, delta)`, which the world refuses so quietly it looks like nothing
happened. When a move does not land, the refusal goes back to the builder as the
next accusation.

With no API key the critic is the linters: deterministic, honest, and blind to
everything nobody thought to check. That blindness is the argument for the other
mode, and the taxonomy makes it in one table.

## What kinds of thing actually go wrong

`node tools/taxonomy.mjs` counts three separate populations, kept separate because
confusing them is how you end up believing the model is fine.

**What the checks caught, building the trailer:**

```
SERVICE_ORPHAN   38    UNJOINED             29    FLOATING             24
ONE_END_BEARING   6    VOLTAGE_DROP          6    OPENING_UNHEADED      5
OVERLAP           3    PLATE_TIE_REQUIRED    2    NO_TRAP               1
UNVENTED_TRAP     1    EDGE_CLEARANCE        1    UNDERSIZED_CONDUCTOR  1
```

**What a person caught by looking at a picture**, lifted from the Operative
Correspondent chat archive:

```
7  the roof is wrong
2  things do not connect
1  proportion and count
1  openings and surface are illegible
1  other
```

Not one condition code in the first list is about the roof reading wrong, about
proportion, or about legibility. The second list is not a subset of the first,
and that is the whole argument for a critic.

## Which picture is which

> "can we tell from the context windows and the record which images came from the
> scene and which is the reference?"

Only if it is recorded at the moment of capture, so it is. Every render carries
`origin: 'render'` and the view it was taken from; a reference carries
`origin: 'reference'` and never enters the observation list. `assets/views/manifest.json`
records it for the shot set, the page labels each thumbnail REFERENCE or RENDER in
the log, and the observation objects the critic scores carry it too.


## Four kinds of physics, and what each one found

The deterministic checks up to this point were all about *geometry* — what
touches what, what carries what, what fits. Four more were added because a
building is not only a shape:

### Shake it

`loads.js`. 436 fasteners existed before anything ever *loaded* one. A schedule
you never check is a schedule you are trusting, which is the same mistake as the
support check that skipped services. A house is shaken by wind once in its life;
a trailer is shaken every mile, so the cases are FMCSA 393.102 — 0.8 g panic
stop, 0.5 g swerve, 0.2 g uplift over a crest — plus a 2 g landing.

The first thing it found was not a fastener. **The trailer weighed 18,631 lb**,
more than its own axles are rated for, because the model is *volumes*: a plastic
water tank taken at steel's density weighed 4,492 lb, a C6 channel drawn at its
3 x 6 in envelope weighed 1,225 lb, and a hollow storage platform weighed 1,300 lb
of solid plywood. Steel is sold by the foot, tanks are water in a shell, and
hollow things weigh their shell. It weighs 7,049 lb now.

The second thing it found was that **the entire interior was unfastened** — see
below.

### Rain it

`weather.js`. Rain is the cheapest physics there is: it falls, it runs downhill,
and everywhere it stops or gets in is a place the building fails slowly instead
of all at once.

The roof had been **dead flat for the whole life of the project** and no check
had ever mentioned it, because no check had ever been about water. It ponded, it
had 0.5 in of projection past the wall, and four penetrations came through it
with nothing sealing them.

The fix generated a real design consequence. The road caps the width at 102 in
and the skin was already at 102, so **an eave on the low side is illegal**. The
fall goes across the width because that is where it fits; the overhang goes along
the length because that is the only direction the road allows one; and the low
side gets a drip edge turned *down* over the cladding instead of out past it. The
first drip edge projected the 0.75 in a drip edge normally would and put the
trailer at 103.3 in overall — the flashing broke the towing envelope, and the
same constraint that forbade the eave forbade the detail's usual shape.

### Look at it

The three-quarter photograph showed daylight under the roof. The wall skin
stopped at the top plate and the roof started at the underside of the rafters, so
a pitched roof left **a band of open air right around the building** — 6 in on the
high side, ramping on the ends, filled only by rafters at 16 in centres. Every
check passed. None of them was about the envelope being *closed*.

The end-wall infill is a triangle, and a sheared box is a parallelogram: drawn as
one, its low corner dropped 3 in below the top plate and straight through the wall
skin. It is framed the way it is actually framed, in stepped strips.

### Light it

`light.js`. Six 3 W pucks in a 168 sq ft house average **4.3 foot-candles**,
which is a stairwell. The power budget had passed the whole time, because 18 W is
easy on a battery — **the electrical system had been optimised against a
constraint that rewarded being dim.** Two models, because they answer two
questions: the lumen method gives the room its average, and a point-source pass
finds the corner a cabinet is shadowing, which an average cannot. It runs at 42 W
and 10.1 fc now.

## One name per thing

The model had two naming systems and they disagreed. `kind` is the structural
class the geometry engine cares about — everything in the interior is `fixture`.
`meta.role` is what the thing actually *is*: cabinet, bed, counter, fridge.

Every rule written against `kind` alone silently missed. The NEC working
clearance never fired on a single panel. The fastening schedule skipped the
**entire interior** — fourteen `fixture`/`fixture` contacts including an 836 lb
water tank sitting loose in a bed platform, found only when something finally
tried to shake the trailer. Three separate rules, three separate misses, all the
same cause. There is one `sortOf()` now, and everything asks it.

A miss is silent. That is what makes it expensive.

## The fly's eye

> "think like this is inside a fly's eye and then we give the ai a sheet of many
> images of it of each element"

`tools/flyseye.mjs`. The twelve named views tell you about the building and almost
nothing about the *parts*, because a part is four pixels in a photograph of a
trailer. This takes a close-up of every element — subject painted, neighbours
ghosted, a wireframe cage over the top — and lays them on one contact sheet.

A model looking at one sheet of ninety tiles can compare them to each other. A
model looking at ninety separate images cannot. Difference is easier to see than
absence.

Getting there took four failures worth keeping:

1. At full opacity against 16% neighbours the subject was still unfindable — a
   1.5 in stud is four pixels wide and the same brown as everything else. It gets
   a colour nothing else in the model has.
2. Ghosts at 10% still wrote depth, so on nineteen tiles the subject was hidden
   behind something you could see straight through.
3. Fifteen ghosts at 10% leave 21% of the subject showing, which against a dark
   background is nothing. Hence the cage, drawn last, ignoring depth.
4. **The camera moved between the render and the photograph.** The View runs an
   animation loop that calls `controls.update()` every frame, and OrbitControls
   damps the camera back toward its own remembered target. On a wide view the
   drift is invisible. On a close-up the subject left the frame entirely — and
   **forty-six tiles came back byte-identical while looking completely
   plausible.** The only signal was the md5.

That last one is the most useful failure in this repository. A camera that
quietly disagrees with where you put it produces images that look like answers.


## Is the building fucked, or are our eyes fucked?

Every check above has to know what it is looking for. `UNJOINED` knows about
fasteners. `PONDING` knows about slope. `ACCESS_BLOCKED` knows about NEC 110.26.
Each one answers a question somebody thought to ask, and the things that have hurt
in this project are always the ones nobody thought to ask about: the wall skin
that stopped at the top plate, found by accident in a photograph.

`radiography.js` asks nothing. It fills the inside with light and records where
the light gets out. A ray does not need to know what a wall is; it only needs to
not hit one. Anywhere a ray escapes that is not a window is a hole, whether or not
anyone has a rule for that kind of hole.

### The plate

Every escaping ray is plotted where it crossed the building's own surface, and the
surface is unfolded flat — roof on top, underside at the bottom, four walls in the
band between. **A sealed building develops black. A seam develops as a line,
because a seam is a line.**

The first plate had a 188-inch line across the east face. That was the eave: one
rafter's depth of open air right around the building, closed now with a block in
every bay — which a framer calls bird blocking, because of what gets in otherwise.

### The control group

Rays that leave through a door or a window are plotted on a second plate at the
same exposure. The first time it ran, **that plate was empty.** Not one ray in
fifty thousand had left through an opening.

`cut` had been interrupting studs, adding headers and recording openings since the
beginning, and had never once touched the exterior sheathing. The trailer had a
framed door you could not walk through and four framed windows you could not see
out of. Nothing had noticed, because every check was about the framing.

**The absence of the expected reading was the finding.** That is the thing this
instrument can do that none of the others can.

### Calibrating

```
CALIBRATION  the instrument is honest
             sealed box leaks 0 of 1152; a missing wall reads 196
```

Six panels with no gaps. Every ray must be stopped. If any get out, the number
about to be reported on a real building is the scanner's noise floor and the
correct response is to fix the scanner and say nothing about the building. The
second half matters just as much: the same box with one wall removed has to read
*something*, because a scanner that reports zero on everything is also reporting
zero on the sealed box.

This is the only measurement in the project that can tell **the building is wrong**
from **our eyes are wrong**.

### Resolution, stated rather than assumed

Two sweeps, and the difference is written into the finding itself:

| | rays | finds a missing wall panel | finds two missing eave blocks |
|---|---|---|---|
| in-loop `LEAK` check | ~8,400 | yes | **no** |
| `node tools/scan.mjs` | ~79,000 | yes | yes |

Tuned by taking a panel off and checking that it came back. At the first setting a
missing 101 × 34 in panel produced twenty-two escapes spread across sixteen
one-ray clusters, every one below threshold — the check ran, cost time, and
reported nothing. **A blind check is worse than no check, because it looks like a
clean bill of health.**

### Radiographs

Parallel rays through the whole thing, each carrying how much material it passed
through. This finds nothing on its own; it shows density, and a part that is not
where anyone thought it was shows up as a shadow in the wrong place. Rafters read
as stripes, studs as fine lines, openings as voids, the furniture as bright mass
along the floor.

### On something that is not this trailer

`node tools/scan.mjs --stl path/to/anything.stl`. Triangles instead of boxes, a
Möller-Trumbore test instead of a parallelepiped one, interior points found by
parity — three probe rays, and a point only counts as inside if all three agree,
because a single ray that grazes an edge gets the answer exactly backwards and
seeds the scanner outside the building, where the whole sky reads as a leak.

Nothing else about the scan changes. It does not know what a trailer is.

### What it found

```
20 of 78,720 rays got out where they should not — 0.03%
```

Every one of them at an eighth of an inch: the expansion gap printed on every
sheet of sheathing, at the seams the door and window cuts created three edits
earlier. The scanner found gaps I had just made, at exactly the size I made them.
On site you tape those. There is a `tape` op now.
