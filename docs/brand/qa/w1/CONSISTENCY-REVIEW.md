# Brickgineers direction I — consistency review (W1, second pass)

Read-only review of the integrated branch (`6950d4b` + W1 second pass) against the design system in `src/styles.css`,
`src/ui/**` and the `/dev/ui` gallery. Nothing outside `src/ui`, `src/brand`, `src/styles.css` was edited; every item
below is a request to the owning lane. Verified with `consistency-review.mjs` (Playwright + headless Chrome, one short
session) at **1366×768** and **390×844** (2×, touch) against the Vite dev server on port 5191; raw measurements are in
`review/findings.json`, screenshots in `review/*.png`. W4's editor shell had not landed on this branch, so editor-chrome
findings describe the pre-brand `src/brick/brick-studio.css` and should be re-checked against W4's branch before acting.

## What was checked

| Check | Method |
|---|---|
| Palette actually landing | Legacy variable values on lane root classes vs the `:root` aliases; computed text/background/border colours of every visible element not equal to a token value (swatches, thumbnails and previews excluded) |
| Fonts | Computed `font-family` of every visible text element |
| Focus rings | Tab through 10–16 stops per surface; outline style/width/colour on each |
| Spacing/radius | Border radius of controls and containers not in {0, 8, 12, 16, 999, 50%} |
| Contrast | Text colour vs the first opaque ancestor background (alpha composited), WCAG ratio vs 4.5:1 (3:1 for ≥24px or ≥18.66px bold) |
| Canvas | Elements intersecting the WebGL canvas with `backdrop-filter`, `filter: blur()` or a box shadow |
| Reduced motion | `document.getAnimations()` still running under `prefers-reduced-motion: reduce` |
| Touch targets | Visible controls under 44px at 390×844, plus a full-dialog probe (scrolled content included) for every sheet |

## Summary by surface

| Surface | Fonts | Legacy overrides | Non-token colours | Focus rings | Contrast fails | Small targets (phone) | Blur over canvas |
|---|---|---|---|---|---|---|---|
| Landing `/` (W2) | Fredoka, Nunito | 0 | 0 | 16/16 at 3px `--focus` | 0 | 0 | n/a |
| Entry join / signin / teacher (W3) | Fredoka, Nunito | 7 (from `.brick-studio`, W4) | 0 | 10/10 at 3px | 0 | 0 | none from the sheet |
| Scene sheet (W5) | Fredoka, Nunito | 7 (W4) | 0 | 12/12 at 3px | 0 | 0 | none |
| Character sheet (W5/W6) | Fredoka, Nunito | 7 (W4) | 0 | 12/12 at 3px | 0 | 3 (W6, below) | none |
| Create a brick (W5) | Fredoka, Nunito | 7 (W4) | 0 | 12/12 at 3px | 0 | 0 | none |
| Choose any colour (W5) | Fredoka, Nunito | 7 (W4) | 0 | 10/10 at 3px | 0 | 0 | none |
| Editor chrome `/build` (W4, pre-brand) | Fredoka, Nunito, **system-ui** | **7** | **30** desktop / 13 phone | 14/14 at 3px | **15** desktop / 1 phone | 21 desktop / 2 phone | **4 panels with `backdrop-filter: blur()`** |

Reduced motion: the landing runs seven entrance animations right after load with no preference set and none under
`prefers-reduced-motion: reduce`; the editor runs none either way (the `:root` kill switch in `styles.css` holds). Fonts: Fredoka on every heading and the wordmark, Nunito on body text and
controls, on every surface; the only `system-ui` text is the editor's save-status pill and customize chip (W4).

## Issues by owner

### W4 — editor shell (`src/brick/brick-studio.css`, `BrickStudioApp.tsx`, `StudioMenu.tsx`)

The chrome around the canvas is the one place the palette has not landed. In priority order:

1. **Palette blocked at the root.** `.brick-studio` (`brick-studio.css:2–10`) redefines `--studio-ink #223640`,
   `--studio-muted #6f8087`, `--studio-blue #3e83d7`, `--studio-blue-dark #2867ae`, `--studio-panel`,
   `--studio-panel-border`, `--studio-panel-shadow` and the control height/radius. These beat the `:root` aliases, so
   every `var(--studio-*)` in the file resolves to the old teal-grey/blue. Fix: delete the block (the aliases in
   `styles.css:100–110` already map each name to a token), or migrate the rules to `--text`, `--text-muted`,
   `--primary`, `--primary-strong`, `--surface`, `--border`, `--shadow-md`.
