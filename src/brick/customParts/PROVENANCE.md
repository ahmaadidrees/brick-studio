# Provenance

The implementation was developed against repository base `2a427c73` on
`codex/custom-part-engine`.

Source contract reviewed:

- `packages/brick-core/src/types.ts`: document-v2 `CustomPartDefinition` and its
  ten bounded templates.
- `packages/brick-core/src/brickDocument.ts`: `custom_` ID syntax, name limit,
  integer bounds (8×8×12), stud modes, 24-part document cap, normalization, and
  schema-v1 compatibility.
- `packages/brick-core/src/parts.ts`: schema definition → ordinary `BrickPart`
  bridge and world scaling (0.62 per stud, 0.18 per plate).

Historical investigation included every local/remote branch, registered Codex
worktree, reachable custom-part commit, unreachable commit, the sibling
`Virtual Legos Claude Live UI` checkout, and the prior architecture transcript.
No earlier create-your-own-brick implementation or richer POC was present. The
most mature recoverable prior artifact was therefore the current schema-v2
parametric contract and its tests. The architecture record specifically ruled
out arbitrary uploads and CSG. This engine keeps those constraints and adds the
requested bounded box compiler rather than claiming provenance from a missing
prototype.

No third-party assets, geometry, source code, URLs, or generated binary artifacts
are included.
