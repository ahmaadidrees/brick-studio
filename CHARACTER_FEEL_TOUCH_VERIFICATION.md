# Character Feel V1 — Lane C verification notes

## Scope and automated evidence

- Touch input is normalized at the UI boundary: right is `+x`, screen-up is forward `+z`, magnitude is radial/dead-zone adjusted, and high raw magnitude publishes auto-run.
- Look drag publishes yaw and a pitch clamped to `-0.2…1.1` radians.
- Pointer up, pointer cancel, lost pointer capture, window blur, hidden-document visibility, Explore unmount, and every `setMode` transition clear movement magnitude and run state.
- `prefers-reduced-motion` is reactive and stored for the controller/animator seam. CSS suppresses decorative animation and transition duration without removing or delaying controls.
- Desktop and touch hints document Shift-run, double jump, high-stick auto-run, and the visual-only flip without adding another touch button.

- `npm test`: 9 files, 50 tests passed.
- `npm run build`: TypeScript and Vite production build passed; existing Rapier chunk-size warning remains (`3,161.28 kB`, `1,090.43 kB` gzip).
- Focused touch/App run: 2 files, 16 tests passed.
- No browser claim is made from this isolated lane because the accepted baseline still contains the controller that this batch replaces. Use the matrix below against the reviewed integrated commit.

## Integration browser plan

Run only after the controller and avatar lanes are integrated. Do not use or stop port 5173.

```sh
npm run dev -- --host 127.0.0.1 --port 4183
```

At each viewport, place a normal brick plus door, window, stairs, and slope before entering Explore:

| Configuration | Viewport | Checks |
| --- | --- | --- |
| Desktop | 1440 × 900 | W/up moves away from camera at cardinal and diagonal yaws; A/D camera-relative; Shift transitions walk/run; mouse drag yaw/pitch; single/double jump; rapid reversal |
| iPad portrait emulation | 820 × 1180 | Stick-up forward; partial-stick walk; edge-stick run; look drag; double tap Jump; interruption resets; controls do not overlap |
| iPad landscape emulation | 1180 × 820 | Same touch loop; orbit clamp; Return to Build; rotate orientation while stopped and moving |
| Phone portrait emulation | 390 × 844 | Reachability, safe areas, hint readability, high-stick run, double jump, landing during flip |
| Phone landscape emulation | 844 × 390 | Controls/hints remain reachable; camera drag does not steal stick/jump pointers; toast and Return do not overlap |

For each configuration:

1. Exercise Build → Explore → Build continuity and ten repeated mode switches.
2. Traverse a normal wall arrangement, door/window openings, stairs, and slope.
3. Obstruct and release the camera; confirm pull-in, recovery, clamped pitch, and no roll.
4. Reverse direction quickly, walk then run, single jump, double jump, and land before the flip flourish completes.
5. While moving, dispatch pointer cancel/lost capture, blur the page, hide/show it, and return to Build; confirm movement does not stick.
6. Repeat with `prefers-reduced-motion: reduce`; movement/jumps must remain responsive while decorative bob/flip/camera accents are restrained.
7. Inspect the console after each sequence and capture representative screenshots.

Viewport and media emulation are not physical iPad/phone proof. Real-device touch latency, Safari pointer-capture behavior, orientation safe areas, thermal behavior, and mobile GPU performance remain separate acceptance work.
