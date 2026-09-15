# W4 evidence — editor, Explore, collaboration and recovery shell

Captured with `docs/brand/qa/w4/capture.mjs` (Playwright + headless Chrome, SwiftShader GL) against the
lane dev server:

```
PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
UI_ORIGIN=http://127.0.0.1:5194 node docs/brand/qa/w4/capture.mjs [name-filter]
```

The script only touches presentation state: it restores a 20-brick demo build through the same Vite module
the app imports (`/src/brick/store.ts`), seeds the guest room through `saveLiveWorldSeed`, builds the
read-only viewer hash with the app's own serializer, and produces the graphics-paused state by dispatching
the real `webglcontextlost` event on the canvas. Reduced motion is requested for every capture.

| File | Board | What it shows |
| --- | --- | --- |
| `06-build-1366x768.png` | 06 | Header: BrandLockup home, world title menu, SaveStatus (local), Scene / Character / People / Settings, primary Explore. Docked brick drawer with search, Create a brick, categories, thumbnails and colour footer. Selection inspector, subtle height handle, bottom toolbar (Undo/Redo, Box select, Frame build, Top/Front/Side/3D, capacity). |
| `06-build-390x844.png` | 06 + 16 | Phone header: mark only, title + save chip, Explore; Scene / Character / People / Settings action row; compact toolbar; selection pill; (+) Bricks. |
| `06-build-320x740.png` | 16 | Narrowest supported width: every header target stays inside the viewport. |
| `06-build-drawer-sheet-390x844.png` | 16 | Bricks bottom sheet with search, Create a brick, scrolling categories/grid and a persistent colour footer. |
| `07-explore-1366x768.png` | 07 | Explore HUD: mark, Back to building, People / Character / Settings, world title pill, dismissible control hints, Respawn / Recenter. No brick drawer, no marketing nav. |
| `07-explore-390x844.png` | 07 + 16 | Touch Explore: icon cluster, joystick, Jump, touch hint with dismiss. |
| `11-guest-room-create-1366x768.png` / `-390x844.png` | 11 | Guest create state: world name, your name, seed choice (current build / empty plate), Create shared world, "No account needed" note, retention note, Keep building. The join and in-room People panel states need a live worker and are covered by `LiveWorldHud.test.tsx` / `LiveWorldPage*.test.tsx`. |
| `12-settings-1366x768.png` / `-390x844.png` | 12 | Settings sheet: Follow / Free look, keyboard layout select, three-way motion preference, build and explore shortcut sheet, persistent footer with Done. |
| `12-world-menu-1366x768.png` / `-390x844.png` | 12 | World title menu: Home, My Worlds, My Class, Save to my account, Download build, Import build, New Build, Build together, Help, placed-brick navigator. (Rename appears only for account worlds.) |
| `15-graphics-paused-1366x768.png` / `-390x844.png` | 15 | Graphics paused card at `--z-system`: build preserved, Download my build; Reload the studio appears after 10 s. No fake Resume. |
| `15-read-only-viewer-1366x768.png` / `-390x844.png` | 15 | Read-only published world in Explore with the viewer bar (mark, Read-only world · title, Settings, Make a copy). |

Additional checks run during the pass (not saved as images): 683×384, 512×384 and 844×390 viewports — bottom
toolbars scroll sideways, the onboarding "Start building" button and the guest-gate "Create shared world" /
"Keep building" buttons are reachable by scrolling; touch hit areas on a 390px touch viewport (world title
91×44, brand mark 44×44, Scene/Settings 91×44, Explore 99×44, Undo 44×44, Frame build 44×44); the header
Character button opens the sheet on the Character tab.
