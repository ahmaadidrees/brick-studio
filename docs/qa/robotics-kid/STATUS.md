# Robot Workshop kid-UX pass: where it stands (paused 2026-09-23, network loss)

## The integrated build
- Branch `claude/robotics-kid-int` at `f7bbecc`, worktree `/Users/ahmaadidrees/.codex/worktrees/robotics-lanes/kid-int`,
  served at http://127.0.0.1:5250/build (`vite --mode robotics`; launch config `robotics-kid-int`).
- Merged: lane R (Explore rides: Ride-again crash fixed, curb at the plate edge, back to the start still seated, Ride
  card beside a tall robot, "Ride it in Explore" in the panel, camera never inside a robot), lane P (paint mode and
  Paint all, a simple part card with More, the panel follows the robot you touch, parts from steps placed once, more
  ideas with progress, idea seats/lights land on the robot, a placed kit leaves nothing selected, bigger framing),
  lane Y (the walk-up always tests the sensor, "It worked!", Code's stage runs the newest code, kit programs hold,
  the light looks off when off, the Gate kit's Door sensor faces out), lane M (kid quick start with "Build a robot",
  nothing in hand at start, parts never float after a move, no far-away drops, zoom follows the wheel, red previews
  say why; plus an unflagged fix: a moved part no longer targets its own faded copy), lane W (a car from separate
  parts: Robot plate first, loose wheels marked with "Add a motor for it", the other side shown, motors only where a
  wheel can work and never renamed by a turn, "Put it on <robot>"), the iPad remote screenshot fix (`3c3d982`).
- Verified at `f7bbecc`: app typecheck clean; `npx vitest run` 187 files / 2085 tests green. Browser harnesses on the
  R+P+Y+M build: basics 58/58 (incl. flag-off on 5251), paint 50/50, snap 96/96, cp1-pointer 78/78, ride 33/33,
  tryit 53/54 (the one failure: a transient `net::ERR_SOCKET_NOT_CONNECTED` resource load, not app behaviour).
  Lanes W, P-follow-up, Y-follow-up and R-follow-up each reported their own harnesses green on their branches;
  the full harness suite has NOT yet been rerun on `f7bbecc`.

## Not merged yet
- Lane X, drive extras (`claude/robotics-kid-extras` at `26cf699`, WIP commit but its tests 1995/1995 and harnesses
  green on its branch: Lights on L, Arm on Space/F, Spin on R, lit lights in Drive and Explore, all through the
  generated drive program). To check after merging: at 1024×768 the button column overlaps a wheel with R's new
  ride camera; it touched readiness (a motor mounted up on the robot is left out of the drive steps).
- Lane Z, polish (`claude/robotics-kid-polish` at `218768e`, WIP): item 1 (assisted wiring says "Left motor plugged
  in") done in code + unit tests, harness updates half done (kid-snap ~L280/441 and cp2-wiring W0 left); items 2
  (block menus without port letters), 3 (sticky name + Drive/Code in the robot panel), 4 (cp2-failures
  `F1.run.output-closeups` zoom after lane M's zoom change) not started.

## Round 2 (pinned server http://127.0.0.1:5252 at `187cefe`, worktree `kid-r2`)
- Olivia (8, 1024×768, gate + light + paint): reached the goal (6 actions to "It worked!"), no crash. Findings:
  1. MAJOR: "It worked! The gate opened." stays up while the next walk-up has not reached the beam, so the chips read
     "sees nothing / closed" under it; the open moment was never caught in her screenshots. Clear the result when a
     new walk-up starts and keep it tied to what is visible.
  2. MAJOR: in Explore, walking her own character up to the gate does nothing; robots only run in Try it / Code /
     Drive. Either run placed robots' programs in Explore with the character as what sensors see, or say so there.
  3. minor: "Paint it your colors" painted the selected brick in the brush colour by itself (starting paint mode
     must not paint the selection).
  4. minor: "It worked! Try it again" went back to "Ready to try!" when another robot (the Signal light) was added;
     only this robot's changes should reset it.
  5. minor: clicking the gate selects one brick ("Tall Pillar" with Delete) rather than the robot; the panel says
     Gate while the Signal light glows; the light kit's ghost has little free plate beside the panel; the visitor
     walks sideways into the beam instead of up to and through the gate.
- Jayden (car from parts) stalled and Ethan (iPad) lost the network before reporting; rerun both.

## Next steps
1. Merge lane X; finish lane Z (items 1–4); fix Olivia's 1, 3, 4 (small), decide on 2 (robots in Explore).
2. Run every harness on the merged build (`scratchpad/run-harnesses.sh` pattern: UI_ORIGIN, UI_FLAG_OFF_ORIGIN,
   UI_OUTPUT to scratch): cp1, cp1-pointer, cp2-wiring, cp2-run, cp2-code, cp2-failures, cp4-explore, kid-kits,
   kid-drive, kid-snap, kid-guide, kid-basics, kid-paint, kid-tryit, kid-ride, kid-wheels, kid-extras; iPad:
   robotics-cp3-touch, robotics-cp3-ipad-code.
3. Round 2 again on a pinned snapshot: car from parts (desktop), iPad touch, customize + ride, gate + light.
4. When green: fast-forward `claude/robotics-spike` (lane A, http://127.0.0.1:5232) to the integration branch.
   Nothing has been pushed, opened as a PR, merged to main or deployed.
