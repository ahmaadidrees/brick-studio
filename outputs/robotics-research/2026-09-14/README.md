# Brickgineers robotics: research synthesis and proposed direction

September 14, 2026. Six GPT-6 Astra research lanes, synthesized by Codex. A separate GPT-5.6 Luna lane implemented the landing simplification, followed by Codex review. This document proposes robotics work; none of the new robotics capabilities described here have been implemented or deployed.

User context: frequent LEGO Education SPIKE use; grades 3 and up, probably grade 4 for independent entry; strong interest in Scratch-style blocks, customizable robots, student-programmed driving, classroom control over free driving, and imaginative turbo/flight/levitation pieces. Preserve guest building and the current warm virtual Toy Room identity.

## Recommendation

Develop an optional **Robot Workshop** inside Brickgineers, powered by a small common system of programmable components. Its first creation is a customizable rover; its architecture must also express a stationary sensor/light machine and a future hover module. A robot does not have to have wheels, a seat, a driver, or a route.

The distinctive product experience should be: students build their environment, construct something that acts within it, invent its behavior, and share the result. Keep the familiar Build/Explore product intact. Enter Robot Workshop through a creative action, then present Build / Drive / Code as contextual tools for the selected machine.

Use Blockly for the block workspace. Define our own deliberately small robotics language and bounded local interpreter. Keep the current Three/R3F/Rapier rendering and physics stack. Extend persistence explicitly, and defer shared running until authority, stop, and reconnect behavior are proven.

The immediate next technical step should demonstrate a rover driving through an **actual existing Brickgineers creation**, including a turn, wall, ramp, narrow passage and reset. The physics choice must support that experience. A flat ideal-drive harness remains useful for testing programming semantics, but is not proof that student-built terrain works.

## What the research establishes

