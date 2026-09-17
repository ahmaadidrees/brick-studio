# Brickgineers robotics: parts, sensor contracts, and creations

Research date: **2026-09-14**. Primary documentation accessed on that date. This is a proposed catalog and product direction, **not an approved MVP, implementation, hardware compatibility promise, or classroom performance result**. Repository inspection was read-only; this research file is the only artifact owned by this lane. Updated for the user's steering: they already use SPIKE frequently, are considering grades 3+ or 4+, and explicitly welcome futuristic parts such as turbos, flight, and levitation.

## Recommendation

Build a small vocabulary of reusable functional parts that students combine into many creations. The core vocabulary is **spin, position, sense distance, sense contact, sense surface, read input, show light, and make sound**. Parts should have visible geometry, orientation, attachment points, and live readings. A sensor should work because of where the student mounts it and what it can physically observe. A programmed building should use the same inputs, outputs, and motor primitives as a rover.

Keep Brickgineers' original warm virtual Toy Room: oversized workshop objects, playful simple geometry, readable sockets, and original toy characters. Use real kit documentation to understand teachable behavior, without copying kit geometry, brand assets, connector shapes, or proprietary lesson content. The existing brand direction was recalled from project memory; current source behavior below was inspected directly.

The most valuable early scope is broader than a rover with a speed slider but smaller than a general mechanics simulator: reusable motors and sensors, configurable live driving, and one reliable articulated mechanism. Treat large part counts as variations of proven capabilities. A lamp, traffic light, illuminated button, and sign can share an output primitive while feeling different in a student's build. Realism should supply useful cause and effect, not limit invention: a fictional hover pod is welcome if students can understand and program its particular rules.

## Evidence from real educational robotics

These are source observations. Proposed Brickgineers behavior and costs in later sections are engineering recommendations, not measured claims about these products.