2. **Blur over the WebGL canvas.** `backdrop-filter: blur()` on `.brick-mode-switch` (l.90, 15px), `.part-library` and
   `.brick-inspector` (l.133/187, 16px), `.studio-menu-popover` (l.104, 18px), `.onboarding-guide` (l.232, 20px),
   `.published-world-bar` (l.265), `.race-room-card`/`.race-host-card` (l.272), the compact variants at l.349/387 and
   `.touch-placement-bar` on phones. Each one forces the compositor to read the canvas back every frame. Fix: remove
   `backdrop-filter`, use an opaque `var(--surface)` panel with `var(--shadow-md)` (the gallery header/sheets do this).
   The header's own shadow `0 8px 28px rgba(45,61,67,.12)` → `var(--shadow-md)`.
3. **Fonts.** `.brick-save-status` (l.80) and `.brick-customize-entry > span` (l.74, 592) use `system-ui`. Fix: the
   save pill should be the `SaveStatus` primitive (`src/ui`), which also fixes the copy and the states; the chip →
   `font-family: var(--font-body)`.
4. **Contrast under 4.5:1 (all 9–10px, non-token grey).** `.coordinates span` X/Y/Z `#8a979a` on `#f3f5f4` = 2.75:1
   (l.209); `.brick-eyebrow` "Brick drawer"/"Placing" `#89969a` = 3.02:1 (l.160); `.create-part-entry small`
   "Choose its shape and size" `#7690a1` on `#eef6fd` = 3.07:1 (l.161); `.brick-capacity-status` `#7b8c94` = 3.46:1
   (l.646); `.shortcut-bar` `#6f7e83` on `--bg` = 3.76:1 (l.249, five spans); `.view-controls button` `#63757c` 9px
   (l.222). Fix: `color: var(--text-muted)` (5.6:1 on `--bg`, 6.1:1 on white) and 12px minimum for labels.
5. **Non-token colours (30 distinct on desktop).** Biggest groups: `.library-part` `#f1f3f2` bg / `#5f7279` text (l.168,
   ×11) → `--surface-2` / `--text-muted`; `.studio-button` text `#506770` → `--text`; `.brick-primary-mode` `#3476c1`
   (l.583) → `--primary-strong`; `.studio-world-title` `#334f5d` (l.635) → `--text`; header/panel borders
   `rgba(161,176,180,.42)` → `--border`; `.inspector-actions button` `#eef1f1` → `--surface-2`; `.brick-collaborate-entry`
   `#edf5fc` → `--primary-soft`; touch placement primary border `#2d70b8` → `--primary-strong`. Full list with selectors:
   `review/findings.json` → `editor/desktop.colours`.
6. **Radii off the scale.** `.brick-primary-mode` 11px, `.library-collapse-button` 10px (l.138), `.create-part-entry`
   13px (l.161), `.library-part` 14px (l.168, ×12), `.coordinates span` 7px, `.onboarding-guide` 22px, phone
   `.touch-placement-bar .studio-button-primary` 26px. Fix: `--radius-sm` (8) for chips/inputs, `--radius-md` (12) for
   buttons/cards, `--radius-lg` (16) for panels, `--radius-pill` for the pill.
7. **Touch targets (D7).** `.studio-world-title` "World menu" is 120×23 desktop / 110×21 phone (l.635 `padding: 2px 0`)
   → `min-height: var(--control-height)`; `.library-collapse-button` 38×38 (l.138) → 44 under `(pointer: coarse)`.
   `.color-grid button` (30×30) and `.view-controls button` (40×44) already reach 44 on coarse pointers (l.302–303),
   fine. Rebuilding the header on `Button` (`variant="quiet"`, `iconOnly`) gets the rule for free.
