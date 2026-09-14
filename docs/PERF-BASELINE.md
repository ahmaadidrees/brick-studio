# Performance baseline

A repeatable way to measure how Brick Studio renders on a real device, without any code changes.
Run it once to establish the baseline, then again after any rendering, physics or scene change.
The two devices that matter are a school Chromebook (the floor) and a desktop or laptop (the
ceiling). The Chromebook numbers are the ones we tune for.

## Before you start

1. Chrome, up to date, on the device under test. Note the exact version (`chrome://version`).
2. A fresh profile or a guest window; close every other tab; plug the device in; wait a minute
   after boot so background updates settle.
3. Record the page's pixel budget once per device: in DevTools → Console run
   `[window.innerWidth, window.innerHeight, devicePixelRatio, document.querySelector('canvas')?.width, document.querySelector('canvas')?.height]`.
   The app caps the render scale at 1.25× (1.1× on compact devices), so the canvas size is what
   the GPU actually fills.
4. Use the production URL unless you are testing a candidate; then record the exact preview URL.
5. Get the fixtures onto the device. They live in `scripts/perf/fixtures/` (open the file on GitHub →
   Raw → save, or drop them in Drive):

   | File | Bricks | Layout |
   |---|---|---|
   | `dense-250.brickstudio.json` | 250 | 3 stacked layers of 2 × 4 bricks (max overdraw, flat roof to walk on) |
   | `dense-500.brickstudio.json` | 500 | same |
   | `dense-1000.brickstudio.json` | 1000 | same, at the world limit |
   | `mixed-250.brickstudio.json` | 250 | plates with 1 × 1 / round / cone bits, walls with frames and slopes, towers, pillars, stairs, loose parts |
   | `mixed-500.brickstudio.json` | 500 | same |
   | `mixed-1000.brickstudio.json` | 1000 | same, at the world limit |

   Regenerate them with `node --import ./scripts/lib/register-ts.mjs scripts/perf/generate-fixture.ts`
   (see scripts/README.md); the output is deterministic and validated with the real importer.

**Loading a fixture:** in the studio, open the ⋯ menu (top right, "More studio actions") →
**Import** → choose the file. Import replaces the current draft, so Export first if it matters.
Loading a fixture works signed out; nothing is uploaded.

**Changing scene or character:** ⋯ menu → **Scene & character**. The scene is saved in the document;
the character is a local preference.

## Scenarios

Run each scenario on `mixed-1000` first (the realistic worst case), then `dense-1000`, then the
smaller sizes if the 1000-brick numbers miss the targets. Record two runs and keep the worse one.

| # | Scenario | Steps | Sample with |
|---|---|---|---|
| S1 | Idle in Build | Import fixture, press the Home view, hands off for 60 s | `perfProbe(60000)` after 5 s of settling |
| S2 | 100 placements | Pick the 2 × 4 brick, click 100 times across free plate (the brush stays loaded) at a steady ~2/s | `perfProbe(50000)` started right before the first click |
| S3 | Marquee 200 + drag | Select tool, drag a box around ~200 bricks (use a dense corner), then drag the group ~10 studs and release; Undo | `perfProbe(10000)` started before the box drag |
| S4 | 5 Build ↔ Explore switches | Explore → wait for the character → Back to building; repeat 5 times | Performance panel recording of the whole sequence; note the longest task |
| S5 | 60 s Explore walk | Explore, walk a loop around the build, climb something, jump | `perfProbe(60000)` after the character is standing |
| S6 | Scenes | Repeat S5 in each of Classic Studio, Toy Room, Brick Valley, Sky Island | one `perfProbe(30000)` per scene; note scene load time |
| S7 | Characters | Repeat S5 with Classic Builder and with one rich character (Toy Figure or Robot Hero) | `perfProbe(30000)` each |

On a touchscreen Chromebook also do S5 with the on-screen joystick.

## Metrics and how to capture them

### 1. Frame times and draw calls: the console probe (no code changes)

Paste this into DevTools → Console once per page load (a reload removes it). It wraps the WebGL
draw entry points so every draw call is counted, then `perfProbe(ms)` samples requestAnimationFrame
timing, draw calls per rendered frame, long tasks and JS heap for `ms` milliseconds and prints one
row you can copy into the table below.

