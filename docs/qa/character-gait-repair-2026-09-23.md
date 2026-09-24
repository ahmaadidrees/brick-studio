# Walk/run animation repair

Local branch: `codex/2d-characters`. No push, merge, deployment, or PR.

## Cause and change

The original running row repeated similar forward-kicking silhouettes. Three selected cells played back in a short ping-pong sequence, without a convincing opposite-leg passing pose. Per-frame full-body crops also varied the apparent body position.

Two attempted full-body replacement sheets still repeated the wrong leg position, including an attempt with an explicit pose guide. Those drafts were rejected. Instead, the built-in imagegen tool produced separate body, arm, thigh, shin and foot artwork for Builder, Bolt Bot and Brick Fox. The successful prompts and asset hashes are recorded alongside this report and the assets.

The renderer now joins those parts with two-segment legs: feet travel backward along the ground during stance and recover forward with a bent knee; the second leg follows half a cycle later. Walking keeps overlapping support phases, running includes airborne phases. Arms swing opposite the legs; the torso bobs slightly. Feet and body share a stable ground anchor, and the existing squash feedback is preserved. This is stylized animation, not a physically foot-locked gait solver.

The animation phase follows the existing distance counter, with a complete left/right cycle every 64 simulation pixels. The gait changes to running above the configured walking speed. Stopping removes the gait; jumping, skidding, crouching and special actions retain their original sprites. Character choice, collision sizes, physics, authored worlds and deterministic hashes are unchanged.

Optional validated `ga` and `gp` pose fields carry gait and phase through rooms. Short continuous remote pose intervals interpolate phase forward across its wrap. Turns, teleports, gaps and legacy poses do not blend ambiguous cycles. Existing clients retain their original pose fallback.

## References

- [Animation Mentor: human walk cycle](https://www.animationmentor.com/blog/tutorial-animating-human-walk-cycle/) — contact, down, passing and up poses.
- [AnimSchool: key poses of a run cycle](https://blog.animschool.edu/2024/04/10/the-key-poses-of-a-run-cycle/) — contact, down, push and peak, with flight between steps.

## Verification

- `npm run check`: 1,463 app/core tests and 222 Worker tests passed; all configured typechecks and production build passed. Existing jsdom canvas notices and bundle-size warnings remain.
- After the final squash-feedback adjustment: 56 focused character, session, remote and room tests plus `tsc -b` passed.
- `scripts/qa/platformer-gait.mjs`: 4/4 passed, zero browser errors. Each character was selected through the UI and exercised through all eight sampled walk/run phases, both directions, stopping and jumping. Final artifacts: `test-results/platformer-gait/` including diagnostic pose sheets, in-game screenshots, video and sampled metadata.
- `scripts/qa/platformer-characters.mjs`: 8/8 passed, zero browser errors. Includes two local browser profiles and a local Worker exchanging character identity and running gait/phase, legacy appearance, cold reload, keyboard selection, and 390 × 844 selector fit.
- Visually inspected the enlarged walk/run pose sheets and comparison in the in-app browser, plus in-game captures. The reusable development comparison is `/scripts/qa/platformer-gait-preview.html`; it has pause, speed and facing controls.
- Production output contains none of `__brickStore`, `__explorer`, or `__game2d`.

An early gait rehearsal ran the third character into the end of its runway; the harness now creates a fresh synthetic world for each character. A rehearsal concurrent with development reloads also failed its left-facing assertion; the final uninterrupted run passed. No product test was weakened to mask either failure.

## Limits

This checks the local cartoon locomotion and room appearance paths, not a new classroom reconnect or device-performance certification. Original full-body art remains for other actions, so those transitions can still be polished separately. The three new PNGs add approximately 4.4 MB in total; only characters that appear load their extra 1.4–1.5 MB rig, then reuse it from cache. Atlas delivery optimization remains separate from this animation fix.
