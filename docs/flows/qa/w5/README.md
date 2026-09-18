# W5 evidence — `/class` and `/class/projector`

Captured 2026-09-17 from `claude/flows-w5` with `node docs/flows/qa/w5/capture.mjs`
(Vite dev server on port 5271, `--strictPort`, stopped after the run; Chrome via the shared
Playwright module in `scripts/qa/lib/env.mjs`). States come from the page's dev fixtures
(`/class?demo=first-run`, `/class?demo=everyday`, `/class/projector?demo=1`), so no worker is
needed; the fixtures disappear when W1's `src/classroom/mockClient.ts` lands.

| State | 1366×768 | 1024×768 | 390×844 |
|---|---|---|---|
| First run (stepper, step 1 active) | `first-run-1366x768.png` | `first-run-1024x768.png` | `first-run-390x844.png` |
| Students tab (code card, shared by students, roster) | `students-1366x768.png` | `students-1024x768.png` | `students-390x844.png` |
| Worlds tab (teacher worlds, start a shared world) | `worlds-1366x768.png` | `worlds-1024x768.png` | `worlds-390x844.png` |
| Settings tab (switches, new code, rename, new class) | `settings-1366x768.png` | `settings-1024x768.png` | `settings-390x844.png` |
| Projector | `projector-1366x768.png` | `projector-1024x768.png` | `projector-390x844.png` |

Checked while capturing:

- Tabs stay reachable at every width; under 1080px the rail becomes a row above the class head,
  under 700px the code card stacks (QR above the code) and its three buttons go full width.
- Every control is at least 44px tall (`ui-button`, `class-rail-item`, `classroom-switch`).
- The join instruction and the QR both read `window.location.host` — no domain string in source.
- Reduced motion is inherited from `src/styles.css`; the page adds no animation of its own.

Automated cover (`npx vitest run src/pages/class`, 12 tests): first run vs. everyday render, each
tab, the hide/show toggle, every settings switch and its PATCH body, rename and create class,
World controls focus, projector content and `?classId=`, and both redirects.
