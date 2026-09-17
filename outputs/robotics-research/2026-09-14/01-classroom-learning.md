# Brickgineers robotics: classroom learning and activity design

Research date: September 14, 2026. Scope: elementary through middle school STEM and LEGO robotics classes. This is a research and product proposal, not an implementation audit or a validated curriculum. Sources were accessed on the research date; publication dates appear where available. All web references below are primary sources.

## Recommendation

Start with a grades 4–6 rover workshop that lets children **build something recognizable as theirs, make one meaningful code change, and see the consequence within the first eight minutes**. Support grade 3 with shorter instructions and a more complete starter, and rehearse that entry separately. The teacher already uses SPIKE extensively: use that familiarity to reduce explanation and preparation, while checking rather than assuming each student's experience. Develop three short challenges before expanding the robot catalog. Treat student-programmed live driving as a legitimate learning path alongside autonomous missions: students can build the rules connecting keys or a controller to their own motors, then improve those rules with sensors.

The educational promise should be narrow and observable: students predict a robot's behavior, express a rule in code, test it, explain a revision, and apply the rule to a changed task. Enjoyment and successful driving alone do not establish programming understanding.

Local context checked: the current checkout's `POC_CONTRACT.md` still describes a grades 4–6 browser rover slice, meaningful component connections, program-driven movement, a positioned color sensor, repeatable reset, and a lighthouse delivery. It is a design contract, not proof those features currently work. Its historical exclusions (accounts, classrooms, Blockly) belong to that earlier slice and do not override the current broader request. Prior memory likewise records only partial mission verification.

## What the evidence supports—and its limits

