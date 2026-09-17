# Blockly authoring and local robotics program execution

Research date: 2026-09-14. Scope: research and architecture proposal only; no robotics implementation, dependencies, deployment, or runtime testing performed. Primary sources below were retrieved on this date. Repository observation is limited to `package.json` and filenames at commit `8fd02590eae9f4073e1007e8dbe183f3ff7de138`: React 19.2.7, Vite 8.1.5, Three 0.185.1, React Three Fiber 9.6.1, React Three Rapier 2.2.0, Zustand 5.0.14; no Blockly dependency in that manifest. Everything described as Brickgineers behavior below is proposed, not verified existing behavior.

## Recommendation

Use current Blockly for the visual editor and a small, portable, typed robotics intermediate representation (IR) interpreted locally by trusted application code. Treat autonomous routes and programmed live controls as two first-class program forms sharing sensor, motor, time, and cancellation semantics. A learner must be able to change what holding a key or moving a joystick does, combine that input with a sensor, and see why the resulting motor command changed.

Blockly supplies the block workspace, connections, rendering, and authoring infrastructure. It does not supply Brickgineers' programming language, robotics scheduler, vehicle model, safety rules, or project persistence contract. Its documentation explicitly leaves execution to the application. [What is Blockly?](https://docs.blockly.com/guides/get-started/what-is-blockly/), [Generate code](https://docs.blockly.com/guides/get-started/code-generation/).

This choice requires implementing a modest language runtime, but keeps the difficult rules visible and testable: bounded work, which input sample a block reads, whether a wait stops a motor, how two scripts interact, and what Stop cancels. It also avoids a per-run AI or cloud compute charge. Browser computation, downloaded assets, and optional project storage still have ordinary costs.

## Current Blockly findings and fit

| Area | Verified upstream capability | Proposed Brickgineers use and remaining work |
|---|---|---|
| Version and stewardship | The live release page identifies **13.3.0**, released September 10, 2026, as latest. The current project is maintained under Raspberry Pi Foundation. | Pin a released version and matching plugins after an integration spike. Do not choose v12 because of stale search snippets or build against upstream `main`. |
| License | The tagged repository has an Apache-2.0 license. | Retain required license/notice material; record third-party assets/plugins separately. This is not a requirement to brand the editor as Scratch. |
| React | Blockly is an imperative web library, installed through npm; its starter is not a React framework. React documents integrating external widgets through effects and cleanup. | A narrow React component owns a DOM container and one Blockly workspace. Use refs, initialize once per mounted instance, dispose/remove listeners on cleanup, and handle Strict Mode's extra development setup/cleanup. React 19 compatibility here is a proposed integration pattern, not a tested claim. |
| Blocks | Custom block definitions, input checks, fields, extensions, and code generators are supported. | Define domain types and a compiler for the selected block vocabulary. A puzzle connection check helps editing but does not replace runtime schema validation. |
| Toolbox | JSON/XML toolboxes and programmatically generated dynamic categories are supported. | Prefer JSON and a small initial toolbox: Events, Controls, Drive, Sensors, Logic, Numbers, Variables. Device dropdowns reference stable machine component IDs. |
| Theme | Themes support block/category/component colors and fonts; renderer customization controls shape. | Apply the warm Brickgineers palette through a theme. Preserve readable contrast, category text, focus indicators, and standard recognizable block shapes. Avoid a renderer fork initially. |
| Persistence | JSON workspace serialization is recommended; XML is legacy and receives no new features. Custom serializers can retain plugin state. | Save Blockly JSON as editable source inside an application-versioned project. Store device bindings and language version alongside it; compile/validate before Run. |
| Accessibility | Blockly v13 advertises keyboard navigation and screen-reader support enabled by default; the old navigation plugin should be removed on upgrade. | Audit the whole app, custom fields, focus transition to driving, run controls, and sensor descriptions. Upstream support does not certify this app. |
| Touch | Blockly has mouse/touch/pointer handling that tracks one active gesture stream. | Test block drag, toolbox scrolling, zoom, and resize on target touchscreens. Give driving its own touch controls; don't assume Blockly gestures implement a multi-touch vehicle controller. |
| Performance | Upstream 13.3.0 includes performance and drag/focus fixes, but no source establishes a useful block-count/frame-rate guarantee for this app. | Profile Blockly beside the 3D simulation on actual classroom Chromebooks. Lazy-load the coding panel, debounce saves/compile, suppress UI-only dirty events, and avoid serializing the workspace or rerendering React at physics frequency. |

