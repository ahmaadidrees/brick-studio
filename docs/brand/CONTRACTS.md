# Brickgineers direction I — implementation contracts

Lead-owned. Workers read this before editing. Approved visuals: `direction-I-approved.png` and the 16 boards under
`/Users/ahmaadidrees/.codex/worktrees/brick-product-refinement/outputs/branding/` (read-only, untracked, checksums in
PACKAGE-MANIFEST.json). The written plan (`CLAUDE-IMPLEMENTATION-PLAN.md` in that folder) governs where a raster board
differs from real product behavior. Archive images are history only.

Integration branch: `claude/brickgineers-brand` (worktree `/Users/ahmaadidrees/.codex/worktrees/brand-integration`).
Base: `7341db0747165d2d8dacd2b0c09a5c9bf649dcb0`. Node 22 only: `export PATH=/opt/homebrew/opt/node@22/bin:$PATH`.

## Hard rules for every lane

- Verify `git rev-parse --short HEAD` equals the base you were given before touching anything. Never edit other worktrees,
  never touch `~/Documents/Virtual Legos`, never use bare `git stash`.
- No deploys, no `git push`, no merges to `main`, no dependency changes, no edits to `.env*`, `.vercel/`, `wrangler.jsonc`,
  `vercel.json`, `package.json`, secrets, live student data, DNS, auth providers. Domain strings in source: after the
  cutover the landing may contain exactly one, the legacy-host migration link `https://brickgineers.com`
  (`LandingPage.tsx`, pinned by the allow-list in `LandingPage.test.tsx`); nothing else may carry a domain.
- Keep every internal identifier: `brick-studio.*` storage keys, `.brickstudio.json`, package name `rover-island`,
  `brick_*` tables, worker name, DO bindings, document schema fields, character/environment IDs, protocol.
- Preserve guest building, link-based guest rooms, saves/classroom identity, teacher controls, multiplayer authority and
  recovery, schema 2/3 compatibility, performance. No accounts required for guest flows.
- Write only inside your ownership list. Cross-owner needs go in `docs/brand/status/<lane>.md` under "Requests for lead".
- Small commits, message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Keep `npm test` and
  `npx tsc -p tsconfig.app.json --noEmit` green in your worktree before every commit.
- Every visible control must work. Include loading/empty/error/disabled states and the responsive version. Real text
  labels, visible focus, 44px touch targets, reduced motion respected, readable at 200% zoom.
- Iterate through your whole task list until done; do not stop after the first slice. Keep `docs/brand/status/<lane>.md`
  current (done / in progress / blocked / requests / evidence paths).

## Brand

- Display name `Brickgineers` (from `src/brand/brand.ts`, constant `BRAND_NAME`). Tagline "A room full of possibilities".
- Mark: two equal rounded brick lobes forming a B, blue upper `#5888DA`, coral lower `#F17861`, two front studs per lobe.
- Palette tokens (W1 defines in `:root`, all lanes consume): cornflower `#5888DA`, coral `#F17861`, butter `#F3CA74`,
  ink `#263C51`, warm white `#F8F4EB`. Use a darker blue for white-on-blue text where contrast requires it.
- Semantic tokens: `--bg`, `--surface`, `--surface-2`, `--text`, `--text-muted`, `--primary`, `--primary-strong`,
  `--primary-contrast`, `--accent`, `--selection`, `--border`, `--focus`, `--warning`, `--danger`, `--success`,
  `--radius-sm 8px`, `--radius-md 12px`, `--radius-lg 16px`, `--space-1..8`, `--shadow-sm/md/lg`, fonts `--font-display`
  (Fredoka), `--font-body` (Nunito). Existing `--studio-*`, `--landing-*`, `--live-*`, `--content-picker-*`,
  `--classroom-accent` are aliased by W1 to these; lanes may migrate to the semantic names.
- z-index scale: `--z-base 0`, `--z-hud 10`, `--z-header 20`, `--z-sheet 30`, `--z-drawer 40`, `--z-toast 50`,
  `--z-dialog 60`, `--z-modal 1100`, `--z-system 2000`. Graphics-paused overlay moves to `--z-system`.
- Icons: Lucide only. Typography: Fredoka display, Nunito body (Google Fonts import stays for now; W1 may self-host OFL WOFF2).
- No photographed LEGO sets, minifigure art, yellow round toy heads or C-shaped hands anywhere.

## Entry intents (lead lands in Wave 0)