| Primary source | What it establishes | Useful design lesson |
| --- | --- | --- |
| [VEX IQ Smart Motors](https://kb.vex.com/hc/en-us/articles/360035592972-Coding-with-VEX-IQ-Smart-Motors) | Internal encoders report shaft position and speed. Motor commands distinguish continuing motion from commands that wait for a target. Timeouts address targets an arm or claw cannot reach. | Expose rotation feedback; make command completion and failure visible. |
| [VEX IQ distance sensor](https://kb.vex.com/hc/en-us/articles/4407296307348-Using-the-IQ-Distance-Sensor-2nd-gen) | Distance is measured forward from the sensor using a narrow field of view. The documented range is 20–2,000 mm; reported object size is approximate. | Distance sensors have direction, range, and uncertainty; they do not know every nearby object's identity. |
| [LEGO Education color-sensor specification](https://assets.education.lego.com/v3/assets/blt293eea581807678a/blt62a78c227edef070/5f8801b9a302dc0d859a732b/techspecs_techniccolorsensor.pdf) | Color, reflectivity, and ambient light are distinct measurements. The specification gives 16 mm as an optimal reading distance, dependent on the target. | Close surface sensing is different from camera vision. |
| [VEX IQ optical sensor](https://kb.vex.com/hc/en-us/articles/4407229044500-Using-the-IQ-Optical-Sensor) | Color sensing works best close to the target; proximity from reflected IR varies with reflectivity and ambient light. A clear view is necessary. | Teach mounting and obstruction; do not present proximity intensity as exact centimetres. |
| [VEX bumper switch](https://kb.vex.com/hc/en-us/articles/360035955091-Using-the-VEX-IQ-Bumper-Switch) | A switch reports pressed/released and can detect a wall or the robot's own arm. | Local contact sensing supports vehicles and mechanism limit switches. |
| [VEX inertial data](https://kb.vex.com/hc/en-us/articles/4409666542100-Understanding-Inertial-Sensor-Data-from-the-VEX-IQ-2nd-gen-Brain) | Heading wraps; accumulated rotation does not. The sensor also reports orientation, acceleration, and angular rates. Heading can be reset to a new reference. | Keep angle, total turn, and rate separate; calibration changes the reference. |
| [MakeCode compass](https://makecode.microbit.org/reference/input/compass-heading) and [acceleration](https://makecode.microbit.org/reference/input/acceleration) | Compass heading uses a magnetometer; acceleration is reported in milli-g and includes a nonzero gravity-related resting measurement. | A gyro is not a magnetic compass, and an accelerometer does not directly measure speed or position. |
| [MakeCode servo write](https://makecode.microbit.org/reference/pins/servo-write-pin) and [continuous-servo run](https://makecode.microbit.org/reference/servos/run) | A standard servo uses an angle target; a continuous servo uses a speed command. | Give these visibly different blocks even if a physical low-level API overloads the same signal. |
| [VEX custom controller code](https://kb.vex.com/hc/en-us/articles/14216995018132-Custom-Controller-Code-in-VEXcode-IQ) | Students can configure direct button mappings or write controller behavior using loops/events, including separate drive, arm, and claw actions. | Live driving and programming naturally coexist. |
| [MakeCode radio values](https://makecode.microbit.org/reference/radio/send-value) | A group can exchange a named numeric value and react to receipt. | Student-controlled communication can coordinate machines without exposing other programs' variables. |
| [MakeCode tones](https://makecode.microbit.org/reference/music/play-tone) and [music playback](https://makecode.microbit.org/reference/music/play) | Sound has pitch and duration; playback can wait or run in the background. | Music provides useful parallel-programming and timing projects. |
| [VEX gears, chain, and pulleys](https://kb.vex.com/hc/en-us/articles/360039539291-Using-VEX-IQ-Plastic-Gears-Chain-Sprockets-and-Pulleys) | Transmission ratios exchange rotational speed and torque; friction and geometry constrain ideal calculations. | Transmissions matter when their consequences are simulated and inspectable. |

The cited hardware dimensions and ranges are evidence of real sensor constraints, not proposed Brickgineers specifications. Choose original virtual-part specifications compatible with the world's scale and lesson goals.

## Current repository evidence and limits

Inspected checkout: `/Users/ahmaadidrees/.codex/worktrees/brand-integration`.

- `src/domain/parts.ts` contains six named parts: left motor, right motor, color sensor, seat, mission battery, and a bumper described as a finishing piece. Each has fixed compatible slot IDs and a mass number, without units or behavior capabilities.
- `src/domain/types.ts` defines those part and slot IDs as closed unions. Its program is `{speed, stopOnRed}`; telemetry contains color, distance travelled, and motor speed.
- `src/domain/assembly.ts` counts connected slots and mass; driving readiness is the presence of two drive slots. Color sensing tests a hard-coded Z interval and height threshold, without X position, beam direction, or the actual surface under the sensor.
- `src/game/RoverIslandScene.tsx:392` advances a kinematic body along one Z coordinate. The formula produces nonzero motion even at a program speed of zero. It checks the special red track zone and reports command speed as motor telemetry; it does not model independent motors, measured shaft speed, steering, contact sensing, or load-dependent propulsion.

This remains useful as a build/code/test/play interaction reference. Its fixed slots and scripted mission behavior should not become the generalized robotics contract. A starter build can retain friendly suggested mounting points while permitting additional instances of a generic motor or sensor.

## Tier 1: starter functional catalog candidates

Relative cost estimates are qualitative implementation and verification effort, not performance measurements. All numbers below are proposed interface units. Internally use one documented world-to-metre conversion, seconds, radians, and consistent mass/force units; present centimetres, degrees, seconds, and percentages to students. Do not interpret the prototype's mass numbers as verified kilograms.

| Family and visible purpose | Student-facing data / command contract | Simulation representation and pitfalls | Creations unlocked |
| --- | --- | --- | --- |
| **Hub/controller brick**: a visible home for the program and device list | Start, stop, timer in seconds; named connected devices; one program per creation initially | Low–medium. It identifies the controlled assembly. A cable or highlighted connection path explains which devices belong to it. Avoid invisible global control of arbitrary world motors. | Every robot, animated building, interactive sculpture |
| **Generic rotary motor with encoder**: spins wheels or an output shaft | `spin at -100…100%`; `stop`; `rotate by degrees`; rotation in degrees/turns and measured speed in degrees/s. State: running, reached, blocked/timeout, disconnected | Medium. Use a speed-controlled actuator with bounded acceleration and effort, or explicitly label a simpler ideal model. Zero command must mean stop; reverse means reversed rotation. Encoder reads shaft motion, not requested speed or world travel. | Differential rover, carousel, windmill, conveyor drive |
| **Wheels, free axle/caster, chassis, beams, mounts**: turn rotation into a vehicle students can reshape | Wheel radius and axle direction are visible configuration; free wheels have no command. Motor instance is assigned to a wheel/shaft connection, not inherently left/right | Medium. Start with supported drivetrain arrangements and honest contact behavior. A wheel in the air does not propel the chassis. Do not infer a powered wheel from its purple color or label. Two wheel sizes can be enough initially. | Two-wheel rover, four-wheel cart, trailer, creature-shaped vehicle |
| **Narrow distance sensor**: measures what is in front | Distance in cm plus `object detected?`; explicit `out of range`/invalid status. Mount determines measurement axis | Low–medium. Cast a bounded ray from the aperture; show it on selection. A wide cone is a separate later part, not a hidden behavior toggle. Keep minimum/maximum range visible. Do not return zero for no hit. | Parking aid, wall-following rover, automatic doorway, approaching-visitor chime |
| **Bumper/contact switch**: knows when its own pad is pressed | `pressed?`; pressed/released events; optional count reset | Low–medium. Use pad-local contact, with stable press/release behavior. Chassis collision elsewhere must not press it. A pressing lever or arm can activate the same switch. | Collision stop, docking confirmation, doorbell, end stop |
| **Downward color/line sensor**: reads the surface at its tip | Named surface color or `none`; reflectance 0–100%; short-range valid flag | Low–medium. Ray/footprint query against actual authored surface patches with occlusion and range. Use pedagogical material metadata, not screen pixels or GPU lighting. Show the footprint; edge mixing should be specified if supported. | Line follower, color-trigger music rover, color sorting station, floor-marked delivery route |
| **Buttons and controller axes**: program how a person controls the creation | Button held/pressed/released; axis -100…100%; controller connected/focused. Keyboard and touch map to the same named inputs | Low–medium. Commands run through the student program and actuator interface. Releasing input produces neutral; losing control ends the command. Maintain an accessible touch/on-screen alternative. | Live driving, remote crane, arcade cabinet, interactive toy house |
| **RGB lamp / simple signal tile**: shows the program's state | Set color; brightness 0–100%; on/off. Initially a few named colors with arbitrary color as an extension | Low. Emissive geometry need not create a dynamic light or cast shadows. Do not falsely make every glowing brick illuminate light sensors. | Traffic lights, rescue beacon, answer buttons, room lighting, robot expressions |
| **Speaker/buzzer**: makes progress, warning, or rhythm audible | Play note or frequency in Hz for seconds/beats; volume; stop sound; clearly waiting vs background playback | Low–medium. Limit simultaneous voices; synchronize to simulation time. Provide visual equivalents for feedback. Local audio settings do not change the logic. | Reversing alert, instrument, music box, rhythmic sculpture |
| **One bounded motorized hinge / positional servo**: positions an attached moving group | `move hinge to angle`; limited min/max degrees; angular speed; actual angle; completion/blocked state | Medium–high, and the likely last starter item to validate. Separate fixed and moving sockets; hard stops and bounded effort. An angle target is not teleportation. This may be a reusable mechanism module first. | Garage door, crossing barrier, drawbridge, waving creature, rotating sign |

**Candidate delivery order:** first prove the motor+encoder, drivetrain, sensor mounting, input, and debug contracts in one rover and one stationary sensor/light build. Add the bounded hinge as the third proof creation. This creates an MVP decision point; the full table should not silently become the first release commitment.

Suggested sensor update rates such as 20–30 Hz are starting experiments, not established budgets. Physics cadence, program cadence, sampling cadence, and UI refresh can differ, but their relationship must be deterministic and visible in debugging. Store each sampled value with validity and simulation timestamp. Render interpolation must not change what the program senses.

## Tier 2: rich expansion after starter contracts hold

| Expansion | Student value and contract | Cost / fidelity boundary | Example builds |
| --- | --- | --- | --- |
| **Steering servo / steering axle** | Steering angle in degrees plus separate drive motor speed. Students discover that steering changes a moving car's path | Medium–high. Specify wheelbase, allowed angles, and wheel connections. Start with a supported steering module; a car does not pivot in place like a differential rover. | Delivery van, bus, forklift base, racecourse car |
| **Orientation module** | Heading 0–360° relative to reset; accumulated rotation; pitch/roll and turn rate °/s | Low–medium sensor implementation, higher lesson verification. Fix axes to the module, visualize them. Orientation ground truth is a clean simulation model, not a claim to emulate gyro drift. Magnetic north requires a separately named compass/world reference. | Turn-to-heading route, tilt alarm, self-righting experiment, rotating stage |
| **Gripper, scoop, fork, passive cargo tray** | Opening width in cm or joint angle; open/close target; contact/object-held signal only if physically justified | High. Reliable grasping is harder than animation. A first assisted gripper may latch only on actual valid jaw contact, eligible size, alignment, and load; disclose the latch model. No grab-nearest-object-at-distance operation. | Parcel pickup, cleanup rover, rescue transporter, sorting arm |
| **Linear actuator / sliding joint** | Extension in cm, min/max stroke, speed and target; end-stop feedback | Medium–high. Prismatic articulation, collision and load limits. Distinguish push/pull from a freely moving elevator platform. | Lift, sliding gate, stamping machine, telescope arm |
| **Wide proximity sensor** | Closest detected range in a specified cone; valid/no echo; visible angle/range | Medium. Sampled cone rays are an approximation with gaps; add overlap candidate filtering if needed. Never describe a handful of rays as full sonar acoustics. | Broad obstacle avoidance, visitor detection, scan-and-turn toy |
| **Multiple line sensors / line array** | Per-element reflectance; derived line offset with confidence only when a line is detected | Medium. Reuses close-surface query; teach thresholds before a derived offset block. Cannot claim to see the line through a raised obstacle. | Smoother line following, intersection choice, warehouse route network |
| **Matrix / display tile** | Pixel row/column, color/brightness, simple text; grid dimensions explicit | Low–medium. Reuse batched materials/texture; bound text and refresh. | Animated face, station sign, scoreboard, pixel mural |
| **Radio/message module** | Send named value/message on a chosen channel; receive event; sender identity and delivery semantics | Medium, higher in shared worlds. Use an explicit simulated communications service. Start reliable within a room and label it ideal; do not pretend it reproduces radio interference. Keep channel membership separate from edit permissions. | Dispatch hub, traffic signals, cooperative delivery, synchronized band |
| **Rotary knob / slider / pressure pad** | Knob degrees or normalized 0–100%; pad pressed/occupancy. Force in N only with an actual force model | Low–medium for input, higher for force sensing. A contact event is not a force measurement; contact impulse divided by a timestep needs filtering and validation before serving as a load cell. | Mixer desk, adjustable fountain animation, accessible control board, weight sorting experiment |
| **Gearbox, pulley/belt, crank modules** | Visible input/output shafts, ratio, reversal; output rotations and allowed load | Medium with ideal modules; high with arbitrary mechanism assembly. Start explicit linked transmission modules. Reuse equations and show them; geometry must connect. Tooth-by-tooth collision and deforming belts are unnecessary for first ratio lessons. | Geared crane, clock, winch, fan, synchronized signs |
| **Pen / marker attachment** | Pen up/down, color, stroke width; draws only where tip touches a drawable surface | Medium. Ground-contact projection and bounded persistent strokes; no marks across gaps. | Drawing rover, geometric mural, contour plotter, collaborative art |

For an ideal gear pair with driver teeth `N1` and driven teeth `N2`, show `output speed = input speed × N1/N2` and ideal torque multiplication `N2/N1`, with opposite rotation for directly meshed external gears. A same-size open belt preserves rotation direction; a crossed belt reverses it if supported. A winch's lifted distance depends on drum radius. These relationships should alter behavior; decorative gears alone belong in the appearance catalog.

## Imaginative module tier: futuristic builds with learnable rules

These are **fictional Brickgineers inventions**, not claims about SPIKE hardware or accurate propulsion, magnetism, or energy physics. Label them in the tray as “Future Lab” parts and show their rules as clearly as the real-inspired sensor rules. The user explicitly welcomes these directions. They are candidate expansions, with an especially promising early experiment in turbo or constrained hovering; their inclusion here does not commit them all to the first release.

Use one understandable convention: energy is measured in **charge units**, not joules unless a physical energy model is actually implemented. Capacity, recharge rate, and consumption are disclosed. A depleted module reports unavailable and gives a visible reason. These are optional engineering puzzle constraints, not monetized usage limits. Beginner sandbox can offer unlimited charge with that setting clearly visible.

| Future Lab module | Programmable contract and visible cause/effect | Good staging and fidelity boundary | Creative projects |
| --- | --- | --- | --- |
| **Turbo motor / boost pod** | `boost at 0–100%`; remaining charge; cooldown in seconds; `ready?`; visible output direction. A brief burst raises the motor's allowed effort or adds a declared forward force | Best early fictional candidate. Define whether it upgrades a connected drive or supplies thrust; do not switch between them invisibly. Clamp acceleration, duration, and total speed; collision stopping distance still matters | Timed delivery racer, uphill rescue cart, stunt course with timed boosts, boost-powered drawing spirals |
| **Hover pod** | `set hover height in cm`; measured clearance; max lift/load; enable/disable; charge. A visible downward beam shows the supporting surface | Strong early expansion if limited to maintaining clearance above the nearest support surface. Show “no ground in range” over an edge. Decide whether it follows slopes or world-up; identify the built-in height controller as an assist. This is a fictional lift model | Floating delivery trolley, levitating sculpture, hover ambulance, floating stage, low-gravity-style obstacle course |
| **Directional thruster** | `thrust -100…100%` only if bidirectional hardware is drawn; otherwise 0–100% plus mount orientation. Output thrust, charge, and optionally heat | Higher effort. Apply bounded force at the mount position: offset mounting can rotate the craft. Begin with constrained 2D flight or a stabilized chassis before free 6-degree-of-freedom craft | Rocket sled, flying courier, drone crane, spinning satellite toy, hovercraft steering challenge |
| **Stabilizer / flight-assist brick** | Enable leveling; target yaw/tilt; `stable?`; angular-rate/tilt limits; optional hold-height if paired with suitable lift | An explicitly fictional convenience module can make flying approachable. It is a visible controller with limits, not unexplained auto-leveling. Expose an optional advanced mode where students replace the assist with their own feedback logic | Easy-to-fly camera craft, airborne parade float, balance platform, “build your own autopilot” challenge |
| **Magnetic pickup** | Magnet on/off or strength 0–100%; connected load/attached?; clear range and eligible material. Near-contact attraction, attachment and release have declared limits | Medium–high, but a contact-latch version can reuse gripper mechanics. Use clearly marked magnetic cargo. Avoid claiming realistic electromagnetic fields; a virtual magnetic connector can be an honest game model | Scrap collector, magnetic tow truck, crane that sorts magnetic cargo, magnetic toy train coupling |
| **Tractor beam** | Beam on/off; range in cm; pull/push percentage; hit/locked?; target mass limit; line of sight. Beam visibly links aperture to eligible cargo | Later range-based force module. Unlike a physical gripper, pulling from a distance is the advertised fictional function. It should fail behind walls, outside range, or under excess load, and avoid silently selecting unseen objects | Space salvage craft, rescue drone, floating sculpture arranger, remote parcel loader |
| **Spring launcher / bounce pad** | Charge or compression level; `launch`; ready/cooldown; fixed direction and strength cap; local contact trigger | Medium if launch is one bounded impulse; teach repeatable trajectories. Reuse a visible force/impulse primitive. Keep fiction such as a “jump pad” separate from claims about arbitrary spring design | Hopping rover, cargo catapult puzzle, bouncing music marbles, rooftop delivery relay |
| **Energy core and charging dock** | Charge units, rate, connection/contact, available power. Robot decides when to return or share charge through an explicit connector | Low–medium after finite-energy rules exist. Charge conservation is an optional game rule; battery graphics must match actual state. A dock refills only when its contact/range rule is met | Self-charging taxi, rescue station, solar-fantasy city, cooperative power delivery |
| **Field gate / teleport dock** | Activate paired named gate; `occupied?`; ready/cooldown; valid target; teleport event. Restrict transfer to one eligible creation fully inside a visible volume | Long-term world feature, not starter mechanics. Preserve velocity/orientation according to one declared rule and avoid destination overlap. Reset, ownership, cargo, and shared-world transitions require careful design | Interplanetary delivery network, programmable maze, touring band stage change |

The distinction students need is **real-inspired** versus **invented with rules**, not “serious robotics” versus “play.” For example, compare a wheel rover and hover rover on the same route: which detects floor markings reliably, crosses a gap, carries a heavier parcel, or uses less fictional charge? These comparisons create design reasons to change both the build and the code.

For grades 3/4+, start with visible units and event/condition blocks: “when boost pressed,” “if charge above 20,” “set hover height to 15 cm,” “wait until dock touched.” Introduce scalar arithmetic, multiple sensor thresholds, and custom control loops as optional progression. Since the user already knows SPIKE, design teacher-facing examples around familiar motors/sensors while making the novel play affordances prominent.

Recommended experimentation sequence: **turbo on an existing rover → low-height hover delivery → magnetic pickup → assisted flight → free thrust/tractor beam/field gates**. This ranks implementation risk rather than desirability. A strong early product demo could include one fictional module beside real-inspired parts instead of presenting the whole future catalog as unavailable.

## Tier 3: long-term advanced real-inspired candidates

| Candidate | Meaningful capability | Prerequisite / reason to defer |
| --- | --- | --- |
| **Camera and visual marker reader** | Camera-frame detections, bounding boxes/centre, visible marker IDs; potentially bearing | Occlusion, field of view, pixel resolution, range, and testable visibility. Geometry-based labels can be a documented ideal vision model; they must not reveal hidden objects. [VEX's official vision configuration](https://kb.vex.com/hc/en-us/articles/39770046278676-Enabling-AI-Classifications-and-AprilTag-ID-Detection-in-VEXcode-IQ) illustrates bounded known classifications and marker IDs, not unrestricted recognition. |
| **Scanning rangefinder** | Ordered angle/range samples, scan rate and validity | Useful for mapping only after single-beam sensing is dependable. Many rays, moving objects during a scan, and visualization increase cost. A 2D sweep is a better intermediate than full 3D lidar. |
| **Explicit positioning beacon / GPS-like receiver** | Position relative to a defined beacon/world coordinate frame | Must be an explicit added capability or clearly marked sandbox helper. Encoders and ordinary distance sensors must not acquire exact world coordinates by implication. Supports surveying and multi-stop logistics. |
| **Accelerometer / advanced IMU** | Local specific acceleration in m/s² or g, angular velocity, filter settings | Timestep noise, gravity convention, offset sensor position, and collision impulses need a coherent model. A simple tilt sensor should precede acceleration lessons. |
| **Pneumatics** | Pump, tank, valve, cylinder extension; pressure only if pressure is modeled | [VEX's component guide](https://kb.vex.com/hc/en-us/articles/17309463041172-Understanding-the-IQ-Pneumatics-Kit-Components) makes the causal pump → air → valve → cylinder chain explicit. A cylinder should not extend on its own with an unexplained supply. Start with an honest ideal circuit before fluid simulation. |
| **Environmental sensors** | Light, temperature, moisture, magnetic field, sound level | First define authored world fields, sources, attenuation, and units. A thermostat needs a heat model or an explicitly adjustable simulated thermometer. Do not imply the decorative Toy Room sky sets calibrated lux or temperature. |
| **Tracked, omniwheel, suspension, walking, physically modeled flying/floating builds** | New mobility systems, mechanisms, and navigation challenges | Different contact/traction, balancing, air/water, and joint demands. Tracks can begin as a disclosed wheel-contact approximation. Physical flight/buoyancy are separate investments; the Future Lab's simpler fictional hover/flight rules can arrive earlier. |
| **Free gear trains, flexible belts/ropes, springs** | Mechanism invention with topology and mechanical tradeoffs | Constraint loops, tension, stretch, friction, stability, and edit validation require substantial work. Prioritize only when real student projects outgrow reusable mechanism modules. |

## A modular parts model without a framework project

Use a typed registry of known capability kinds and hand-written implementations. Part definitions describe capabilities, sockets, visual form, collision shape, and limits; instances carry placement, names, configuration, and connections. Avoid executable behavior strings or a general plugin language initially.

```ts
type PartDefinition = {
  id: string;
  version: number;
  name: string;
  geometryKey: string;
  colliderKey: string;
  sockets: SocketDefinition[];
  capabilities: CapabilityDefinition[]; // discriminated, versioned union
};

type SocketDefinition = {
  id: string;
  kind: 'fixedMount' | 'shaft' | 'hingeFixed' | 'hingeMoving' | 'devicePort';
  localPose: Pose;
  compatibleWith: string[];
};

type PartInstance = {
  id: string;
  definitionId: string;
  definitionVersion: number;
  name: string;
  pose: Pose;
  config: PartConfig;
};
// Separate persisted connection edges identify endpoint instance + socket IDs.
// Separate disposable runtime holds joint handles, samples and commands.
```

Start with `rotaryMotor`, `distance`, `contact`, `surfaceColor`, `controllerInput`, `rgbLight`, `speaker`, and `positionJoint`. A motor may expose both actuation and an encoder reading; there is no need for separate physical encoder inventory unless students later build external shafts. A two-motor drivetrain is a student-configured group over motor instances, not a new unrelated actuator implementation.

Connection rules should explain something students can see: a fixed mount joins structure, a shaft transmits rotation, a hinge separates fixed and moving groups, and a device connection associates a peripheral with a hub. Suggested sockets support beginners; generic mount instances allow additional or relocated sensors. The compiler can validate connected components, moving groups, incompatible sockets, duplicate endpoints, missing devices, and unsupported assemblies before Run.

Be explicit if a first hub uses automatic connection within an assembly: label and visualize it as a simplifying virtual connection. Do not show decorative disconnected wires while silently controlling the part. Power-budget, voltage, battery drain, electrical faults, and complex buses can wait for a lesson that needs them; a mission battery can remain cargo.

Only expose blocks the attached capabilities support, using stable instance references with student-facing names. Rename preserves the reference. Deleting a part leaves an identifiable missing-device block, not an automatic reassignment to a different motor. An unsupported motor/sensor combination should explain its missing capability at compile time.

## Teachably simulated behavior

- **Directional observations:** a sensor's world pose comes from the assembled mount, not the chassis centre. Exclude its own sensing housing from queries where necessary; preserve obstruction by other parts, including the robot's own structure. A blocked aperture should read the obstruction or an explicit invalid state, rather than see through it. Contact sensors can legitimately sense another part of the same mechanism.
- **Shared units:** display rulers and wheel dimensions. One wheel revolution corresponds to a circumference under rolling assumptions; encoder-derived travel is an estimate when slipping. Never overwrite the encoder with chassis travel to make the lesson succeed.
- **Command versus result:** display desired motor speed separately from measured rotation. Targets complete within tolerance, fail/timeout, or are cancelled. A stalled hinge must not leave a whole program inexplicably waiting forever.
- **Honest idealization:** begin deterministic, without random noise. Later optional seeded noise, latency, and wheel slip are explicit experiment settings. Simplification is useful when named; unexplained magic is not.
- **Stopped, reset, and held:** define motor coast/brake/hold as distinct only when the model supports them. Stop execution neutralizes active outputs according to documented rules; reset restores a saved starting build and program and clears runtime events/velocities. A stopped crane needs a deliberately specified hold/brake behavior.
- **Stable contact:** compound fixed decorative bricks into rigid groups where possible. Moving groups cost joints, collision handling, and verification; track them separately from visual brick count. [Rapier scene queries](https://rapier.rs/docs/user_guides/javascript/scene_queries/) provide ray and intersection operations with filtering; [Rapier joints](https://rapier.rs/docs/user_guides/javascript/joints/) provide fixed, revolute, and prismatic building blocks. Neither source establishes this application's Chromebook capacity.
- **Live explanation:** selecting a part shows its input/output, units, sensing footprint or axis, valid range, and last reading. Highlight the active code block and the part it refers to. A small graph and a “why did it stop?” event trace can be more valuable than another sensor type.

## Programmable live driving

Treat the controller as another input device read by the program. Supply a short editable driver template. A student can start by driving with buttons, then add a parking sensor, a slow mode near cargo, an automatic stop, and a pickup sequence without changing systems.

For a differential rover, an introductory template can mix `left = throttle + turn` and `right = throttle - turn`, normalized together if the maximum magnitude exceeds 100. Expose the resulting motor outputs so the student can understand why the robot turns. For a steering car, map turn to a steering angle instead; for a stationary crane, map it to a rotating base.

Do not let hidden built-in driving commands fight the program. Initially choose one active driver program per controlled assembly. A student's “assisted drive” is one program that combines input and sensor logic. Advanced concurrent scripts need a documented policy for conflicting actuator writes. Stop always cancels motion; loss of active control returns inputs to neutral. Readouts should make the current operator and controlling program clear in a shared room.

Example starter logic, expressed as concepts rather than a committed block syntax:

```text
when run starts
  forever
    desired speed = controller forward axis
    if distance sensor detects an object AND distance < 15 cm
      desired speed = minimum(desired speed, 0)  // still permit reversing away
    drive with desired speed and controller turn axis
    set warning lamp from obstacle condition
```

The sensor axis and braking model determine whether 15 cm is sensible. This is a calibration exercise, not a guaranteed stopping-distance claim. Very close-range invalid readings need a deliberate conservative response in a safety-oriented exercise.

## Original challenge library candidates

These are original project proposals, not adapted copies of the cited curricula. Each should accept multiple solutions and let students keep their own appearance and layout. A small set of well-tested environments is preferable to locking a part to one scripted mission.

| Creation/challenge | Parts and code ideas | Observable success / useful variation |
| --- | --- | --- |
| **Parcel post** | Rover, tray, floor colors, buttons | Deliver colored parcels to student-made depots; try manual, assisted, and autonomous routes. |
| **Toy Room rescue** | Rover, bumper/distance, beacon, cargo seat/tray | Reach a stranded original toy and return without collisions; different route and load. |
| **Parking practice** | Distance, lamp, sound, controller | Park within a marked interval; design a progressively faster beep. |
| **Floor-line explorer** | Two motors, one or more line sensors | Follow a student-drawn route; add a branch or discontinuity and explain recovery. |
| **Accessible toy taxi** | Passenger platform, door/hinge, input button | Wait for boarding signal, close door, then drive; code an interlock. |
| **Cleanup crew** | Scoop/gripper, optical sensor, drive | Collect scattered blocks into bins; compare attachments rather than only fastest time. |
| **Smart garage** | Fixed building, distance/button, hinge, status lamp | Open on request, refuse to close while occupied, indicate door state. |
| **Crossing and traffic lights** | Buttons, colored lamps, timer, barrier | Coordinate pedestrians and vehicle flow; identify conflicting states. |
| **Drawbridge delivery** | Bridge hinge, end stops, vehicle radio later | Stop traffic, raise/lower, confirm readiness; two teams design interoperable sides. |
| **Library lift** | Linear actuator, call buttons, end stops | Carry books between marked floors; queue calls and prevent overrun. |
| **Sorting factory** | Conveyor, surface/color sensor, servo diverter | Route pieces by color; vary spacing and explain timing errors. |
| **Harbor crane** | Rotary base, winch/slider, gripper | Move cargo to student-built docks; trade reach, capacity, and speed. |
| **Moving sculpture** | Motor/hinge, light, button | Change motion when approached; offer multiple patterns and repeatable sequences. |
| **Robot band** | Speaker, lamp, hinge, timer; later messages | Compose rhythms; synchronize multiple student-made instruments. |
| **Drawing parade** | Rover, marker, encoder/orientation | Draw polygons or repeating patterns; predict and measure closure error. |
| **Pixel puppet theatre** | Display, lamps, hinges, buttons | Animate original characters with audience-controlled scenes. |
| **Mini amusement park** | Rotary motors, hinges, signs, buttons | Design rides with start/stop and boarding conditions; stationary builds share the catalog. |
| **Musical stepping stones** | Contact/pressure pads, speaker, lights | Make a playable path with color and sound feedback; create a memory game. |
| **Dispatch centre** | Multiple rovers, stations, messages | Assign deliveries, acknowledge receipt, and avoid one shared choke point. |
| **Machine relay** | Each team builds a button/sensor/output stage | Pass an observable signal or object to the next creation; debug the interface together. |
| **Sky mail** | Hover pods or assisted thrusters, distance, charging dock | Deliver between shelf stations; balance cargo, clearance, charge, and landing precision. |
| **Space scrapyard** | Magnetic pickup/tractor beam, thrusters, cargo bay | Salvage marked objects without dragging other toys; arrange a collaborative orbital sculpture. |
| **Turbo rescue rally** | Boost pods, distance, bumper, beacon | Reserve charge for a time-critical route section; combine manual steering with coded obstacle protection. |
| **Floating festival** | Hover pods, lamps, sound, timed messages | Student-made floats hold different heights and perform a synchronized parade or concert. |
| **Moon-hop courier** | Jump pads or launcher, cargo cradle, contact switch | Tune launch strength and release timing to land in a station; give classmates a repeatable relay interface. |

Official curricula support the broader creative premise: [LEGO Education's Break Dance lesson](https://education.lego.com/en-gb/lessons/prime-life-hacks/break-dance/) combines motors, lights, sound, and synchronization; [Amazing Amusement Park](https://education.lego.com/en-gb/lessons/spikeessential-amazing-amusement-park/) includes motorized rides and student-designed variations. These establish that robotics engagement can extend beyond vehicles; they are not a reason to reuse their models or lesson text.

## Collaborative challenge contracts

First make one reliable local creation. Shared-world robotics then needs explicit ownership and execution rules in addition to a message block. One authority should decide the simulation outcome for each session; clients should not independently claim success from divergent physics. The networking implementation belongs in a separate design lane.

Student-facing team interfaces can remain simple: named docking area, cargo dimensions, channel, message name, and success acknowledgement. A delivery rover sends `arrived`; a depot verifies its own contact sensor before opening. A band's conductor sends `start` with a common simulation-time cue if synchrony is supported. “I received a message” and “the cargo physically arrived” must stay different facts.

Use shared outcomes such as delivering all packages, producing a class mural, or completing a machine relay. Rotate builder, programmer, driver, and tester roles; preserve each student's build/code contribution. Challenges can offer bounded parts or time as optional design constraints, but should not require identical robots or turn every activity into a speed ranking.

## Decision gates before committing breadth

1. **Mounting proof:** move/rotate the same sensor and show correct readings against actual scene objects, including obstruction, no hit, and target outside range.
2. **Actuation proof:** two independent motors produce straight/reverse/turn/stop behavior; encoder readings describe shaft motion; controller mappings can be edited in blocks.
3. **Nonvehicle proof:** a sensor-and-lamp building and a hinged gate use the same capabilities and program runtime, with no mission-specific special cases.
4. **Mechanism proof:** an obstructed joint reports failure, reset restores it, and an attachment's fixed/moving groups behave correctly.
5. **Learning proof:** students can explain a wrong reading or failed motion using part placement, units, program state, and telemetry.
6. **Classroom proof:** measure representative builds, active sensors, moving groups, and shared sessions on actual target Chromebooks. No part-count or frame-rate promise is justified by this research alone.

Only after those gates should rich catalog expansion become a committed roadmap. The largest near-term gain is making a few functional primitives trustworthy and recombinable, then giving students compelling places to use them.

## Provenance

All primary web URLs above were accessed **2026-09-14**. No kit availability, pricing, license permission, hardware deployment, or application performance was tested. Cost rankings, proposed APIs, tier placement, and challenge designs are original recommendations inferred from the source behavior and inspected prototype.

Memory used: `MEMORY.md:136–158` for the selected Toy Room direction and `MEMORY.md:1254–1280` for prior Rover Island scope/reset separation. Current repository inspection independently confirmed the concrete prototype limitations cited here.