8. **Legacy product name in the header.** `BrickStudioApp.tsx:258` falls back to `worldTitle || 'Brick Studio'`, so a
   fresh world shows "Brick Studio" as the world title; `StudioMenu.tsx:121` "Return to the Brick Studio landing page"
   and `:151` `aria-label="Choose Brick Studio project file"`. Fix: a neutral default world name ("My world") and
   `BRAND_NAME` from `src/brand` in the two strings.

### W6 — character studio (`src/brick/characters/**`)

1. **Three sub-44px controls on touch.** At 390×844 the only controls under 44px inside the whole Scene & character
   sheet are `button.ui-button-quiet` "Keep Shirt / Pants / Badge when mixing" at 67×36. Cause:
   `character-studio.css:244` `.character-studio .character-studio__lock { min-height: 36px; }` under
   `(pointer: coarse)` overrides the primitive, which now lifts every `size="sm"` button to 44px on coarse pointers.
   Fix: delete that line. (Idle / Walk / Run / Jump / Pause measured 44px on touch after the primitive change.)
2. **Adopt `Button pressed`.** `PaletteControls.tsx:26`, `CharacterPreview.tsx:153,161`, `AppearanceControls.tsx:83`
   and `WardrobePanel.tsx:108` pass `aria-pressed` directly; switching to `pressed={…}` gives the shared pressed look
   (`.ui-button-pressed`, blue-soft fill + 1.5px inset ring on quiet/secondary) and lets you drop the local
   `[aria-pressed='true']` rules at `character-studio.css:61, 82, 215` and `character-preview.css:61, 67` where the
   shared look is enough. The gold `#b8860b` favourite icon (l.215) and `#9568c9`/`#7ac07a` are the only non-token
   colours left in the file; keep them only if they are character content rather than chrome.

### W5 — content picker, custom parts, colour picker

All four surfaces (Scene tab, Character tab frame, Create a brick, Choose any colour) measured clean: tokens only,
no contrast failures, 3px rings on every stop, body scrolls under the persistent footer at 844×390 and 200% zoom
(`sheet-scroll.mjs`).

1. **Plate size → `SegmentedControl`.** `WorldAndCharacterSheet.tsx` still hand-builds `.plate-size-options` buttons
   (`world-character-sheet.css:135–152`). The two blockers named in W5's status are gone: `SegmentedControl` takes
   `aria-describedby` (pass the id of "Your creation stays centered.") and its options are 44px on coarse pointers.
   Suggest `<SegmentedControl label="Plate size" fullWidth aria-describedby={hintId} …>` and deleting the local rules.
2. **`content-picker.css` carries ~90 hex literals.** None surfaced as chrome colours at runtime (the scene/character
   cards read as token colours), so they appear to be thumbnail/illustration fills; if any are borders, text or card
   backgrounds, move them to tokens.
