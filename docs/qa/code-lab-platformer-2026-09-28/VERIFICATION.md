> Reverted at user request on 2026-09-28 after reported regressions. This report describes the rejected pass, not the current preview.

# Scratch-style platformer pass — 2026-09-28

Local branch/worktree: `codex/code-lab-freedom`. Preview http://127.0.0.1:5192/2d/lab . No deployment, merge, or push.

## Verified
- 104 tests / 17 lab test files pass; production build passes. Build has existing bundle size warnings; some jsdom tests emit canvas stub warnings.
- Runtime tests cover positive-up new coordinates without changing legacy coordinates, live solid overlap, bounded repeat-until, scripted-to-native restoration, and transient spike/lava contacts during correction.
- Lesson tests cover stable grounding across frame parity, acceleration/friction, walls, jump gating, ceiling collision, and readable custom definitions.
- Browser walkthrough: started lesson, observed horizontal position change and airborne jump, inspected named calls; edited gravity from -0.5 to -0.75, changed tabs and reloaded, and confirmed persisted block value.
- Production preview: new 64x64 character draft, paint and rename, reload; explicit immediate-reload test preserved `Builder ready`. Existing 32x32 edited frames remained intact in the other browser's saved project.
- Fixed an observed HMR extension registration crash and an observed autosave debounce race on reload. Fresh production preview reports no browser console errors.
- Screenshots: `platformer-lesson.png`, `costumes.png`.

## Limits
- This lesson treats solid platforms as solid from every side; it does not reproduce native one-way-platform movement or moving-platform carrying.
- Collision correction is an editable teaching example, not a high-speed swept collision engine. Students can experiment into incorrect behavior; operation budgets prevent runaway loops freezing the editor.
- New core motion has upward-positive Y; legacy targeted position blocks retain downward-positive Y for compatibility, documented in help.
- Default artwork now samples at 64x64, retaining more detail. The builder source itself is painterly; existing edited 32x32 frames are preserved, not automatically resampled.
- Local browser storage only; no cloud/classroom/iPad certification.