`src/routes.ts` exports `ClassroomEntryIntent = 'save' | 'worlds' | 'class' | 'join' | 'signin' | 'teacher'` and
`parseClassroomEntryIntent(search): ClassroomEntryIntent | null`. `BrickStudioApp` consumes it and strips unknown values.
`ClassroomPanel` prop `intent` accepts the widened type: `join` → register mode, `signin` → login mode, `teacher` →
teacher-login mode, `worlds`/`class` → tab, `save` → save flow. Existing callbacks are frozen:
`getDocument, onOpenWorld(document, world), onJoinWorld(world), onClose, onSessionChange?, onSaved?, beforeWorldMutation?,
onWorldUpdated?, client?`. W3 never duplicates save logic.

## Save status (W1 primitive `SaveStatus`, W4 wires)

Inputs are the real enums only: guest local (`{ kind: 'local' }` → label "This browser only", tone `local`;
`{ kind: 'local', error }` → "Save needs attention", tone `error`, unchanged), cloud
`CloudSaveStatus = 'saved' | 'pending' | 'saving' | 'error'` → "Saved to your account", "Waiting to save…",
"Saving to your account…", "Save needs attention"; live `LiveConnectionState = 'connecting' | 'online' | 'reconnecting' |
'offline'` → "Connecting…", "Shared world", "Reconnecting…", "Offline · edits paused". Device icon for local, cloud icon
only for cloud `saved`. Never infer state from labels. Blocked storage must surface as an error, not "Saved".

## Scene & character sheet

`WorldAndCharacterSheet` props stay: `open, plateSize, canResizePlate, initialTab('environment'|'character'),
environmentDescriptors, characterDescriptors, selection, paletteGroups, onApply(selection, plateSize?), onClose,
onRequestPreview, previewStatuses, onDraftChange, title, description, applyLabel, cancelLabel`. Lead extracts the character
tab body into `src/brick/characters/CharacterStudio.tsx` (W6-owned) with props
`{ draft: ContentPickerSelection; onDraftChange(next); characterDescriptors; paletteGroups; previewStatuses?; onRequestPreview? }`.
W5 owns the sheet frame, scene tab and plate controls; W6 owns everything inside CharacterStudio. Draft appearance is never
broadcast before Apply (already true; keep it).

## Editor header (W4)

Props: brand/home, world title + `StudioMenu` (Home, My Worlds, My Class, Save to account, Rename for account worlds only,
Download build, Import build, Help; keep New Build and Build together reachable), true `SaveStatus`, Scene, Character,
People (= Build together when not in a room; People/room panel when in a room), Settings, one primary Explore / Back to
building toggle. Guest drafts have no title field in the schema: show a neutral title, do not add schema fields.
Explore: compact HUD (Back to building, People/Character/Settings, world title pill, Respawn/Recenter, dismissible hints).

## Media (W7 → W2)

`public/brand/media/hero-{1600,1200,800}.{avif,webp,png}` (intrinsic sizes recorded in `public/brand/media/manifest.json`),
`scene-{toy-room,brick-valley,sky-island,classic}-{800,400}.{avif,webp,png}`, `character-{pip,fern,nova,toy-figure}-{400}.{avif,webp,png}`.
W2 lays out with placeholders of the same intrinsic sizes until final files land. Hero ≤ 250 KB delivered, initial marketing
media ≤ 600 KB. Landing may not import three/store/editor and may not contain `@import` or `https:` URLs other than the
pinned migration link above (existing tests).

## Ownership (exclusive, by file)

- Lead: `src/main.tsx`, `src/routes.ts(+test)`, `package.json`/lock, `vercel.json`, `vite.config.ts`, `BrickStudioScene.tsx`,
  `store.ts`, `documentPersistence.ts`, `useBrickStudioDocuments.ts`, `activeWorldRecovery.ts`, `recoverySnapshot.ts`,
  `errorLog.ts`, `liveRoomClient.ts`, `efficientPoseSender.ts`, `contentCatalog.ts`, `contentPreferences.ts`, `registries.ts`,
  `runtimeContent/**`, `PartThumbnail.tsx`, `brickThumbnails.ts`, `thumbnailWorkQueue.ts`, `RemoteAvatar.tsx`,
  `remoteAvatarSource.ts`, `publishedWorlds.ts`, `packages/**`, `multiplayer/**`, `supabase/**`,
  `src/brick/live/{liveRoomConnector,liveRoomModel,liveRoomViewStore,liveWorldGateway,useLiveRoomSession,liveWorldSeed,liveDiagnostics,liveProfile}.ts`,
  `src/classroom/{client,cloudAutosave,useClassroomWorld,contracts}.ts`, README.md, docs/LIVE_WORLD_PROTOCOL.md,
  `src/App.tsx`, `src/game/**`, `src/domain/**`, `src/state/**` (dead Rover code, leave alone).
