# Third-party assets

This file records every asset vendored into the repository, with its source and
licence. Append a row whenever an asset is added; do not vendor anything whose
licence is not recorded here.

| Asset | Files | Source | Licence |
| --- | --- | --- | --- |
| _(none yet)_ | — | — | — |

## Explore toy figure (`exp2/char-toyfig`)

**No third-party assets. Zero bytes added to the payload.**

The Explore character is built entirely from procedural `three` primitives at
runtime (`src/brick/BlockAvatar.tsx`) — lathe torso, ellipsoid cranium, capsule
limbs, sphere joints — and its face is a 2×2 expression atlas painted into a
`<canvas>` on mount (`src/brick/avatarFace.ts`). Nothing is fetched, nothing is
bundled, and the figure works offline.

This was a deliberate choice rather than an oversight. A downloaded CC0 character
would have arrived with its own rig and its own baked animation clips, and the
brief for this lane is procedural animation driven from the live `MotionSnapshot`
the character controller already publishes — gait phase advanced by distance
travelled, squash scaled by real impact speed, tuck driven by vertical velocity.
Those read the physics every frame in a way a canned clip cannot.

### Design provenance

The figure is an original design. Its proportions are deliberately distinct from
a LEGO minifigure: a tall rounded ellipsoid head instead of a cylinder with a top
stud, a torso that is widest at the chest and pinches at the waist (the inverse of
the minifigure's flared trapezoid), visible spherical ball joints at the
shoulders, elbows and hips, rounded mitten hands rather than C-shaped claws, and
fully separate articulated legs with knee and ankle joints.