Sources for the table: [13.3.0 release](https://github.com/RaspberryPiFoundation/blockly/releases/tag/blockly-v13.3.0), [tagged license](https://github.com/RaspberryPiFoundation/blockly/blob/blockly-v13.3.0/LICENSE), [npm setup](https://docs.blockly.com/guides/get-started/get-the-code/), [React effects and external widgets](https://react.dev/reference/react/useEffect), [custom blocks](https://docs.blockly.com/guides/create-custom-blocks/overview/), [toolboxes](https://docs.blockly.com/guides/configure/toolboxes/toolbox/), [dynamic categories](https://docs.blockly.com/guides/configure/toolboxes/dynamic/), [themes](https://docs.blockly.com/guides/configure/appearance/themes/), [serialization](https://docs.blockly.com/guides/configure/serialization/), [accessibility](https://blockly.com/accessibility), [keyboard navigation](https://docs.blockly.com/guides/configure/keyboard-nav/), [touch reference](https://docs.blockly.com/reference/blockly.touch_namespace/).

For a resizable split view, observe the container's dimensions and call Blockly's resize API when the actual panel changes size; window resize alone misses drawer/splitter changes. Do not repeatedly destroy/recreate the workspace on changes to robot state. Blockly documents `Blockly.svgResize(workspace)`. [Resizable workspace](https://docs.blockly.com/guides/configure/resizable/).

Keep motor/sensor menus bound to component IDs, displaying student-friendly names such as “Left motor” and “Front distance sensor.” If the learner deletes a sensor or changes the build, preserve the referring block visibly with a repair prompt. Silently rebinding it to a different sensor would change the program. While a program runs, hold an immutable compiled revision; edits produce the next run revision. Initial release should use Stop → edit → Run, with no live mutation of an executing AST.

## Why not adopt all of Scratch or MakeCode?

| Option | Real advantage | Cost or mismatch for this product | Judgment |
|---|---|---|---|
| Blockly + typed robotics IR | Custom UI and domain, small explicit language, no runtime AI, direct block-to-operation debug mapping | Must build scheduler, validation, debug tooling, and program migrations | Best initial fit for embedding inside the existing builder |
| Blockly → JS-Interpreter | Existing sandboxed ES5 interpreter with stepping and async host APIs | JS semantic steps differ from blocks; robotics scheduling, actuator arbitration, budgets, sensor contracts, and source mapping still needed | Credible alternative if editable JavaScript becomes a firm near-term requirement |
| Scratch VM / editor | Mature events, threads, loops, variables, serialization ecosystem and familiar pedagogy | Sprite/target semantics and a larger editor/runtime integration; current licensing deserves explicit adoption review; custom robotics still needs adapters | Choose only if Scratch project compatibility or a Scratch-based product is an explicit goal |
| MakeCode/PXT custom target | Blocks + typed text, async runtime and debugger, custom APIs and simulator target architecture | Owning a PXT target/editor toolchain is materially larger than mounting a Blockly panel; existing builder integration remains work | Stronger if future hardware targets and blocks↔text are defining requirements |

Blockly's execution guidance warns against production `eval` and points to JS-Interpreter. Its generator can insert block highlighting and loop traps, but a finite loop counter by itself cannot distinguish a deliberately long-running rover controller from runaway computation. [Generate and run JavaScript](https://docs.blockly.com/guides/app-integration/running-javascript/).

JS-Interpreter supports ES5, individually stepped execution, and asynchronous native API wrappers. Its serialized execution state is not guaranteed compatible across versions and carries substantial overhead. Therefore even choosing it would not remove the need for a versioned source format and application scheduler. [JS-Interpreter documentation](https://neil.fraser.name/software/JS-Interpreter/docs.html).

Scratch's standalone VM repository was archived June 10, 2026 and directs consumers to the `scratch-editor` monorepo and `@scratch/scratch-vm`. The current VM manifest observed during this research declares version 15.1.1 and `AGPL-3.0-only`; do not rely on older descriptions of permissive Scratch package licensing. The engine has running, promise-wait, yield, yield-tick, and done states; its sequencer uses a time budget. These are useful architectural references, not a claim that Scratch's scheduling would provide deterministic robotics automatically. [Migration notice](https://github.com/scratchfoundation/scratch-vm), [current package](https://github.com/scratchfoundation/scratch-editor/blob/develop/packages/scratch-vm/package.json), [thread states](https://github.com/scratchfoundation/scratch-editor/blob/develop/packages/scratch-vm/src/engine/thread.js), [sequencer](https://github.com/scratchfoundation/scratch-editor/blob/develop/packages/scratch-vm/src/engine/sequencer.js).

PXT is MIT-licensed and uses a TypeScript subset. It supports custom APIs, Blockly and text editing; a custom target includes API libraries, simulator, and configuration. Its async design gives learners sequential-looking operations while the runtime cooperatively waits. That is appealing if Brickgineers becomes a hardware-connected programming environment, but is more infrastructure than this first browser robotics layer needs. [PXT repository](https://github.com/microsoft/pxt), [target creation](https://makecode.com/target-creation), [async and threads](https://makecode.com/async).

Gears is especially relevant nearby prior art: a browser educational robotics simulator using Blockly, Skulpt, Babylon.js, and Ammo.js, with EV3-oriented APIs and GPLv3 licensing. It demonstrates that block authoring, interpreted programs, and a simulated robot can be combined without a per-run AI service. Study its teaching and simulator interaction patterns; it is not a drop-in React/Three/Rapier layer and this report does not recommend wholesale code integration. [Gears primary repository](https://github.com/QuirkyCort/gears).

## Proposed language and runtime boundary

Use this pipeline:

`Blockly workspace JSON → structural/type/device validation → typed IR → bounded interpreter → command intents → actuator arbiter → simulation adapter`

Inputs flow back as immutable snapshots:

`browser input + machine sensor readings + simulation time → tick snapshot → interpreter`

The IR contains only known data opcodes: literals, typed variable reads/writes, arithmetic/comparison, conditions, counted loops, controlled repeat, waits, event entry points, motor commands, sensor/input reads, procedures if supported. It contains no JavaScript strings to execute, arbitrary property names to call, dynamic module loads, DOM handles, callbacks supplied by project data, network requests, or application store references. Each operation retains its originating Blockly block ID and stable script ID.

Type distinctions should include Boolean, Number, Duration, Angle, Distance, normalized Axis, normalized MotorPower, MotorRef, and SensorRef. Start with clear units in block labels and fields; the precise internal unit system must match the simulation adapter. Validate finite numbers and ranges at compile time where possible and again at the command boundary. Distinguish “distance sensor has no hit within range” from “sensor missing/unavailable”; invalid input must not become infinity and accidentally mean “safe.”

### Grade 3/4+ entry and imaginative machine capabilities

The user's frequent SPIKE use and intended grades 3+ or 4+ favor familiar start hats, clear word blocks with supportive icons, direct motor/sensor names, and short starter stacks. This is a product recommendation based on the user's clarification, not a researched claim of curricular or SPIKE-project compatibility. Begin with “when controls update → drive with arrows at 50%,” then let learners open the underlying throttle/steering logic. An optional beginner toolbox can expose fewer blocks without changing stored language semantics; progressively reveal conditions, variables, and sensor overrides. Icon-only controls still need accessible text labels. Avoid building a separate icon language before observing a need in classroom rehearsal.

The IR should describe **machine capabilities**, not hardcode every actuator as rover-left/rover-right. A versioned device manifest can advertise supported commands, units/ranges, ownership groups, sensors, and its stop policy. Differential drive is one adapter. A claw can accept a bounded position/open command; a turntable can accept angular velocity; future thrusters can accept bounded thrust; an explicit levitation module can accept target hover height. Unsupported blocks stay visible but disabled with an explanation when a module is absent. Imaginative modules still follow the same cancellation, rate, input, ownership, and versioning contracts.

Turbo can initially be a learner-programmed speed multiplier or a defined temporary boost capability with duration/cooldown parameters. Flight and levitation need distinct simulation adapters and understandable force/energy rules, but do not require replacing the Blockly/runtime architecture. “Stop” for a flying/hovering machine must declare whether it freezes the local simulation, cuts thrust, or enters a supported stabilize/land behavior; the rover-specific brake semantics below cannot be generalized by name alone. Keep these optional modules behind the capability boundary rather than requiring flight physics in the first rover milestone.

Persist `projectSchemaVersion`, `languageVersion`, `blockCatalogVersion`, Blockly workspace JSON, stable device bindings, program revision, and a robot/build revision or content hash. Blockly's version is useful diagnostic metadata, not the language version. Compiled IR can be cached by source/compiler/robot revision but is derived data. Validate imported projects before allowing expensive workspace construction; cap JSON bytes, nodes, strings, nesting, and allowed block types. Loading never automatically starts a program. Preserve the original document before migration; unknown future versions should offer recovery/export rather than partially executing.

## Three distinct ways to operate a machine

1. **Manual drive:** built-in controls produce motor intents through the same arbiter. Useful before coding and for testing the build.
2. **Programmed live controls:** the learner's blocks transform current keys/axes plus sensors into motor intents, continuously. Built-in manual drive must not simultaneously fight this program for the same motors.
3. **Autonomous program:** a Run/Start script carries out actions, waits for time/sensors, and can loop or respond to events. The same input blocks may allow pause, mode switching, or speed adjustment later.

Choose mode explicitly, and Stop/reset intents when changing it. “When Up pressed → drive forward” alone is insufficient for live controls: it lacks reliable release behavior, combines poorly with diagonal input, and is sensitive to keyboard repeat. Expose both edge-trigger events for one-time actions and sampled key-down/axis values for continuous control.

### Tick semantics

Proposed first target: one control evaluation per fixed physics tick (for example 60 Hz if the simulator uses 60 Hz). This rate is a proposed starting point, not a measured classroom performance result. The simulation clock owns time; rendering FPS and browser timer frequency do not define program progress.

For tick N:

1. Capture latest logical input state and sensors from the world after tick N−1, with tick number and sensor-validity flags.
2. Process queued input edges in stable order; update program state through bounded event handlers.
3. Advance autonomous runnable fibers in stable script/creation order within a fixed instruction quota.
4. Evaluate the single live-control root, when in that mode, from one coherent snapshot.
5. Evaluate non-yielding safety rules; resolve all command intents once.
6. Apply one validated command per motor/drive group and advance physics one fixed step.
7. Emit a compact debug/sensor view at a lower UI rate.

Within the control root, assignments are sequential and local; all input/sensor reads see the same tick snapshot. The root runs once and returns. It cannot contain wait, unbounded repeat, or blocking turn-by-angle. Permit bounded loops only when their cost is statically limited; begin without them if they complicate teaching. If a control evaluation exceeds its quota, discard its partial output and stop that machine with the offending block highlighted. Do not spread one control evaluation over many physics ticks and then apply stale steering.

Autonomous scripts are explicit interpreter fibers with a program counter, stack, locals, and states such as ready, waiting until tick, waiting for sensor predicate, waiting for motion completion, done, cancelled, or errored. A wait suspends that fiber; it never busy-spins or blocks rendering/physics. A repeat-forever loop has a mandatory scheduler yield at its back edge. Other loops are instruction-budgeted as well. One script cannot monopolize the tick just because it omits a visible Wait block.

Bound program nodes, expression depth, stack/call depth, variables/list capacity if supported, active fibers, event queue, commands and debug output. A reasonable **prototype budget to measure**, not a final limit, is 1,000 blocks, 32 nested expressions/calls, 16 active fibers, 128 queued edges, and 5,000 simple IR operations per control tick. Keep every primitive bounded; an operation quota is meaningless if one opcode can perform an unbounded allocation, regex, sort, or host call. Exclude recursion and unbounded strings/lists initially.

Use an operation quota for repeatable semantics; an additional elapsed-time watchdog may fail-stop on overload. The watchdog must not silently alter the program's logical result to fit a frame. A legitimate yielding forever controller can run indefinitely; detect excessive work per tick, not total program lifetime. At quota exhaustion, autonomous fibers yield fairly; repeated inability to make progress should surface a student-readable error. Avoid accumulated simulation catch-up after a suspended tab: pause, clear held inputs, and require deliberate Resume/Run.

### Inputs and event rates

Map keyboard, gamepad, and on-screen controls to logical actions such as `forward`, `backward`, `left`, `right`, `boost`, `throttle axis`, and `steering axis`. This allows a saved student program to work across input devices without hardcoding a particular controller's axis indices. Browser key repeat is separately exposed, and gamepad state is obtained by polling current gamepads. [Keyboard repeat](https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/repeat), [Gamepad input](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API).

Latch key-down state on keydown/keyup; ignore repeat when generating press edges. Coalesce continuous axis changes to the latest sample per tick instead of spawning scripts on every browser event. Normalize axes, apply a documented deadzone, and provide remapping for controllers that lack standard mappings. A press event is a false→true transition; a release is true→false. Touch pointer cancel/lost capture, gamepad disconnect, window blur, and hidden tab clear active controls. Require the drive surface to own focus so Blockly keyboard navigation, text fields, camera navigation, and rover steering do not all react to the same keys.

Event handlers need explicit reentrancy: initially allow at most one running instance per hat, coalesce an additional trigger into at most one pending instance, and display missed/coalesced triggers when debugging. Short mode/speed-changing handlers should finish in the tick. Do not accumulate repeated key events into hundreds of delayed turns. An initial simpler vocabulary can prohibit waits inside input event handlers, leaving yielding actions in autonomous start scripts.

## Motor ownership, Stop, wait, and turn semantics

The runtime produces intentions; only the simulation adapter writes motors. Use one owner per motor or drive group in each operating mode. A beginner live-control program has one control root writing the drive group. For autonomous work, start with one motion-writing script per drive group; reject conflicting parallel writers at compile/run start where identifiable. Separate accessories such as a claw can have separate owners. Adding arbitrary parallel scripts should not silently introduce “whichever ran last wins.”

Two writes inside the same sequential control evaluation intentionally use the later value, allowing an if-condition to override an earlier speed. Independent script conflicts are errors or require an explicit higher-level ownership block in a future advanced mode. A safety rule has higher priority than normal motion; an application Stop/error has the highest priority. Safety rules can restrict/brake a normal command and cannot increase its requested magnitude. Show the resolved command's source and reason so students see “requested 70%; braking because front sensor < 20 cm.”

| Operation | Proposed precise meaning |
|---|---|
| Set left/right drive power | Set normalized signed power, each clamped to −100…100%. Positive means calibrated forward; different motor mounting directions are resolved in the device adapter. A percentage is motor demand, not a guarantee of meters per second. |
| Set drive power then wait | The autonomous owner retains its commanded drive state while its fiber waits. The scheduler refreshes the owner command while the run is healthy, so the motors keep running. Safety can still override it. |
| Wait 1 second | Suspend the fiber for simulation time; physics and other eligible scripts continue. Does not imply stop. |
| Wait until sensor condition | Reevaluate predicate once per tick from fresh sensor samples; suspend while false. Provide a timeout branch/default fail-stop and treat an unavailable sensor explicitly. |
| Drive for 1 second | Convenience operation: command drive, wait one simulation second, brake/release that drive intent on completion or cancellation. |
| Brake drive | Apply the simulator's documented braking action; zero command does not mean instantaneous zero velocity. |
| Coast drive | Remove drive torque/effort and allow inertia/friction. Separate block if the simulator supports this distinction faithfully. |
| Turn left at 40% | Ongoing differential drive command; it continues until changed/stopped. It is not “turn 90 degrees.” |
| Turn left by 90 degrees | Autonomous motion primitive owning the drive group until accumulated signed yaw reaches target within tolerance. Requires sensor/odometry support, angle-wrap handling, timeout and stall detection; cannot run inside a non-yielding control tick. |
| Stop this script | Cancel that fiber and release/brake actuators it owns; does not automatically kill unrelated accessory owners. |
| Stop all / UI Stop | Cancel every fiber, invalidate run ID, drop pending events, clear held inputs and retained commands, brake all machine actuators. Old callbacks/worker messages cannot restart motors. |
| Reset | Stop first, restore a documented starting machine/world pose and runtime variables. Preserve the editable program. |

Paused debugging must freeze simulation time and physics together. Pausing only the interpreter while motors keep moving produces confusing and potentially large world changes. Normal Resume can retain the stopped debug snapshot; switching modes, reload, lost input focus, or worker failure follows the explicit safe stopped-state policy instead.

For worker-backed execution, every result includes `runId`, `programRevision`, `robotRevision`, and `tickId`. Validate all four before applying it. Stop invalidates the run locally before requesting worker shutdown; stopping the worker alone does not erase an already-applied drive target. A bounded command lease/heartbeat prevents a worker fault from retaining drive forever. This browser simulation policy is not a certification for physical robots; physical hardware would need an independent firmware watchdog and transport-specific safety design.

## Illustrative student programs

The following is **proposed block-language pseudocode**, not Blockly's built-in API and not implemented or executable source. All referenced inputs, units, devices, and block behaviors are defined in this report.

### Custom keyboard steering with an obstacle override

```text
when controls update                         // exactly once per control tick
  set throttle to 0
  if [forward is held]  change throttle by 60
  if [backward is held] change throttle by -40

  set steering to 0
  if [left is held]  change steering by -30
  if [right is held] change steering by 30

  set leftPower  to clamp(throttle + steering, -100, 100)
  set rightPower to clamp(throttle - steering, -100, 100)

  if [front distance is unavailable]
    brake drive
  else if [front distance < 20 cm] and
          [(leftPower > 0) or (rightPower > 0)]
    brake drive
  else
    set drive [leftPower, rightPower]
```

In this calibrated differential-drive convention, positive steering turns right: the left wheel is commanded faster than the right. Up+Right requests left=90%, right=30%. Holding neither key requests zero power; explicitly choose the adapter's zero-command behavior, or use a brake branch if the lesson promises braking on release. Left alone requests an in-place left turn. Holding opposing keys follows visible arithmetic (forward and backward here produce +20% because their magnitudes differ); a lesson that wants opposite keys to cancel should use a dedicated normalized axis block or explicit conflict condition.

The obstacle branch conservatively blocks any command with a forward-moving wheel; it allows straight reverse but blocks pivoting near the obstacle. It does not promise geometric collision avoidance, side/rear sensing, or enough stopping distance at arbitrary speed. Changing the 20 cm threshold or reverse power is genuine programmed control. No browser repeat events or per-run AI are involved. Each tick evaluates one branch and publishes one resolved drive command.

For a joystick version, replace key arithmetic with `throttle = -60 × left stick vertical` and `steering = 30 × left stick horizontal`, after axis normalization/deadzone. The learner can add a boost button, speed cap, steering sensitivity, or sensor-conditioned steering through the same vocabulary.

### Separate visible safety rule, when that concept is introduced

```text
when controls update
  set drive from [throttle axis × 70%, steering axis × 35%]

safety rule [front obstacle]
  if [front distance is unavailable] or
     ([front distance < 20 cm] and [requested drive has forward motion])
    brake drive
```

The safety root is a restricted non-yielding rule evaluated after normal control. Its brake wins even if the normal script wrote power later in workspace display order. It evaluates every tick and releases its override when its predicate becomes false; normal drive is recalculated then. “Requested drive” is a special typed read of the normal command staged for this tick, not a stale physics velocity or global last-write value. A later curriculum can introduce hysteresis (enter at 20 cm, release above 25 cm) to reduce threshold chatter.

### Motors keep running while a sensor wait yields

```text
when Run starts
  set drive [35%, 35%]
  wait until [front distance is valid and front distance < 25 cm]
    sensor unavailable -> [brake drive; stop this script]
    timeout [8 seconds] -> [brake drive; stop this script]
  brake drive
```

The drive request remains active while this fiber is waiting; sensor tests and physics advance each tick. If the condition is satisfied, the following brake executes before the next physics step. If the timeout wins, the timeout branch brakes and cancels the script, so success continuation does not also run. If the program is stopped or errors, the drive owner is revoked immediately. Define simultaneous condition/timeout explicitly: proposed rule is valid condition first, timeout second at the same sampled tick. Sensor loss should take the unavailable-sensor fail-stop path rather than waiting the full timeout with blind motion.

## Main thread or Web Worker?

Start with a pure, bounded interpreter that can run in either environment. For an initial single-machine prototype, run it immediately before the fixed physics step on the main thread: there is no message latency and the sensor→control→physics order is straightforward. This recommendation depends on a deliberately restricted language whose interpreter and host primitives are bounded. Profile the result alongside Blockly and rendering; move the scheduler to a dedicated worker if measured main-thread work warrants it.

A Web Worker improves fault containment and allows termination, but is not by itself a security sandbox: workers have APIs such as script import and networking, and worker CSP has its own behavior. Arbitrary project JS evaluated in a worker therefore remains an unacceptable default. The protection comes from interpreting an allowlisted IR with bounded trusted code and exposing only validated data messages. [Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers).

Worker adoption must choose a clock contract. Preferred correctness-first version: request one control tick with a snapshot, wait asynchronously for its result, then advance physics; never block the browser thread with a synchronous wait. Wall-clock motion may slow if overloaded but no physics tick consumes an accidental late command. A faster pipelined design may deliberately apply tick N output at tick N+1, but that one-tick latency must be documented and tested. Do not apply results merely on arrival, allow queues to grow without bounds, or claim determinism while worker timing changes which command wins.

Keep Blockly and Three scene objects on the main thread, serialize small sensor/input snapshots, and send one batched command response per tick. Do not mirror the whole scene or Zustand store. Worker crashes/timeouts invalidate the run and brake through the main-thread arbiter. Performance numbers and the threshold for moving to a worker require a prototype and target-device measurements; no benchmark was performed for this report.

## Debugging, errors, and release evidence to require later

Expose Run, Stop, Reset, Pause, Step block, and Step simulation tick with distinct meaning. Step block evaluates a semantic block and stages its output without advancing physics; Step tick finishes scheduled work, commits commands, and advances one fixed step. A waiting block remains visibly waiting with elapsed simulation time and live condition values. Highlight the current block, show input snapshot and resolved motor values, and state override/conflict reasons. Throttle visual highlighting so the block workspace does not become the frame-rate bottleneck.

Deterministic runtime replay requires saved initial state, program/compiler version, fixed tick duration, input edges/axis samples assigned to ticks, seeded randomness if offered, and stable scheduler order. This establishes repeatability of control decisions; exact cross-device physics replay is a separate physics-engine question and is not established here. Avoid wall-clock time, random host calls, and nondeterministic callback order in language semantics. Save optional traces separately from editable projects and never resume a persisted active motor command on reload.

Student-facing errors should name the block and recovery: “Front sensor was removed; choose a sensor,” “This controls stack takes too long; simplify it,” “Two scripts control the left motor,” or “The turn did not finish in time.” Preserve the program and stop the affected machine on runtime faults. Diagnostics should distinguish unknown block/type mismatch at compile time from invalid sensor input, stalled motion, quota exhaustion, and transport failure during execution.

Before implementation can be considered classroom-ready, meaningful verification should demonstrate:

- Holding/releasing Up, diagonals, opposite keys, joystick deadzone and disconnect, touch pointer cancellation, editor focus changes, and browser blur all have the documented outcomes.
- A learner can change speed/steering behavior in blocks and observe the changed live controls after a new Run.
- A safety rule wins over a simultaneous normal write independent of visual stack position, and the UI explains it.
- A sensor wait permits continuing motion and fresh sensing; timeout, unavailable sensor, Stop, error, reset, and old async completion all brake/revoke correctly.
- An empty forever loop, deeply nested input, malformed imported JSON, event storm, and excessive debug output cannot freeze the page or bypass command bounds.
- Save → reload → edit → Run retains block layout, variables, component bindings, units, and program version without silently resetting the build or starting motion.
- Block/tick stepping yields repeatable control outputs from a recorded input trace; physics repeatability is evaluated separately.
- Keyboard/screen-reader and touch rehearsal covers the combined builder/editor/drive flow, including custom fields and actual classroom devices.

These are proposed acceptance tests, not tests run during this research. The highest-risk decisions to settle in a small later spike are control-loop scheduling, sensor validity/units, motor ownership and stop semantics, Blockly panel lifecycle under React 19, and combined 3D/editor performance on the slowest intended Chromebook.