| Primary source | Evidence actually observed | Implication for Brickgineers (our inference) |
| --- | --- | --- |
| [LEGO Education: Training Camp 1, Driving Around](https://education.lego.com/en-us/lessons/prime-competition-ready/training-camp-1-driving-around/) | A beginner grades 6–8 lesson, 30–45 minutes, develops controlled movements and iterative parameter changes. Assessment checks block selection, parameter adjustment, and sequencing. | Use a small motion task and assess the change students made, rather than just the route completed. This is a curriculum precedent, not an outcome study. |
| [LEGO Education: Competition Ready unit](https://education.lego.com/en-us/lessons/prime-competition-ready/) | The published sequence moves from driving to object interaction, color sensing, mission work, reusable My Blocks, and attachments. | Introduce motion before complex sensors and mechanisms; preserve a path toward reusable behaviors and functional construction. |
| [LEGO Education: Taxi! Taxi!](https://education.lego.com/en-gb/lessons/spikeessential-happy-traveler/spikeessential-taxi-taxi/) | A 30–45 minute beginner lesson for UK Years 3–5 uses a story destination. It suggests vocabulary preparation, reading aloud, and routes created for another group. | Story destinations and student-authored routes can make practice purposeful; short oral instructions and picture cues should accompany blocks. Do not silently translate UK year labels into US grades. |
| [FIRST: mission and core values](https://www.firstinspires.org/about) | FIRST explicitly includes discovery, innovation, impact, inclusion, teamwork, and fun in its program values. | Cooperative rescue, accessibility, and service projects belong alongside racing. Values are an instructional design reference, not evidence of this product's learning effect. |
| [FIRST LEGO League 2026–27 judging rubrics](https://firstinspires.blob.core.windows.net/fll/challenge/2026-27/fll-challenge-bioglow-rubrics-color.pdf) | The Robot Design rubric considers strategy, team participation, attachment purpose, code/sensor explanation, repeated testing, improvements, and communication. | Borrow the emphasis on explanation and iteration; do not make score or finish time the whole assessment. This proposal is not FIRST affiliation or an official FIRST rubric. |
| [VEX EXP: Driver Control lesson](https://education.vex.com/stemlabs/exp/ring-leader/lesson-2-driver-control/learn) | VEX describes built-in driving that needs no student code, with different controller configurations. | Free driving can support familiarization or design testing, but must be distinguishable from coding work. |
| [VEX V5: controller blocks](https://api.vex.com/v5/home/blocks/controller.html) and [Controllers and Loops curriculum](https://education.vex.com/stemlabs/v5/stem-labs/loop-there-it-is/controllers-and-loops-python) | Official tools expose button states/events and numeric joystick input; the curriculum uses repeated controller readings to set motor velocities. | Live human input is compatible with real programming. The important boundary is who authored the rule controlling the motor. |
| [Microsoft MakeCode: Milk Carton Robot, Connect](https://makecode.microbit.org/projects/milk-carton-robot/connect) | A roughly 30-minute project sends a radio message from a button and executes servo behavior when received. | Input → message → robot action offers a later bridge to physical controllers and distributed systems; remote control need not bypass code. |
| [Witherspoon et al., 2017, virtual robotics curriculum](https://publications.ri.cmu.edu/developing-computational-thinking-through-a-virtual-robotics-programming-curriculum) | The university-hosted abstract reports middle-school pre/post gains associated with participation and curriculum progress, including nonrobotics computing tasks. | Scaffolded virtual robotics is a plausible setting for programming and transfer. The abstract does not establish that any simulator, open play, or Brickgineers causes those gains; no direct physical-versus-virtual equivalence follows. |
| [Sigayret, Blanc & Tricot, published June 5, 2025](https://onlinelibrary.wiley.com/doi/10.1111/jcal.70074) | A study of 306 novice grade-5 students assigned by class compared unplugged, Scratch, and Scratch plus Thymio over 10 sessions. Scratch alone produced stronger concept/algorithmic outcomes; robotics increased motivation. A second experiment found greater reported extraneous cognitive load with robots. | Reduce simultaneous demands from building, camera navigation, controls, and code. This study concerns physical Thymio and particular instruction, not this virtual product. Its adapted load scales had validation limitations; novelty may affect motivation. |
| [CAST: Action and Expression guidelines](https://udlguidelines.cast.org/action-expression/) | CAST recommends varied interaction methods, communication media, and graduated support. | Provide alternatives to precise dragging, rapid key combinations, and written-only explanations. These recommendations do not constitute accessibility certification. |

## A progression that grows beyond rovers

Grade bands are starting hypotheses; prior experience and access needs should determine entry points.

| Band | Starting experience | Next conceptual step | Suitable evidence |
| --- | --- | --- | --- |
| K–2, later supported entry | Fixed or almost-complete robot; a few icon-and-word action tiles; large target, top view; adult reads the story | Order, direction, cause and effect; predict one action | Child arranges three steps, points to the next action, and explains a fix orally. Pilot separately before advertising independent K–2 use. |
| Grades 3–4 | Starter rover, two labeled motors, a short sequence; choose a body and one useful attachment | Forward/turn/stop, duration or distance, repeat a simple pattern, button events | Correct a wrong turn and predict what doubling one parameter changes. |
| Grades 4–6, first product pilot | Starter rover with visible left/right motor correspondence; independent or paired work | Programmed keys, if/else, speed variable, one positioned sensor, reusable action | Explain why a key changes both motors; change the program so the same input produces a new behavior; use a sensor to stop at a moved marker. |
| Grades 6–8 | Same starter, expandable mechanisms and telemetry | Compound conditions, functions, proportional steering, state machines, calibration, tradeoffs and data | Use one controller routine on a different chassis, diagnose a failed sensor rule, compare repeatable trials, and justify a mechanism choice. |

Do not require every student to start with motor mixing mathematics. Early blocks may say “set left motor” and “set right motor” with arrows; a paired “drive forward” helper is appropriate if students can inspect its meaning. Later, reveal how the helper coordinates two motors. Do not present a high-level motion command as a student-built low-level controller unless they actually built that mapping.

For this SPIKE-familiar teacher, keep recognizable concepts—start/event blocks, motor selection, speed, rotations/duration, repeat, if/else, sensor reporter, and a reusable named routine—without reproducing proprietary assets or presenting Brickgineers as a SPIKE product. A one-page bridge can pair the teacher's familiar term with the local block and explicitly flag different units or simulator behavior. For grade 3, begin with a six-to-eight-block palette and a complete rover; for grade 4+, offer one functional assembly choice. These are proposed scaffolds, not fixed developmental limits. K–2 remains an eventual supported path outside the requested initial grade range.

## First 45-minute lesson: Deliver the lighthouse battery

**Learning target:** I can make a rover move and stop using a short program, predict one change, and use a test to improve it.

**Preparation:** teacher opens a small starter world and rehearses it on a real school Chromebook and account. Provide a complete fallback rover, a resettable start, a large delivery zone, and a visible front arrow. Begin with no collision interference from other teams. A two-minute demo covers Run, Stop, Reset, and the code-to-motor connection. Customization is limited initially so students reach the learning task.

| Minutes | Student activity | Teacher move / evidence |
| --- | --- | --- |
| 0–3 | Hear the mission and predict what the two visible motors will do. | State the target and show how Stop differs from Reset. |
| 3–8 | Attach a seat or cargo tray and change one identity detail. Run a supplied short program, then change one meaningful motion value. | Aim for first student-caused behavior change by minute eight; this is a pilot usability target, not a proven norm. Offer the assembled fallback immediately if building blocks progress. |
| 8–13 | Predict whether the rover will stop before or after the destination; test once. | Ask students to point to the responsible block. Keep the camera stable. |
| 13–23 | Adjust one value, reset, and run again. Record two attempts with a sketch or two numbers. | Rotate pair roles after a test. Ask “What changed? What stayed the same?” |
| 23–31 | Add the turn and final stop needed for delivery. | Observe each student's explanation; accept several valid paths. |
| 31–37 | Try a moved delivery zone or second distance. | Check adaptation rather than memorized numbers. Avoid an unseen physics trick. |
| 37–42 | Demonstrate to a partner and identify a useful failure. | Briefly show a different solution; celebrate debugging and helpful collaboration. |
| 42–45 | Reopen the saved project, then answer: “Which block would you change for a farther destination, and why?” | Verify actual recovery, not only a Saved label. Collect an oral, drawn, or written exit response. |

**30-minute variant:** use the complete rover, one straight route, one parameter change, one changed destination, and a short exit explanation. Omit the turn and extended customization. **Experienced class variant:** begin with a flawed three-block program and require a diagnosis before editing.

Keep this first lesson autonomous to isolate sequence and parameters. Introduce student-programmed live driving as the second pilot challenge, so students see that the human supplies inputs while their program still supplies the rules.

## Three pilot challenges

### 1. Lighthouse courier — sequence and controlled tests

- **Mission:** deliver one battery to a marked zone, stop fully inside, and reset successfully.
- **Core code:** sequence, two motors or an inspectable drive helper, a duration/distance value, stop. No sensors required.
- **Meaningful building:** attach a cargo tray; if payload mechanics are not modeled yet, label the tray as visual customization and do not assess carrying capacity.
- **Proof:** prediction plus two tests, one explained change, then a moved destination. A single successful run is insufficient evidence of understanding.
- **Fun:** choose the rover's identity and a delivery story; add a scenic route after the core task. Reward an explained improvement, not fastest completion.
- **Extension:** replace repeated commands with a repeat block; compare two routes under the same conditions.

### 2. Invent your controller — event-driven programming

- **Mission:** design controls a partner can use to navigate a narrow garage and stop safely at a loading bay.
- **Core code:** while Up is held, run both motors; otherwise stop. Add turn/reverse next, then a precision-speed input. Explicitly test key release and simultaneous keys.
- **Meaningful choice:** tank-style keys, steering-style keys, or a one-switch step control can all solve the task. A useful accessible controller is as legitimate as a fast one.
- **Proof:** partner predicts the mapping, student changes it to meet a new need, then demonstrates the changed behavior. A controller that works only because default driving still runs does not pass.
- **Fun:** students become vehicle/control designers and exchange their creations. Offer best-explained design and most considerate interface showcases, not a single racing podium.
- **Extension:** read joystick values, implement slow mode, or combine throttle and steering with a clamped output. These are later concepts, not day-one requirements.

### 3. Smart crossing — sensor-controlled assistance

- **Mission:** drive toward a crossing; the student's code stops forward movement when a sensor detects the marker or an obstacle. Reverse remains possible to back away.
- **Core code:** input, if/else, one sensor, motor output. Begin with a color-marker rule; distance sensing is an alternative when actually implemented.
- **Meaningful building:** sensor location changes what is detected. Show its reading and sensing location. A sensor that secretly reads the rover center teaches the wrong relationship.
- **Proof:** move the crossing and repeat without changing a timer. Explain why the sensor method handles the changed position. Test an edge case such as reversing while the stop condition remains true.
- **Fun:** improve a crossing for toy-room residents; choose an audible/visual warning or a creative rover body.
- **Extension:** switch from driven approach to autonomous stopping, add a slow zone, or compare threshold choices. Introduce line following only after simple sensing is understood.

These three challenges exercise sequence, input-driven code, and feedback with one reusable rover. They should be single-team simulations initially; shared-world exhibitions can follow reliable save/reset and control ownership.

## Live driving can be productive programming

Use one teacher-facing **Driving** setting with three plain-language choices:

| Choice | What can move the rover | Good use |
| --- | --- | --- |
| Free drive | Built-in controls, or code the student chooses to run | Familiarization, construction testing, open play |
| Drive with code | Student program only; the program may read keys/controller inputs | Control design, event handling, live sensor assistance |
| Autonomous only | Student program only; human driving inputs are unavailable to robot logic | Sequencing, loops, sensing, repeatability |

This is one lesson setting, not three separate permission systems. Select it once for the class activity; teacher Stop/Pause remains available and Stop is always available to the student. Preserve camera/navigation access in all choices. Avatar boarding must not restore built-in steering during a code-required activity. If avatar movement could push the robot or move scored objects, use isolated/resettable trials or a clear trial boundary rather than adding many teacher restrictions.

Show the active control source clearly during runs: “Built-in controls,” “Your program + keys,” or “Your program.” Hiding the drive buttons is insufficient; the runtime must enforce the choice. In code mode, removing the controller logic should remove the behavior. Input focus loss, controller disconnect, Reset, and Stop should clear active motion safely and visibly.

Assess programmed teleoperation with a simple **explain → change → retest** check:

1. Student identifies input, rule, and motor output in their own program.
2. Teacher/partner asks for a small transfer: reverse one turn, halve the speed, support a different input, or stop at a moved marker.
3. Student predicts, edits, and demonstrates the changed result.

Do not measure educational value by number of blocks, editing time, or percentage of time driving. A short controller can express understanding; a large copied program can conceal its absence. Motion telemetry can help explain a run but cannot establish authorship or learning. No plagiarism detector or surveillance dashboard is needed for the pilot.

## Rich projects after the pilots

| Project | Why students might care | Conceptual growth | Capability dependency / honesty limit |
| --- | --- | --- | --- |
| Accessible rescue rover | Design controls a different person can use; reach a stranded character | Input mapping, conditions, assisted control, user testing | Alternate input methods; do not grade reflex speed |
| Museum delivery system | Carry exhibits between stations and create a guided tour | Waypoints, reusable routines, route planning, sensor stops | Dependable payload/interaction model and saved routes |
| Recycling sorter | Separate objects into matching bins | Classification rules, state, count variables, sensor placement | Actual sensed properties and a functional gripper/conveyor |
| Drawbridge or crossing gate | Make a shared town safe for vehicles and pedestrians | Timed states, interlocks, angle limits, event coordination | Hinges/actuators and visible occupancy sensing |
| Robot artist or parade | Choreograph a drawing, performance, or moving creature | Loops, parameterized functions, synchronization | Pen/effects or joint support; assessment can value explanation and expression |
| Warehouse team challenge | Design reliable handoffs between stations | Modular programs, messages, failure recovery, task allocation | Mature multi-robot scheduling and ownership; begin in one team's world |
| Rover science lab | Compare predicted and measured travel or turning | Units, tables, calibration, variables, fair testing | Published simulator assumptions; no claim of real traction/torque unless modeled and validated |

A robot/machine expansion should add a new kind of reasoning or expression. Reskinning a rover can add creative value, but does not automatically add a new robotics concept. Stationary machines are an attractive next step because they expose mechanisms without adding navigation difficulty.

### Futuristic imagination modules can teach authentic programming

The user's requested turbos, flying machines, and levitation belong in the creative direction. Make their **fictional operating rules explicit**, consistent, visible, and programmable. Programming can be authentic even when the machine's mechanism is imaginary. Do not describe a levitation module as an accurate magnetism or aerodynamics simulation.

| Imagination module / mission | Real programming idea to teach | Clear fictional rule and scope |
| --- | --- | --- |
| Turbo courier | Button events, conditions, a resource variable, cooldown states | A boost consumes visible charge and cannot retrigger until ready. Choose the game's charge/recharge rule and label it as such; it is not a battery-efficiency model. |
| Hover platform rescue | Target value, sensor reading, if/else, feedback | An idealized hover actuator raises/lowers the platform toward a chosen altitude. Use an altitude readout; do not imply real levitation physics. |
| Flying parcel drone | Sequencing, axes, altitude conditions, safe state transitions | Begin with bounded up/down and forward motion in a stable top/side view. Students program takeoff, travel, and landing. Free 3D flight, six-axis dynamics, and camera piloting are later complexity. |
| Anti-gravity cargo crane | Event handling, interlocks, multiple actuators | The fictional beam holds one object only within a shown range; code prevents release outside a landing zone. Assess the rule, not claims about force or mass. |
| Sci-fi airlock | State machines, sensors, mutual exclusion | Two doors cannot open together; a visible pretend pressure state changes over time. No claim of real life-support engineering. |

Offer these as optional modules within the same build/code/test workflow, not a separate educational track students must earn by finishing every conventional lesson. A teacher can teach the same input/condition/output target with a hover vehicle or wheeled rover when controls remain equally legible. Separate navigation difficulty from coding difficulty: begin a hover lesson with a fixed platform and one vertical actuator before adding full flight. Introduce a turbo's single button event before teaching a full resource/cooldown model. If a module has only canned animation and no editable behavior, present it as decoration or a demonstration rather than a completed student program.

## Assessment and transfer

Use four dimensions, each recorded as **with support / independently / applies to a changed task**. Assess individuals briefly even when products are collaborative.

| Dimension | Observable work |
| --- | --- |
| Explain the system | Identifies an input or sensor, relevant rule, and actuator; connects a component's placement to its job |
| Test and revise | Predicts a result, keeps the test start consistent, identifies a failure, and makes an explained change |
| Apply the idea | Handles a moved goal, altered input mapping, changed threshold, or unfamiliar code example |
| Collaborate and communicate | Each partner contributes an idea and code/build action, explains a contribution, and responds to feedback |

Keep mission completion as separate task feedback. A learner can show strong debugging on an unfinished mission; a teammate can finish without everyone understanding. Useful artifacts are the saved robot and program, two short test records, and one explanation. Avoid requiring a long engineering notebook in every 30-minute session.

**Transfer probes:** (1) predict a three-block program on paper; (2) solve the same concept in an unfamiliar toy-world layout; (3) explain how a key press controlling a motor resembles a button controlling a light; (4) when hardware is available, rebuild the input–rule–actuator relationship on a physical kit and identify what changes. Separate immediate task transfer from delayed retention and physical construction skill.

## Virtual and physical robotics: explicit boundaries

Virtual work can make repeated trials, visible sensor readings, code inspection, and immediate reset convenient. These are design opportunities, not demonstrated learning advantages of this product. Simulation does not by itself teach cable connections, fastening strength, gear backlash, battery behavior, real sensor lighting effects, physical measurement, or tactile assembly.

For an initial idealized simulation, tell learners what is simplified. If “drive 30 cm” is exact, explain that a physical robot must measure or estimate movement and may need calibration. A visually larger wheel should affect travel only if the model implements that relationship; otherwise do not set a wheel-circumference experiment. Likewise, heavier cargo, ramps, torque, and friction must not be used as science evidence merely because the scene looks physical.

Use repeatable idealized trials first. Add explicit, seeded variations only in a later calibration lesson so students can distinguish programming errors from modeled environmental variability. A physical-kit bridge should require fresh calibration and observation rather than promising unchanged code or equivalent mechanical skill.

## Reading, motor access, and classroom participation

- Put icon + short word + value on blocks; expose units and use stable language (“forward,” “back,” “turn,” “stop”). Teach rover-left versus screen-left with a front arrow and top view.
- Offer spoken instructions/captions and short picture sequences; never use sound or color as the only success/sensor signal. A color sensor readout can include a color name and distinctive marker symbol.
- Provide keyboard block insertion/reordering and large selectable controls where feasible. Test with actual assistive technology; a block editor's presence does not establish screen-reader accessibility.
- Support touch or remappable/single-switch inputs as alternatives to two-handed driving. Retain a no-time-limit path and always-accessible Stop.
- Use predictable camera presets, reduced motion, readable zoom, and a low-detail world. Verify a complete lesson on real managed Chromebooks; browser emulation does not prove performance or school access.
- Pair roles by reasoning task: one predicts/navigates the code, one operates, then switch. Do not permanently assign one child “driver” and another “coder.” Permit solo participation and oral/drawn explanations.
- Make assistance progressive: first point to the relevant input/output, then show a partial structure, then reveal an inspectable example. A rescue template should preserve the student's build and code history.
- Make saved work, Reset, Undo, and Reopen understandable and dependable. Repeated work loss defeats reflection and disproportionately harms students who need more time.

## Pilot decision gates and open questions

These are proposed formative checks, not validated outcome thresholds:

1. **Usability:** can typical students reach a meaningful code-caused behavior change in eight minutes, and can slower starters recover with a template? Record where time is spent—reading, building, camera, coding, or runtime confusion.
2. **Learning evidence:** after each session, can each child predict one change and explain one input-to-output relationship? Compare the exit response to a short entry probe; do not claim causal learning gains from one class without a comparison design.
3. **Retention/transfer:** revisit a related but changed task a week later. Does understanding persist beyond the attractive rover context?
4. **Access:** which students cannot interact independently, and which alternative inputs actually help? Pilot grades 3–4 separately before lowering the advertised age.
5. **Teacher effort:** can a teacher select the activity and driving choice, recover a project, and see each pair's evidence without managing a settings panel? Record interventions required.
6. **Product trust:** does Reset reproduce the trial, does Reopen restore robot plus program, and can restricted driving be bypassed through boarding, another input device, or shared-world interactions?
7. **Simulation honesty:** which build changes have functional consequences today? Publish that short list and design assessed challenges within it.

Open design decisions: what one sensor ships first; whether the first motor blocks expose two motors immediately or begin with an inspectable drive helper; how classroom projects are copied from a starter; whether each learner has a device; how much existing SPIKE/Scratch familiarity students have (teacher familiarity is confirmed); whether keyboard or controller is the reliable school input; when physical-kit rehearsal will be available; and which single imagination module can expose meaningful code without overwhelming grade-3/4 beginners. None prevents starting with the three bounded pilot challenges above.

## Memory provenance

Memory informed historical context and the recommendation to verify real Chromebook behavior. Current `POC_CONTRACT.md` was read to check the historical scope; no current functional or classroom-readiness claims are drawn from memory.

- `MEMORY.md:1254–1278`, especially the grades 4–6 vertical slice and hardware-verification boundary.
- `rollout_summaries/2026-07-20T03-01-27-jLvF-rover_island_and_brick_studio_design_artifacts.md:21–35`, partial verification and project/runtime separation.
- Prior rollout ID: `019f7d78-aa5a-7390-b972-66c0506d8f7f`.