- W1: `src/brand/**`, `src/ui/**`, `src/styles.css`, `index.html`, `public/{favicon.svg,favicon-32.png,icon-192.png,icon-512.png,apple-touch-icon.png,og-image.png,manifest.webmanifest}`,
  `scripts/assets/**`, `src/test/indexHtml.test.ts`.
- W2: `src/brick/landing/**`, `docs/brand/copy/**` (help/privacy drafts with open questions listed).
- W3: `src/classroom/ClassroomPanel.tsx(+test)`, `PasswordField.tsx`, `TeacherGoogleCallback.tsx` (presentation only),
  `classroom.css`, `googleTeacher.test.ts` string assertions only.
- W4: `src/brick/BrickStudioApp.tsx(+test)`, `brick-studio.css`, `StudioMenu.tsx`, `ExploreCameraSettings.tsx(+test,+css)`,
  `OnboardingGuide.tsx`, `LiveWorldPage.tsx(+2 tests)` presentation only, `PublishedWorldPage.tsx(+test)`,
  `GraphicsPausedOverlay.tsx(+test)`, `graphics-paused.css`, `AppErrorBoundary.tsx(+test)`, `app-error-boundary.css`,
  `VerticalSelectionHandle.tsx`+css (visuals only), `studioNavigation.test.tsx`, `graphicsPause.app.test.tsx`,
  `src/brick/live/{LiveWorldHud(+test),PresenceRoster,CopyInviteButton,LiveStatusChip,LiveWorldGate}.tsx`, `live/live-world.css`.
- W5: `src/brick/contentPicker/**`, `src/brick/customParts/{CreateBrickSheet,ResizeBrickSheet,CreateBrickPreview}.tsx(+tests)`,
  `create-brick-sheet.css`, `src/brick/CustomColorPicker.tsx(+test)`, `custom-color-picker.css`.
  Not `customParts/{validate,compile,canonical,limits,resize,definition,preview,types}.ts`.
- W6: `src/brick/characters/**`, `src/brick/BlockAvatar.tsx` (visual polish only), `assets/characters-original/**`, `scripts/art/**`.
- W7: `src/brick/environments/toy-room/**`, `public/brand/media/**`, `scripts/art/media-*`.
- W8: `scripts/qa/**`, `docs/brand/qa/**`. No product files.

## Verification expectations

Per lane: focused vitest + app typecheck; screenshots of owned boards at 1366×768 and 390×844 saved under
`docs/brand/qa/<lane>/`; keyboard/Escape/focus checks for sheets. Integration: `npm run check` under Node 22 at every merge;
W8 six-viewport matrix (1366×768, 1024×768, 768×1024, 390×844, 320×740, 844×390), 200% zoom, reduced motion; document
equality after Home → Continue → reload; schema 2/3 round trips; two-client guest room export == authoritative document;
perf harness before/after on a quiet host. Browser harness invocation:
`PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" UI_ORIGIN=http://127.0.0.1:<port> node scripts/qa/<script>`
with `npx vite --port <port>` running (ports: W1 5191, W2 5192, W3 5193, W4 5194, W5 5195, W6 5196, W7 5197, W8 5198).
At most two browser sessions on the host at once.

## Known board-vs-code decisions

- No public world gallery: board 02 "Explore worlds" nav is not built. No terrain/structure categories (board 08).
- Custom parts use the real `CustomPartTemplate` union and the three-way studs select (board 10's Arch/toggle are illustrative).
- Motion preference keeps three options (system/reduced/full). Graphics pause offers Reload after 10 s + Download recovery copy; no "Resume graphics".
- No world thumbnails exist (boards 04/05): use the mark or scene artwork, never a fake capture.
- Boards 07/09/10 header variants are ignored; board 06 governs the header. Mobile (board 16) must keep Scene/Settings reachable.
- Board 05 "join anytime" is an overclaim; say the teacher can close collaboration.
- Fix while there: published remix must `replaceState` to `/build`, not `/`; style `.published-world-state`; remove orphaned `.return-build` CSS.
