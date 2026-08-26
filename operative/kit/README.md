# The correspondence loop, as a thing you can paste somewhere else

Three files, no dependencies, no build step. `prompts.js` holds the two prompts,
`loop.js` holds the policy, `adapters.js` holds the parts that touch a model or a
renderer. Copy the directory, write two small functions, and the loop runs against
whatever you already have.

```js
import { createLoop } from './operative/kit/loop.js';
import { claudeAsk, threeStage } from './operative/kit/adapters.js';
import * as THREE from 'three';

const loop = createLoop({
  intent: 'A small stone chapel with a bell tower',
  reference: referenceImageDataUrl,          // optional, but this is what it argues against
  ask: claudeAsk({ apiKey, model: 'claude-opus-5' }),
  stage: threeStage(THREE),
  onEvent: e => console.log(e.kind, e.view || e.summary || '')
});

await loop.run({ cycles: 6 });
console.log(loop.world);                     // plain JSON parts
```

`node operative/kit/selftest.mjs` runs the whole policy against a scripted model and a
stage that draws nothing. No key, no network, no browser. If you change the loop, run it.

`node operative/kit/browsercheck.mjs` covers the half that cannot: the three.js stage
in a real browser, at desktop and phone width. Needs `npm i --no-save playwright-core`.

`loop-kit.html` is the whole thing wired up as a page — intent, key, reference image,
run. Open it and watch a build argue with itself.

## What the loop actually is

Two prompts and one stubborn rule about cameras.

**BUILDER** gets the intent, the reference image, the current world as JSON, and the
last accusation. It returns operations — `ADD`, `MOVE`, `SCALE`, `ROTATE_Y`, `COLOR`,
`REMOVE`, `CLEAR` — never code, never prose. On an empty world it must do a massing
pass in at most 24 operations. On a world that already exists it may change **one**
region in at most 12. That cap is not a safety rail; it is what makes the next
observation able to attribute anything.

**CRITIC** gets labelled images — the reference, the current world from a named
camera, the geometry diff, and before/after of the last change — plus the
deterministic checks. It returns a `suck_score` and one concrete criticism. It is
forbidden to praise and forbidden to propose fixes, because a critic that proposes
fixes stops looking and starts designing.

The rule that does the real work is about what a score means:

- **A low score is not "finished".** It is one camera failing to find anything. The
  loop responds by moving to the opposite view, not by stopping.
- **A high score twice from the view the repair was aimed at is not "patch again".**
  It means the builder is guessing. The loop moves the camera before touching more
  geometry.

Nothing settles until every core view is quiet *on the same version of the world* and
the deterministic checks are quiet too.

## The two seams

**`ask({ system, text, images, maxTokens }) → Promise<object>`** is the entire model
surface. `claudeAsk` and `openaiAsk` are about twenty lines each. Point it at your own
server and the loop cannot tell — which is what you want, because a key in a page is a
key you have handed to everyone who loads the page.

**`stage`** is anything that can hold a world and photograph it:

```js
{
  views: ['FRONT','BACK','LEFT','RIGHT','TOP','ENTRY'],   // optional, these are the default
  apply(world),                 // draw this array of parts
  shoot(view) → dataURL,        // photograph it from a named camera
  shootDiff(view, diff)         // optional: same shot, changes outlined
}
```

`threeStage(THREE)` is one. A CAD kernel, a 2D canvas, a game engine, or a
server-side renderer satisfying those four methods works identically. The loop never
imports a renderer.

## Pointing it at something that isn't buildings

The prompts are generated from a `DIALECT`, and the default reproduces the recorded
ones byte for byte — the self-test asserts it, so the templated form cannot drift away
from the version that has evidence behind it. Change the vocabulary and both prompts
change with it:

```js
import { builderPrompt, criticPrompt, DIALECT } from './operative/kit/prompts.js';

const circuit = { ...DIALECT,
  subject: 'circuit',
  primitives: ['ic', 'resistor', 'capacitor', 'trace', 'pad'],
  roles: ['power', 'ground', 'clock', 'signal', 'test-point'],
  massing: 'power rails, ground plane, clock distribution and the main signal path',
  detail: 'decoupling, silkscreen or labels'
};
createLoop({ /* … */ prompts: { builder: builderPrompt(circuit), critic: criticPrompt(circuit) } });
```

What transfers is the shape of the argument, not the nouns: a maker that may only
change one region at a time, a looker that is shown the change and refuses to praise,
and a rule that treats a good report from one angle as a reason to check another.

## What it costs

Roughly two model calls per cycle — one build, one or more looks — with images on
both. Six cycles on a moderate build ran about 20 calls in the recorded traces. The
builder call carries the world as JSON, so it grows with the model; the critic call
carries up to five images and is the expensive half.

## Honest notes

- The recorded traces in `assets/traces` were made by `operative-builder-scan.html`
  against OpenAI. This kit reproduces its prompts exactly and its policy with two
  corrections, both of which the self-test pins:
  - The first look after a build is now from the view the repair was aimed at. The
    original skipped to the next view while still showing the critic before/after from
    the repair view — so it asked whether a change worked while showing a side the
    change was not aimed at, and its own "still bad from here, go look elsewhere" rule
    could never fire.
  - A forced opposite-view is skipped if it has already been scored on this world.
    Without that the loop ping-pongs between one pair of views and never reaches the
    other four.
- `run()` bounds steps as well as cycles. A step does not always build, so a run that
  is only looking would otherwise never reach the cycle count and never stop.
- There is no verification here that a build is *good* — only that the loop keeps
  looking. The deterministic checks (`defaultLint`, or your own) are what make any of
  it falsifiable, and the three shipped ones are deliberately the cheapest possible
  examples. Yours are where the real leverage is.
