# Chromebook real-device checklist

One pass on one real student device. Fill in every row; "worked" is not enough — write the
number or the feeling. Pair it with a second device for the last section. For frame-time
numbers use docs/PERF-BASELINE.md; this page is the teacher's hands-on pass.

## Device and session

| Field | Value |
|---|---|
| Date / tester | |
| Device model (e.g. Lenovo 100e Gen 3) | |
| CPU / RAM (chrome://system → `cpuinfo`, `meminfo`) | |
| ChromeOS version and Chrome version (chrome://version) | |
| Screen size, touchscreen? (yes / no) | |
| Network (school Wi-Fi / hotspot), other tabs open? | |
| URL tested (production, or the exact preview URL) | |

## Load and first build

| Check | Result |
|---|---|
| Cold load: seconds from pressing Enter on `/welcome` until the page is readable | s |
| Cold load: seconds from pressing Enter on `/` until the plate is visible and a brick can be placed | s |
| First brick placed without help? Time from plate visible to first placement | yes / no, s |
| Anything confusing about the first minute (write it down verbatim) | |

## Trackpad building controls

| Check | Result |
|---|---|
| Orbit (drag on empty space): smooth / laggy / jumpy | |
| Pan (two-finger drag, right-drag or Shift-drag): smooth / laggy / did not work | |
| Zoom (pinch or two-finger scroll): smooth / too fast / too slow | |
| Select tool → drag a box around ~20 bricks: all selected? | |
| Drag the selected group to a new spot, then Undo: exact restore? | |
| Custom color: select bricks → color → custom hex or wheel → Apply, then Undo | |
| Height handle: drag a selection up; blocked feedback when raising into a ceiling | |
| Custom brick: create a large one (e.g. 16 × 16 × 12), place it, still responsive? | |

## Explore

| Check | Result |
|---|---|
| Enter Explore on a ~250-brick build: seconds until you can move | s |
| Walking feel: smooth / ok / choppy (also run the perfProbe from PERF-BASELINE.md) | |
| Scene: Classic Studio — load time, feel | |
| Scene: Toy Room — load time, feel | |
| Scene: Brick Valley — load time, feel | |
| Scene: Sky Island — load time, feel | |
| Character: Classic Builder vs Toy Figure vs Robot Hero — any difference in feel? | |
| Back to building: does the build come back exactly? | |

## Touch (only if the device has a touchscreen)

| Check | Result |
|---|---|
| Tap to place, tap to select | |
| Virtual joystick walking, swipe-area camera, jump, return buttons | |
| Brick drawer bottom sheet: scroll, pick, close | |

## Accounts and saving

| Check | Result |
|---|---|
| Join a class with the class code; create username + password (no email) | |
| Save to my account → My Worlds shows it; sign out; sign in; reopen: identical? | |
| Change password when a temporary password was set | |
| Sign out / switch account works on a shared device (previous student's work not visible) | |

## Build together from a second device

| Check | Result |
|---|---|
| Device A: ⋯ menu → Build together → room opens; copy invite link | |
| Device B: open link, enter a builder name, join: seconds until both see each other | s |
| Each device places 5 bricks: both see all 10 within a second or two? | |
| Device B closes the tab and reopens the link: build intact? | |
| Owner switches Build ↔ Explore: guest follows? | |

## Verdict

| Field | Value |
|---|---|
| Biggest problem seen | |
| Would you run a full class on this device today? (yes / with caveats / no) | |
| Screenshots or video saved where | |
