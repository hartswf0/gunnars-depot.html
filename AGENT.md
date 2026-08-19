# AGENT CONTRACT — WAKE UP TO A SUBDIVISION

You are not polishing one seed house. You are cultivating a bounded population of new houses from the seed corpus in `houses/`.

## Non-negotiable rules

1. Never modify files under `houses/`.
2. Write all generated work under `subdivision/`.
3. Preserve provenance: every candidate must name its seed parent(s), generation time, design intention, and all major transformations.
4. Produce geometry, not only prose or renders.
5. A candidate is not accepted because code ran. It must be inspectable as a coherent building from multiple views.
6. Missing major building parts outrank surface detail.
7. Do not spend the night repeatedly repairing one local decorative defect while the whole house is incomplete.
8. Do not merge to `main`. Work only on the assigned branch and leave reviewable commits.
9. Stop at 24 admitted houses maximum. Generate/reject as many intermediate attempts as needed, but preserve only useful rejected diagnostics, not endless junk.
10. Diversity matters. Do not produce 24 cosmetic variants of one parent.

## Required candidate folder

`subdivision/house-###-slug/`

Each admitted candidate must contain:

- `model.glb` — primary inspectable geometry
- `house.json` — identity, parents, dimensions, parts, design operations, provenance
- `diagnostics.json` — deterministic checks and scan findings
- `README.md` — short description of what makes this candidate structurally/spatially distinct
- `contact-sheet.png` — front, rear, left, right, two 3/4 views, top/plan, entry/interior when meaningful

If the toolchain can also emit DAE/STL, include them, but GLB is required.

## Search strategy

Treat the five seeds as a repertoire, not five targets to imitate. Generate distinct offspring by changing spatial order, assembly logic, service organization, envelope, circulation, section, roof strategy, and relation to the trailer datum. Cross lineage only when the resulting rule is legible.

Prefer structural mutations such as:

- compression/release sequence
- central versus edge service spine
- thick inhabited wall
- porch/threshold geometry
- split-level or loft section
- roof as independent parasol versus envelope
- open structural bay versus closed shell
- transformable/fold-down interior
- replaceable kit-of-parts
- radical economy of material and finish

Do not use style labels as sufficient justification.

## Criticism loop

For each consequential build state:

BUILD → RENDER MULTIPLE VIEWS → ASSUME IT IS WRONG → LOCATE ONE CONSEQUENTIAL FAILURE → MAKE THE SMALLEST COHERENT REPAIR → RENDER AGAIN.

When available, also run geometry/negative-space diagnostics:

- empty world / missing envelope
- no plausible arrival or entry
- floating/disconnected major assemblies
- implausible solid intersections
- envelope leaks and navigable unintended voids
- stairs/landing/door connectivity
- roof/wall/floor seam discontinuity
- local repair blast radius
- unobserved or poorly reconstructed regions

A suspicious scan is evidence, not a verdict. Distinguish BUILDING FAILURE from EYE FAILURE by re-observing from another position or modality when possible.

## Admission rule

Admit a candidate only when:

- it is recognizably a complete building, not a massing fragment;
- its entrance/circulation is legible;
- major parts connect coherently;
- no deterministic hard failure remains unresolved;
- at least four materially different exterior views are inspectable;
- it is meaningfully distinct from already admitted houses.

Do not optimize a single scalar score. Preserve unusual candidates that reveal a promising spatial or construction rule even if they need a final repair pass.

## Morning deliverable

Maintain `subdivision/index.json` and `subdivision/MORNING-REPORT.md`.

The report must answer:

- How many candidates were attempted?
- How many were admitted?
- Which were rejected and for what recurring reason?
- Which three houses are most spatially distinct?
- Which three are most buildable?
- Which anomalies or failures should become future deterministic linters?
- What new design operation appeared that was not explicit in the seed corpus?

The morning report is a map to the subdivision, not a victory speech.
