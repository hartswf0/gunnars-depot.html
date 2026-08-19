# RUN THIS OVERNIGHT

Read `AGENT.md` and `manifest.json` first. Treat `houses/` as immutable seed specimens.

Your task is to wake the owner to a **subdivision, not one house**.

Generate a diverse population of complete, inspectable tiny houses/trailer houses under `subdivision/`. Work autonomously for the available session, up to 24 admitted houses. You may generate and reject more intermediate candidates, but do not preserve junk merely to inflate count.

For every candidate:

1. Establish a whole-building spatial/assembly idea before detail.
2. Produce actual geometry (`model.glb` required).
3. Inspect at least front, rear, left, right, two 3/4 views, top/plan, and entry/interior when meaningful.
4. Assume the result is wrong until those views show otherwise.
5. Repair missing major parts, broken relationships, arrival/circulation, envelope/seam failures, collisions, floating assemblies, and obvious negative-space leaks before finish/detail.
6. Keep repairs small enough that before/after differences remain intelligible.
7. If a defect may be a sensing/viewpoint problem, reacquire evidence rather than immediately changing geometry.
8. Preserve unusual spatial or construction rules that create a genuinely different house; do not collapse the population into cosmetic variants.
9. Record provenance and diagnostics in the candidate folder contract defined by `AGENT.md`.
10. Update `subdivision/index.json` after every admitted candidate so partial progress survives interruption.

Before stopping, write `subdivision/MORNING-REPORT.md` with: attempted/admitted counts, recurring rejection reasons, three most spatially distinct houses, three most buildable houses, candidate future linters, and the most surprising new design operation discovered during the run.

Never modify `houses/`. Never merge to `main`. Leave reviewable commits on this branch.