```js
(() => {
  const draws = ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced'];
  if (!('__glDrawCalls' in window)) {
    window.__glDrawCalls = 0;
    for (const Context of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
      if (!Context) continue;
      for (const name of draws) {
        const original = Context.prototype[name];
        if (typeof original !== 'function') continue;
        Context.prototype[name] = function (...args) { window.__glDrawCalls += 1; return original.apply(this, args); };
      }
    }
  }
  window.perfProbe = (ms = 3000) => new Promise((resolve) => {
    const frames = [], calls = [];
    let longTasks = 0, longestTask = 0;
    let observer = null;
    try {
      observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) { longTasks += 1; longestTask = Math.max(longestTask, entry.duration); }
      });
      observer.observe({ type: 'longtask' });
    } catch { /* long tasks unsupported */ }
    const heapBefore = performance.memory ? performance.memory.usedJSHeapSize : null;
    const start = performance.now();
    let last = start, lastCalls = window.__glDrawCalls;
    const tick = (now) => {
      frames.push(now - last); calls.push(window.__glDrawCalls - lastCalls);
      last = now; lastCalls = window.__glDrawCalls;
      if (now - start < ms) { requestAnimationFrame(tick); return; }
      if (observer) observer.disconnect();
      const sorted = [...frames].sort((a, b) => a - b);
      const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
      const heapAfter = performance.memory ? performance.memory.usedJSHeapSize : null;
      const mb = (bytes) => Math.round(bytes / 1048576 * 10) / 10;
      const row = {
        seconds: Math.round((last - start) / 100) / 10,
        fps: Math.round(frames.length / ((last - start) / 1000)),
        frameMsP50: Math.round(pct(0.5) * 10) / 10,
        frameMsP95: Math.round(pct(0.95) * 10) / 10,
        frameMsMax: Math.round(sorted[sorted.length - 1] * 10) / 10,
        drawCallsPerFrame: Math.round(calls.reduce((a, b) => a + b, 0) / calls.length),
        drawCallsPerFrameMax: Math.max(...calls),
        longTasks,
        longestTaskMs: Math.round(longestTask),
        heapMB: heapAfter === null ? 'n/a' : mb(heapAfter),
        heapDeltaMB: heapAfter === null ? 'n/a' : mb(heapAfter - heapBefore),
      };
      console.table(row);
      resolve(row);
    };
    requestAnimationFrame(tick);
  });
  console.log('perfProbe ready: run perfProbe(3000) while the scenario is happening');
})();
```

Notes on reading it:

- `frameMsP95` is the number to compare with the targets. `fps` alone hides stutter.
- The studio renders every frame (no on-demand frame loop), so idle draw calls are real work.
  `drawCallsPerFrame` counts every WebGL context on the page (part thumbnails included) and is
  the quickest signal for whether instancing or batching changed.
- `heapDeltaMB` over a 60 s idle run shows whether something leaks per frame. `performance.memory`
  is Chrome-only and quantized; start Chrome with `--enable-precise-memory-info` for exact values.
- `longTasks` are main-thread tasks over 50 ms (scene loads, physics world builds, big selections).

### 2. DevTools Performance panel

For S4 (mode switches) and whenever the probe shows long tasks: DevTools → Performance → record →
run the scenario → stop. Read the **Frames** track (red frames are dropped), hover the longest red
block in **Main** for its duration and its top function, and note "Long task" markers. Save the
trace (`.json`) next to the results if it looks abnormal so it can be compared later.

Quick visual check: DevTools → ⋮ → More tools → Rendering → **Frame Rendering Stats** overlays a
live FPS meter and GPU memory on the page.

## Results table

Copy one row per scenario into `docs/perf/results/<date>-<device>.md` (create the folder). Keep the
Chromebook and desktop rows in the same file so they can be compared.

| Device | Chrome | Fixture | Scenario | fps | frame ms p50 | frame ms p95 | draw calls/frame | longest task ms | heap Δ MB | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| e.g. Lenovo 100e (Celeron N4020, 4 GB) | 129 | mixed-1000 | S5 explore walk | | | | | | | |
| | | | | | | | | | | |

## Targets to discuss

These are starting points, not promises; the first real Chromebook numbers should revise them.

| Device class | Scenario | Target |
|---|---|---|
| Desktop / laptop with any GPU | S5 Explore at 1000 bricks | frame p95 ≤ 16.7 ms (60 fps without stutter) |
| Desktop / laptop | S1 Idle in Build at 1000 bricks | frame p95 ≤ 16.7 ms, heap Δ ≈ 0 over 60 s |
| Celeron / Pentium Chromebook | S5 Explore at 1000 bricks | frame p95 ≤ 33 ms (30 fps) until measured otherwise |
| Celeron / Pentium Chromebook | S2 placements, S3 marquee drag | no task over 200 ms; placement feels immediate |
| Any | S4 Build ↔ Explore switch | longest task ≤ 500 ms; switch completes in under 2 s |
| Any | S6 scene load | Toy Room / Brick Valley / Sky Island ready within 5 s on school Wi-Fi |

If the Chromebook misses the Explore target at 1000 bricks, record where it passes (500? 250?)
so the classroom guidance can say how big a build is comfortable on that hardware.