3. **W4 hand-off (already in W5's status):** the drawer's unmount cleanup no longer needs a guard in CreateBrickSheet
   for focus — the Sheet primitive now reclaims focus after open and falls back to the element that took it when the
   opener is gone (`Sheet.test.tsx` "reclaims focus stolen by a sibling cleanup"). The local workaround in
   `CreateBrickSheet.tsx:106–126` can be removed once W4 lands.

### W3 — accounts and classrooms (`src/classroom/**`)

Entry panel at all three intents: tokens only, 3px rings on every stop, no contrast failures, 44px everywhere on the
phone probe (segmented options are 44px on touch now).

1. **Redundant coarse-pointer rules.** `classroom.css:182–183` (`.ui-button-sm` and `.ui-segmented-option` → 44px)
   duplicate what `ui.css` now does for every lane; delete them. Keep l.184 (`.classroom-password-toggle`), which pins
   the Show button inside the input (40px tall on desktop and touch — acceptable inside a 44px field, or drop the
   2px inset to make it 44).
2. **`fields.tsx` → shared primitives.** `TextInput` exists only because `TextField`'s required marker changed the
   accessible name; the marker now sits outside the `<label>` (name stays "Password") and `requiredMark={false}` hides
   it. `SelectInput` has a shared equivalent, `Select` (Field + native select + chevron, `ui-select` classes). Both
   can be replaced and `classroom.css:56–58` (`.classroom-select*`) deleted. Existing locators (`getByLabelText('Password')`)
   keep working.
3. **Anchors styled as buttons.** `TeacherGoogleCallback` composes `class="ui-button ui-button-primary ui-button-md"`
   on `<a>`; use `<Button href="…" variant="primary">` (or `ButtonLink`) so links stop depending on class names.
4. **`.classroom-recovery button`** (`classroom.css:153`) is a hand-styled 40px button; use `Button size="sm"` (44px on
   touch automatically).

### W2 — landing (`src/brick/landing/**`)

Clean on every check: Fredoka/Nunito, zero non-token colours, 16 tab stops all with the 3px `--focus` ring, no
contrast failures (step "2" is ink on coral at 20px bold = large text, 4.11:1 ≥ 3:1; step "3" ink on butter 7.3:1),
nothing running under reduced motion, no controls under 44px at 390×844.

1. **`CtaLink` → `Button href`.** `LandingPage.tsx` hand-composes `ui-button` classes on anchors. `Button` now renders
   an `<a>` when given `href` (same classes/sizes/focus ring; `disabled` drops the href and sets `aria-disabled`), and
   `ButtonLink` is the typed anchor form. `landing.css:121–126` placement rules on `.landing-cta` still apply.

### Lead / unassigned

1. **Live world.** `src/brick/live/live-world.css:11–17` redefines `--live-ink/muted/blue/blue-dark/panel*` on
   `.live-world-page` (same blocking pattern as W4's), uses `backdrop-filter: blur(16–18px)` on eight panels over the
   canvas (l.48, 172, 206, 233, 250, 281, 450, 513) and keeps hand-styled `[aria-pressed='true']` toggles (l.298, 315,
   569). Same fixes as W4 items 1, 2 and W6 item 2.
2. **Settings modal.** `explore-camera-settings.css:3` `.studio-settings-backdrop` (fixed, `backdrop-filter: blur(4px)`,
   z-index 2000 outside the `--z-*` scale) is not on the `Sheet`/`Dialog` primitive; migrating it gets focus trap,
   Escape handling, the `--z-dialog` slot and the bottom-sheet layout for free.
3. **`src/main.tsx:36`** Suspense fallback still says "Welcome to Brick Studio…" (W2 noted it) → `BRAND_NAME`.

### W1 — design system (self)

- Fixed in this pass: Sheet restore-focus could land on `<body>` when the opener unmounted in the same commit; required
  marker inside `<label>`; no link/pressed/Select; 36–38px `sm`/segmented targets on touch.
- Open, low priority: the hover/pressed shades `#2E59AC` (primary) and `#B53C31` (danger) are literals in `ui.css`
  (the colour dialog's Apply button shows `rgb(46,89,172)` mid-tap); they could become `--primary-hover` /
  `--danger-hover` tokens if a lane needs them. `.ui-sheet-grip` has a 3px radius by design (decorative handle).

## Verified OK (no action)

- Focus ring: every tab stop on every surface reports `outline: solid 3px rgb(53,101,191)` (`--focus`), including
  anchors, radios, sliders and the sheet close buttons; the sheet trap keeps focus inside the dialog.
- Sheet stacking and behaviour: entry sheets (`ui-sheet-dialog`) become bottom sheets with the grip at 390×844; the
  onboarding guide underneath is `aria-modal="false"`, so Escape and the topmost-dialog rule behave.
- Contrast on butter/coral: only large display text uses ink on coral on the landing; no white-on-coral anywhere.
- Gallery spacing/radius: sheet header/body/footer padding, 12px control radius and 16px panel radius match across the
  entry panel, scene/character sheet, create-brick and colour dialogs.

## Files

- `consistency-review.mjs` — the script (env: `PLAYWRIGHT_MODULE`, `CHROME_PATH`, `UI_ORIGIN`).
- `review/findings.json` — every measurement above, keyed `surface/viewport`.
- `review/landing-{desktop,phone}.png`, `review/entry-signin-{desktop,phone}.png`, `review/scene-sheet-{desktop,phone}.png`,
  `review/character-sheet-desktop.png`, `review/create-brick-{desktop,phone}.png`, `review/color-dialog-desktop.png`,
  `review/editor-{desktop,phone}.png`.
