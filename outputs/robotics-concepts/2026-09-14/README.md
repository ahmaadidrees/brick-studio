# Brickgineers: calmer landing + robotics concepts

Discussion concepts generated on September 14, 2026 with the built-in image generation tool. No application or deployment changes were made for this concept pass.

## Images

1. 01-calmer-landing.png — existing identity and recognizable current hero, one primary Start/Continue action, three feature cards, one teacher callout.
2. 02-rover-workshop.png — original customizable rover, functional parts, selected motor configuration, Build / Drive / Code.
3. 03-code-and-test.png — visual program beside its live test world, visible sensor data and highlighted execution.

These are raster mockups. The illustrated detail and rover geometry are conceptual, not evidence of implemented interfaces or validated vehicle mechanics. The two robotics images explore the same product direction but do not lock an exact mechanical model.

## Landing recommendation

Keep the current logo, fonts, colors, Toy Room art and Start/Continue behavior. Keep Join a class immediately visible in the header, including on mobile. Remove its duplicate large hero button. Shorten the body to Build / Explore / Together cards and a single teacher invitation. Move expanded teacher guidance, Help and Privacy content to dedicated destinations; preserve the important information and links. Use actual current in-app avatars and scene captures for final feature artwork. Preserve all guest, saving and sharing behavior, and any relevant legacy-origin migration notice. Do not advertise robotics as available before it ships.

## Robotics direction

First experience: customize a rover, drive it in your world, then program it to do a useful job. Students should be able to build the environment and the machine together.

Initial parts: drive base, paired motorized wheels, distance sensor, decorative bricks, optional seat. Preset attachment points initially; free mechanical joints later if warranted. Manual keyboard/touch driving, follow camera, consistent recovery to a known start pose.

Initial program: events, forward motion, turn, stop, wait, repeat, simple sensor condition. Show the current instruction, wheel output and distance reading. Clearly distinguish commands that start motion continuously from commands that finish after a distance/turn. The Code concept assumes Drive forward starts the motors, Wait until samples distance while they run, and Stop ends motion.

Three initial challenges:
- Park in a marked zone: sequence, distance, turns, prediction.
- Stop before a movable wall: sensor thresholds and feedback.
- Repeat a square route or carry a parcel on a fixed tray: loops, angles, debugging.

Next: color sensor and line following; drawing robot; simple gripper/forklift; programmable doors, bridges and lifts. Shared student-designed courses could become a strong social loop. One controller/program runner per robot with visible handoff initially.

## Engineering scope

Keep robotics optional inside the existing product. Lazy-load simulation/programming when opened; execute small bounded programs locally without per-run AI costs. Reuse the existing world/account/class infrastructure after reviewing schema and multiplayer authority needs. Start with predictable simplified vehicle movement rather than promise a high-fidelity mechanical simulator. Separate editable build/program data from runtime position and sensor state so Reset cannot destroy the build.

An older RoverIslandScene exists in current source with motor/sensor ports, but the current main entry routes do not mount that experience. Audit those pieces before deciding reuse; their presence does not prove readiness.

## Educational precedent

LEGO Education's Cart Control lesson uses a distance sensor to stop a moving cart before an obstacle and asks students to observe its reading:
https://education.lego.com/en-us/lessons/spike-python-u3-sensor-control/spike-python-u3l4-safe-delivery/

Its Playing with Objects lesson extends a drive base with a motorized arm and sensor-guided retrieval:
https://education.lego.com/en-us/lessons/prime-competition-ready/training-camp-2-playing-with-objects/

These inform the proposed learning progression; Brickgineers remains its own original product and art direction.