- **Blockly is a suitable authoring foundation, not the complete robotics engine.** It supports custom blocks, themes, workspace serialization and execution highlighting. We still need execution semantics, component bindings, motor ownership, debugging, policy and safe persistence. Blockly recommends JSON serialization for new projects and warns against production eval. [Serialization](https://docs.blockly.com/guides/configure/serialization/), [execution guidance](https://docs.blockly.com/guides/app-integration/running-javascript/).
- **Programming live controls is legitimate robotics work.** Official VEX controller APIs expose button events/states and joystick values. A student's program can transform that input and combine it with sensors instead of following a fixed route. [Controller blocks](https://api.vex.com/v5/home/blocks/controller.html).
- **There is relevant prior art.** Gears combines a customizable robot/world, Blockly and Python-oriented simulation; VEXcode VR emphasizes structured programming activities with supplied virtual robots; Open Roberta exposes a range of robot targets and simulations. These demonstrate useful patterns, not a need to replace this app. [Gears](https://github.com/QuirkyCort/gears/wiki), [VEXcode VR](https://www.vexrobotics.com/vexcode/vr), [Open Roberta](https://www.open-roberta.org/features/).
- **Engagement is not the same as learning.** The classroom researcher found both promising virtual-robotics evidence and a 2025 physical-robotics comparison where motivation improved while Scratch alone produced stronger programming outcomes. Design for a small observable concept at a time and assess explanation/transfer. See the nuanced evidence table in report 01; do not turn it into a claim that Brickgineers improves learning.
- **Current source needs a new integration boundary.** The old rover moves on a hardcoded axis and has only speed/stop-on-red program fields. Current document normalization strips unknown robotics fields. Existing avatar pose messages do not establish robot simulation authority. These are source-confirmed findings at 8fd0259; report 06 records exact lines and 132 passing existing boundary tests.

## The most important interaction: program the controller

Treat human input as another input to a robot program, alongside its sensors. Both autonomous motion and live controls end at the same actuator interface.

A first learner program could mean:

```text
When controls update:
  If Forward is held:
    If the front sensor sees an obstacle closer than 3 studs:
      Stop the drive motors
    Otherwise:
      Run both drive motors at 40%
  Otherwise if Backward is held:
    Run both drive motors backward at 25%
  Otherwise:
    Stop the drive motors
```

This is proposed block-language pseudocode. Sensor validity, units, stop behavior and input conflicts must be defined before implementation. It illustrates a useful design task: change speed, reverse behavior or obstacle threshold and test the result. Add turning after the initial input-to-motor connection is clear.

A later program can map joystick steering, add precision mode, drive a gripper from another button, flash a warning near an obstacle, or switch between manual and autonomous behavior. Students are creating a controller and assistance system, not merely memorizing route coordinates.

For the runtime:
- Sample held inputs and sensors at a defined control tick; do not create a new script for every browser key-repeat event.
- Let waits suspend a script while the simulator and sensors continue; define whether a motor command persists.
- Begin with one motion-writing control stack per drive group. Conflicting scripts must not silently win based on display order.
- Clear inputs on blur, touch cancellation and controller disconnect. UI Stop cancels execution and invalidates stale callbacks/messages immediately.
- Keep code edits as the next run revision. Do not replace a running program under the student.
- Show the active block, sensor reading and resolved motor command. Keep advanced telemetry optional.

## Minimal teacher controls

Add one activity-level **Robot controls** choice:

| Choice | Autonomous code | Student-written live controls | Built-in driving |
|---|---:|---:|---:|
| Autonomous only | Yes | No | No |
| Student programs | Yes | Yes | No |
| Free drive + programs | Yes | Yes | Yes |

Recommend **Student programs** as the general classroom default, and Autonomous only for sequencing/sensor missions. Add one **Stop all robots** action with visible acknowledgements. Changing a setting preserves work. Restart after a stop or lost control requires an explicit action.

Enforce the choice in the input/runtime and server control-authorization paths, not only by hiding buttons. Keyboard, touch, gamepad, boarding and any other operator channel follow the same rule. Camera navigation and execution Stop remain available. A simulated bumper or color sensor is a robot observation, not a covert human control channel.

Keep existing group management for removing a participant; do not add a per-student matrix of robotics switches initially. One person controls a shared robot at a time, with visible handoff. Teammates can stop a run and participate in coding/building.

These restrictions govern the managed class activity. Preserving a public guest builder means they cannot prevent a student opening another public tab. Likewise, browser-hosted cooperative physics cannot prove that a tampered client actually ran the permitted code. Do not use that model for trusted competitive scoring or automatic certification of program execution. Server-authoritative simulation is a later requirement if that level of enforcement is needed.

Avoid minimum block counts or automatically unlocking free driving after superficial edits. Use **explain → change → retest**: point to the rule, predict a change, modify it, demonstrate the result.

## A broad parts system with a focused first catalog

Use stable device IDs and reusable capabilities with units, ranges, mounting direction, sensing geometry, and supported stop behavior. Friendly names such as “Front sensor” can change without breaking the program. A missing component leaves its block visible with a repair instruction.

| Stage | Parts and creations | Value |
|---|---|---|
| First rover | Chassis, paired motors/wheels, motor rotation reading, distance sensor, operator input, ordinary decorative bricks | Autonomous movement, controller design, obstacle feedback |
| Early breadth | Bumper, downward color/reflectance sensor, signal light, buzzer, bounded hinge | Smart crossings, line following, alarm doors, music, drawbridges |
| Mechanism growth | Steering axle, gripper/fork, slider/lift, ideal gearbox, pen, messages | Delivery vans, sorting machines, cranes, drawing robots, coordinated stations |
| Future Lab | Turbo, hover pod, thruster, stabilizer, magnetic pickup, tractor beam, energy dock | Flying deliveries, rescue hovercraft, space salvage, programmable attractions |

This is a staged candidate catalog, not a commitment to ship all rows together. Prove that every functional part changes behavior. Decorative gears should not imply a working transmission; an encoder should measure shaft rotation, not secretly return true world distance; a distance sensor must sense from its mounted location.

One early imaginative showcase is valuable. **Turbo** is the smaller experiment: consistent charge/cooldown plus a declared boost behavior. **Assisted hover** is the richer next experiment: target clearance above detected ground, readable height feedback, lift limits and clear “no ground in range” behavior.

Keep fictional modules openly fictional, with understandable repeatable rules. Use charge units for invented energy rules; do not label them joules without a physical model. A stabilizer is a visible assistance controller. Later students can replace that assistance with their own feedback logic.

Good Future Lab challenges:
- Program a delivery rover to reserve boost for the uphill section.
- Make a hover ambulance maintain clearance over changing terrain.
- Build a magnetic crane that releases only over the matching bin.
- Program a flying courier to land when charge drops below a threshold.
- Design an airlock or drawbridge that refuses to open while occupied.
- Create a robot band or kinetic sculpture whose movements respond to buttons and sensors.

Flight requires a separate motion adapter, camera/recovery treatment and validated performance. Global classroom Stop should pause/freeze the simulation, while an in-program “cut thrust” or “land” action has its own explicit meaning. Rover braking semantics cannot silently stand in for all machines.

## Fit for SPIKE classes and grades 3/4+

Use familiar start events, motor ports/names, straightforward motion values, wait/repeat/if, and sensor reporters. Use icons with short words, consistent units and a visible front arrow. A small beginner toolbox should use the same underlying language as advanced programs.

Recommended entry:
1. **Courier:** run a short sequence, change one meaningful value and deliver to a moved destination.
2. **Invent your controller:** write forward/reverse/turn controls, then make them easier for a partner to use.
3. **Smart crossing:** combine input with a mounted sensor so the vehicle responds to a changed world.

For grade 3, provide a complete rover and a small starter program; make appearance optional after the first successful code change. Aim for independent grade-4 entry, with a separate actual grade-3 rehearsal rather than assuming an age guarantee.

A first lesson can be 30–45 minutes: brief mission/demo, one customization, prediction, code change, test/reset, changed target, partner explanation, save/reopen. Report 01 gives timings and a four-dimension rubric. Do not teach camera control, full mechanical assembly and a large coding toolbox simultaneously on day one.

This complements physical SPIKE work through concepts and familiar interaction. It does not yet imply SPIKE file import/export, hardware connection, identical motor calibration or unchanged physical code. Those are separate possible integrations.

## Architecture and performance decisions

Proposed boundaries:

```text
Editable world + machine assembly + Blockly source
                |
         validate and compile
                |
Immutable run snapshot: parts + program + world revision + policy
                |
Inputs and sensors -> bounded program -> actuator commands -> simulation
                |
        live view and debug readings
```

Save authored data, not per-frame robot positions, held keys or physics handles. Reset restores the run baseline without destroying bricks or code. Program-only edits must trigger autosave; simulation ticks must not.

Keep ordinary bricks grouped into rigid bodies, with a separate group only where a mechanical joint actually moves. Never make every decorative brick an individually simulated loose object. Check colliders in assembly-local coordinates and remove robot members from the fixed-world collider set.

Compare a dynamic chassis/raycast drivetrain against the minimum ideal-drive reference. If wheel/step contact remains unacceptable, evaluate real wheel hinges. Current Rapier APIs need installed-version verification: its character controller does not sweep rotation, and the existing wrapper can perform substantial catch-up work after a stall. Bound catch-up and pause explicitly.

Begin with one robot per local test/group run, a measured part/sensor envelope, and the existing dense/mixed 250/500/1,000-brick world fixtures. Proposed acceptance targets include responsive Stop, at least 30fps on the lowest supported Chromebook, bounded control work and repeatable reset; none is an observed robotics benchmark yet.

Local execution avoids a per-run AI charge. Costs remain hosting, assets, saved work and shared-room traffic. Thirty independent devices are a different load from thirty colliding robots in one shared simulation. Persist edits and occasional needed state, not every physics tick.

## Proposed implementation passes and decision gates

1. **Technical vertical slice.** One customized rover, actual-world turning/collision/ramp/reset, one mounted sensor, Blockly panel, autonomous and student-written live controls. Also exercise a stationary sensor/light fixture and a turbo capability stub to expose rover-only assumptions. Compare physics options before committing.
2. **First usable workshop.** Build / Drive / Code flow, small parts tray, program diagnostics, visible sensing, keyboard/touch/focus handling, three small missions. Single-team local trials.
3. **Persistence and classroom policy.** Explicit document/protocol version, old-world compatibility, program-only autosave, exact local/cloud/export/checkpoint round trips, Robot controls selector and Stop all. Prototype lanes 1–2 must never masquerade as durable classroom work.
4. **Shared use.** One operator and one explicit program revision per robot; code editing ownership, policy revision, run epochs, late join, disconnect and handoff. Test through server/storage, not only two screenshots.
5. **Creative expansion.** Color/contact/light/sound + a bounded mechanism, then turbo/assisted hover. Add breadth by meaningful behaviors and classroom evidence, not catalog size alone.

Parallel work is useful after shared contracts are frozen. Suggested implementation team: one integrator plus separate assembly/physics, blocks/runtime, workshop UI, persistence, teacher/shared authority, and lesson/QA lanes. Six to seven workers can be useful when those boundaries exist; adding more workers inside the same scene/store/schema files would create collisions.

## Research package

- [01 Classroom learning](01-classroom-learning.md): primary evidence, SPIKE/grade entry, lesson, rubric, playful futures.
- [02 Blockly and execution](02-blockly-runtime.md): current upstream findings, alternatives, execution semantics, pseudocode, debugging.
- [03 Mechanics and performance](03-mechanics-performance.md): installed API checks, motion models, assembly, sensors, Chromebook experiments, hover.
- [04 Parts and projects](04-parts-and-projects.md): tiered capabilities, nine Future Lab families, 25 challenge ideas.
- [05 Classroom and collaboration](05-classroom-collaboration.md): permissions, authority, stop/reconnect, persistence, explicit cost assumptions.
- [06 Current source audit](06-repo-integration.md): file/line evidence, reuse boundaries, schema gates, 132 existing tests.
- [Earlier concept images](../../robotics-concepts/2026-09-14/index.html): calmer landing, rover workshop, code/test screen.

## Landing implementation status

Implemented in `/Users/ahmaadidrees/.codex/worktrees/brick-landing-simplification`, branch `codex/landing-simplification`, review baseline `7faca51`, with the final header divider refinement in `02e0011`. Preview: http://127.0.0.1:5226/. One primary Start/Continue, three feature cards, teacher invitation, separate information pages, and visible mobile Join. Node22 tests: 15 passed; build passed. Independent review: 16 responsive page/viewport checks, legacy route preservation, homepage draft non-mutation, and actual clicks into the existing teacher-Google and student-enrollment panels. No authentication/account mutations or production deployment. Detailed evidence is in that worktree's `docs/qa/landing-simplification-2026-09-14`.

The remaining product decision is the scope of the first robotics prototype and its classroom rehearsal. The research supports the vision; it does not establish implementation time, hardware performance, security guarantees or learning outcomes without those experiments.
