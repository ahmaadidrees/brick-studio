# 4 · Platformer feel and collision

[← Index](INDEX.md) · **P2** · Research snapshot: **2026-09-30**

Evidence cells apply to the factual claims in their row. “Proposed” means a Brickgineers design or test recommendation, not an observed product capability. Unknowns are not negative capability claims.

## Source shelf and applicability

| Source | Use it for | Do not infer | Evidence |
| --- | --- | --- | --- |
| Celeste/TowerFall physics | Integer collision bodies, fractional movement accumulation, moving-solid carrying/pushing. | That its C# implementation is already deterministic JavaScript. | [CELPH](https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Celeste forgiveness | Forgiveness techniques. | Most numerical windows are unspecified. | [CELFOR](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Monteiro guide | Compare tile, smooth-tile, bitmask and vector collision approaches; slopes and semisolids. | Its reverse-engineered examples are the original games’ source code. | [MONTE](https://gamedev.net/tutorials/programming/general-and-gameplay-programming/the-guide-to-implementing-2d-platformers-r2936) · blog (primary technical author) · authorized reprint 2013-04-05; original 2012 · **high** |
| Sonic Physics Guide | Specialized reference lead for slope/ground-speed behavior. | Full algorithm or constants verified here: the page failed to open. | [SONIC](https://info.sonicretro.org/SPG:Running) · community wiki · search excerpt dated 2026-02-17; full page inaccessible · **low** |
| Building a Better Jump — Kyle Pittman | Requested talk remains a research lead. | Talk recording, exact GDC metadata and quoted constants were not successfully verified. Search GDC Vault by title/author before relying on it. | [GDC Vault catalogue](https://www.gdcvault.com/) · official docs/catalogue lead · checked 2026-09-30 · **low / unverified** |
| Game Feel — Steve Swink | Requested book remains a reading lead about control, response and presentation. | Specific findings or page numbers: publisher fetch returned 403. | [Publisher listing](https://www.routledge.com/Game-Feel-A-Game-Designers-Guide-to-Virtual-Sensation/Swink/p/book/9780123743282) · official publisher listing, inaccessible · checked 2026-09-30 · **low / content unverified** |


## Documented Nintendo-era values — not Code Lab defaults

| Game / value | Reported value and units | Confidence / limitation | Evidence |
| --- | --- | --- | --- |
| SMB horizontal precision | 16 effective subpixels per pixel. | Reverse-engineering reference, not Nintendo source; regional ROM not pinned. | [SMBPH](https://tasvideos.org/GameResources/NES/SuperMarioBros) · community wiki (original reverse engineering) · NES SMB; ROM revision unspecified; checked 2026-09-30 · **medium** |
| SMB variable jump | A one-frame jump-button press produces the shortest press duration discussed by the guide. | Does not establish a full gravity/velocity table or modern forgiveness rules. | [SMBPH](https://tasvideos.org/GameResources/NES/SuperMarioBros) · community wiki (original reverse engineering) · NES SMB; ROM revision unspecified; checked 2026-09-30 · **medium** |
| SMB3 subpixel storage | Fraction stored as a byte in increments of 16: effective 1/16-pixel resolution. | Distinguish byte storage /256 from effective increments /16. | [SMB3PH](https://tasvideos.org/GameResources/NES/SuperMarioBros3) · community wiki (original reverse engineering) · NES SMB3; ROM revision unspecified; checked 2026-09-30 · **medium** |
| SMB3 horizontal walking / swimming | Raw speed 24 → 1.5 pixels/frame. | These are per emulated frame, not per second. | [SMB3PH](https://tasvideos.org/GameResources/NES/SuperMarioBros3) · community wiki (original reverse engineering) · NES SMB3; ROM revision unspecified; checked 2026-09-30 · **medium** |
| SMB3 running without / with P meter | 40 → 2.5 pixels/frame; 56 → 3.5 pixels/frame. | Do not assume Mario Maker 2 uses these values. | [SMB3PH](https://tasvideos.org/GameResources/NES/SuperMarioBros3) · community wiki (original reverse engineering) · NES SMB3; ROM revision unspecified; checked 2026-09-30 · **medium** |
| SMB3 sliding | 63 → 3.9375 pixels/frame. | Same reverse-engineering caveat. | [SMB3PH](https://tasvideos.org/GameResources/NES/SuperMarioBros3) · community wiki (original reverse engineering) · NES SMB3; ROM revision unspecified; checked 2026-09-30 · **medium** |
| SMB3 flying row conflict | The page pairs raw 23 with 1.958 pixels/frame. Under its /16 scale, 23/16 = 1.4375. | Internal inconsistency: do not select either as validated flight speed; inspect ROM RAM and trace. | [SMB3PH](https://tasvideos.org/GameResources/NES/SuperMarioBros3) · community wiki (original reverse engineering) · NES SMB3; ROM revision unspecified; checked 2026-09-30 · **low** |
| SMB / SMB3 complete jumps | Initial vertical speeds, ascent/release/fall gravity tables and speed-dependent arcs not verified in this pass. | No invented “Mario constants” provided. Test a pinned ROM legally obtained by the researcher and record input/RAM traces. | [SMBPH](https://tasvideos.org/GameResources/NES/SuperMarioBros) · community wiki (original reverse engineering) · NES SMB; ROM revision unspecified; checked 2026-09-30 · **low**<br>[SMB3PH](https://tasvideos.org/GameResources/NES/SuperMarioBros3) · community wiki (original reverse engineering) · NES SMB3; ROM revision unspecified; checked 2026-09-30 · **low** |


## Feel techniques: observed precedent → explicit parameter

| Technique | Documented precedent | Code Lab parameter / acceptance test (proposed) | Evidence |
| --- | --- | --- | --- |
| Coyote time | Celeste allows jumping shortly after leaving a ledge. | Store lastGroundedTick; jump at window−1 succeeds, window+1 fails; consume entitlement once. | [CELFOR](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Jump buffering | Celeste accepts a held jump shortly before landing. | Store press tick; landing within buffer executes one jump; expired input does not. | [CELFOR](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Variable jump / apex | Celeste halves apex gravity while holding jump. | Expose short/full jump height separately; release during ascent must never produce a higher apex. | [CELFOR](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Jump corner correction | Celeste nudges a near-miss head collision sideways. | Bound maximum correction and deterministic left/right tie-break; never teleport through a full-width ceiling. | [CELFOR](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Dash corner / semisolid assistance | Celeste can pop the player onto a ledge or semisolid during a near-horizontal dash. | Keep dash assistance separate from ordinary falling collision; instrument correction reason. | [CELFOR](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Lift momentum | Celeste retains platform momentum briefly after a platform stops. | Store bounded lift-velocity history; test immediate jump, delayed jump and expired carry momentum. | [CELFOR](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Wall-jump reach | Article says ordinary wall jumps reach 2 pixels; super-wall-jump estimate is 5 with author uncertainty. | Do not transplant pixel distances without matching character/world scale; 5 is not a verified exact constant. | [CELFOR](https://www.maddymakesgames.com/articles/celeste_and_forgiveness/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **medium** |


## Collision methods

| Method | Source-backed distinction | Code Lab evaluation (proposed) | Evidence |
| --- | --- | --- | --- |
| Pure tile positions | Actors occupy whole tile cells; discrete movement simplifies overlap. | Useful editor painting model; insufficient alone for smooth player movement. | [MONTE](https://gamedev.net/tutorials/programming/general-and-gameplay-programming/the-guide-to-implementing-2d-platformers-r2936) · blog (primary technical author) · authorized reprint 2013-04-05; original 2012 · **high** |
| Smooth movement + tile solids | Move a collision box continuously; resolve axes against nearby tiles. | Strong first implementation candidate: spatial grid plus explicit player body. | [MONTE](https://gamedev.net/tutorials/programming/general-and-gameplay-programming/the-guide-to-implementing-2d-platformers-r2936) · blog (primary technical author) · authorized reprint 2013-04-05; original 2012 · **high** |
| Per-pixel / bitmask | Collision follows image occupancy rather than a simple box. | Keep Scratch sensing and platformer body collision separately testable; edited costumes should not accidentally resize physics. | [MONTE](https://gamedev.net/tutorials/programming/general-and-gameplay-programming/the-guide-to-implementing-2d-platformers-r2936) · blog (primary technical author) · authorized reprint 2013-04-05; original 2012 · **high** |
| Vector geometry | More general geometric shapes support arbitrary surfaces at increased implementation complexity. | Add only when levels need shapes outside tiles/slopes; preserve stable contact ordering. | [MONTE](https://gamedev.net/tutorials/programming/general-and-gameplay-programming/the-guide-to-implementing-2d-platformers-r2936) · blog (primary technical author) · authorized reprint 2013-04-05; original 2012 · **high** |
| One-way platform | Use previous position relative to the surface, not merely downward velocity. | In y-up: land only when previous feet ≥ top and proposed feet ≤ top while descending; ignore horizontal sides. | [MONTE](https://gamedev.net/tutorials/programming/general-and-gameplay-programming/the-guide-to-implementing-2d-platformers-r2936) · blog (primary technical author) · authorized reprint 2013-04-05; original 2012 · **high** |
| Slope attachment | Slope surface interpolation and downward attachment prevent repeatedly falling off descending terrain. | Test uphill/downhill seams, peak/valley joins, high speed, side entry and maximum slope. | [MONTE](https://gamedev.net/tutorials/programming/general-and-gameplay-programming/the-guide-to-implementing-2d-platformers-r2936) · blog (primary technical author) · authorized reprint 2013-04-05; original 2012 · **high** |


## Moving platforms: carrying is not parenting

| Operation | Verified implementation pattern | Evidence |
| --- | --- | --- |
| Actor movement | Celeste/TowerFall separates Actor and Solid. Actor movement accumulates fractions, then performs integer pixel steps until blocked. | [CELPH](https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Collision callback | MoveX/MoveY accept collision callbacks; velocity/gravity handling is outside base Actor movement. | [CELPH](https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Before solid motion | Record which actors are riding; temporarily disable the moving solid’s collision while resolving actors. | [CELPH](https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Push vs carry | Overlap after solid motion causes pushing; otherwise prior riders are carried. Pushing takes precedence. | [CELPH](https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |
| Crush | A push can call a squish callback when another obstacle prevents escape. | [CELPH](https://www.maddymakesgames.com/articles/celeste_and_towerfall_physics/index.html) · blog (primary developer) · undated; checked 2026-09-30 · **high** |


## “Move with collisions” API precedents

| Maker | API contract / conventions | Implication | Evidence |
| --- | --- | --- | --- |
| MakeCode Arcade | The v1.3.42 loop document describes substepped velocity integration, wall/tile handling and sprite-overlap callbacks. | Historical reference, not a current commit-level behavior guarantee. | [ARLOOP](https://arcade.makecode.com/developer/game-loop) · official docs · document explicitly describes v1.3.42; historical, not current-source verification · **high** |
| GDevelop | Platformer character uses bounding rectangles derived from collision masks; platform, jump-through and ladder roles are explicit. | Custom visual outline is not automatically the exact platformer collision geometry. | [GDPH](https://wiki.gdevelop.io/gdevelop5/behaviors/platformer/) · official docs · rolling GDevelop 5 docs; checked 2026-09-30 · **high** |
| GDevelop tuning | Acceleration/deceleration, maximum speed, jump speed, sustain time, gravity and maximum fall speed are configurable; advanced extension adds further maneuvers. | Expose units and behavior ownership; do not combine invisible platformer movement with Scratch move blocks without a documented ordering. | [GDPH](https://wiki.gdevelop.io/gdevelop5/behaviors/platformer/) · official docs · rolling GDevelop 5 docs; checked 2026-09-30 · **high** |
| Construct | Platform behavior exposes speed (px/s), acceleration (px/s²), gravity, jump strength and jump sustain (ms). Simulated controls and fall-through actions exist. | Document Code Lab units; do not call a velocity value “steps”. | [CPH](https://www.construct.net/en/make-games/manuals/construct-3/behavior-reference/platform) · official docs · page updated 2024-02-16; checked 2026-09-30 · **high** |
| Construct body separation | Documentation recommends a separate invisible rectangular collision object to avoid animated-image collision changes. | Keep “Physics body” visible in the editor even when its runtime helper is hidden. | [CPH](https://www.construct.net/en/make-games/manuals/construct-3/behavior-reference/platform) · official docs · page updated 2024-02-16; checked 2026-09-30 · **high** |
| Construct sustain | Jump sustain can hold initial upward velocity before gravity; 200 ms is a documentation example, not a universal default. | Variable jump height has multiple algorithms; select and name the actual one. | [CPH](https://www.construct.net/en/make-games/manuals/construct-3/behavior-reference/platform) · official docs · page updated 2024-02-16; checked 2026-09-30 · **high** |


## Y-up jump design worksheet — derived, not measured game constants

For a continuous constant-gravity model with initial upward speed `v0`, gravity magnitude `g > 0`, desired apex height `H` and time-to-apex `T`: `g = 2H/T²`, `v0 = 2H/T`. These follow from `v(T)=v0−gT=0` and `H=v0T−gT²/2`. **Mathematical derivation, high confidence under these assumptions; not a Mario/Celeste claim.** Discrete integration, sustain, drag, speed caps and collision change the realized arc. Relevant API units: [CPH](https://www.construct.net/en/make-games/manuals/construct-3/behavior-reference/platform) · official docs · page updated 2024-02-16; checked 2026-09-30 · **high**

**Proposed integration contract:** state all velocities in pixels/second, choose a fixed simulation step, update `vy -= g*dt`, then sweep `dy = vy*dt`. Measure the resulting apex and adjust to desired gameplay; do not promise the continuous formula is exact for this update order. Keep Scratch motion available as its own operation and expose collision-aware movement under Platformer.


## Collision acceptance suite (proposed; no executions)

| ID | Inputs / fixture | Expected contract to adopt |
| --- | --- | --- |
| P01 | Solid floor; player feet exactly on top; gravity enabled | No sinking or alternating grounded state. |
| P02 | One-tile wall; displacement exceeds tile width | No tunneling; earliest hit stops movement. |
| P03 | Walk into wall and jump along it | Horizontal collision does not cancel upward motion. |
| P04 | Jump from below a one-way platform, then descend | Pass up; land from above; identical replay. |
| P05 | Drop-through requested while grounded on one-way | Ignore selected support until feet clear it; do not disable all world solids. |
| P06 | Flat→slope→flat at both slow and maximum speed | No seam snagging, flicker or unintended launch. |
| P07 | Platform translates +4x while player stands on it | Player displaced +4x unless another obstacle blocks; support remains explicit. |
| P08 | Rising platform crushes player into ceiling | Deterministic crush response; no embedded survivor. |
| P09 | Two platforms contact same player simultaneously | Stable priority independent of array insertion order chosen by renderer. |
| P10 | Costume changes to huge transparent image | Physics body unchanged unless explicitly edited. |
| P11 | Player hidden or ghosted | Scratch touching follows §1; Platformer collider follows its explicit enabled flag, not assumed equality. |
| P12 | Pause, resume, replay same input trace | Identical tick-state hashes; display frame rate does not alter physics. |


## Unresolved

| Gap | How to resolve |
| --- | --- |
| Exact SMB/SMB3 jump tables and regional differences | Pin disassembly commit + legal ROM hash; trace velocities, subpixels and button state through short/full/running jumps. |
| Full Sonic guide | Read original guide and pin a Sonic disassembly; test slope sensors, ground/air transition and loop behavior before reusing constants. |
| Named jump talk / Swink book content | Acquire authorized recording/book; record exact timestamp/page and separate speaker recommendation from measured result. |
| Default feel for young students | Classroom A/B test parameter presets using completion/errors and student preference; no universal “best” coyote time established. |
| Current Arcade source and interactions with custom scripting | Pin pxt-common-packages physics source and add event-order, carry and tunneling tests. |

