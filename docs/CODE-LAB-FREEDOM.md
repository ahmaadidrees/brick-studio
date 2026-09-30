# Code Lab: creative freedom contract

This phase extends the isolated, single-player `/2d/lab` prototype from `30afd24`.
The ordinary 2D builder, classroom storage, and room protocol retain their existing behavior.

## Student promise

Start with a working creation, open a behavior, understand its instructions, change it,
and reuse the result. A returning ball and a vehicle controlled by a signal must be
programs made with the same blocks a student can place. No invention-specific engine switch.

## Language and ownership

- Named numeric variables belong to this object, the player, or the world. Missing values
  read as zero. Names are code identifiers, distinct from the picked speech phrases.
- A reusable behavior has a name, up to three named numeric inputs, and an editable body.
  Calls may wait and call other behaviors. Inputs have call-local scope; recursive or
  oversized programs remain bounded and produce a useful diagnostic.
- Costume frames are student drawings attached to a character's appearance. Code can select a
  frame, advance to the next one, or play the frames at a chosen rate; a click can start an
  editable response with student-written speech.
- Control and physics can be switched for a chosen thing. This makes a ride-on car possible
  with general blocks: a touching check, a `driving` variable, key sensing, and positions keep
  the player aligned with the moving car. The original `let ride` shortcut example remains a
  separate legacy recipe.
- Named messages arrive on the next simulation tick in stable order. A message cannot
  synchronously recurse forever. The World rules program can coordinate the level.
- Position reporters and movement/spawning coordinates use pixels: x is the body's
  horizontal center, y is its bottom, with positive y downward. Existing directional
  speed blocks continue to work. Inputs and execution state remain serializable data.
- Editing a reusable brick design changes every instance of that design in this lab.
  **Make just this one different** first forks a placed instance into its own reusable
  design, leaving the other instances and the source design unchanged.
- Collision resolution, rendering, input delivery, riding attachment, scheduling, and
  resource limits remain engine services. Friendly gameplay rules can be student code.

## Recovery and boundaries

Existing v1 lab documents and the eight earlier recipes continue to work alongside the
editable character and programmable-car recipes. Programs, definitions, names, drawn costume
frames, and instance choices survive browser-local save/reopen. World values
and running script state reset when the level restarts; they are not saved-game progress.
The old review checkout and its lockfile are preserved. No deployment or classroom-data
migration is part of this phase. Python and JavaScript remain labeled read-only views.

## Evidence required

1. Original five recipe tests still pass.
2. Named state is isolated by scope; procedure inputs survive waits/nesting and JSON
   round trips; invalid calls and runaway code remain bounded.
3. Messages and world rules execute reproducibly, with bounded queues.
4. New inventions use only catalog blocks, and editable friendly behaviors can be opened.
5. A user can find guidance, change a program in the real Blockly UI, see its effect,
   make one instance unique, and reload without losing the authored program.
6. Type checks, production build, relevant regression tests, and local browser rehearsal
   are reported separately. Classroom hardware and multiplayer remain future validation.

## Work ownership

Sol owns the language/compiler/runtime and another Sol owns the editor. Luna owns
editable examples and concise tutorials. The integration owner handles document/session
integration, instance scope, cross-lane review, and browser acceptance. Shared interfaces
are agreed before parallel edits; no worker commits or deploys independently.
