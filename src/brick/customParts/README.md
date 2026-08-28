# Custom-part engine (unmounted)

This directory is an additive, renderer-agnostic custom-part compiler. It does
not register UI, scene objects, routes, persistence, or network behavior. The
feature gate defaults to off and compilation requires `{ enabled: true }`.

## Integrator API

```ts
import {
  compileCustomPart,
  createCustomPartPreviewDescriptor,
  serializeCompiledCustomPart,
} from './customParts'

const result = compileCustomPart(untrustedJsonValue, { enabled: featureFlag })
if (result.ok) {
  const schemaV2Definition = result.part.schemaV2Part
  const rendererData = result.part.render
  const physicsData = result.part.physics
  const preview = createCustomPartPreviewDescriptor(result.part)
  const cacheValue = serializeCompiledCustomPart(result.part)
}
```

`schemaV2Part` uses the existing document contract: a deterministic `custom_…`
ID, a trimmed name, `template: "solid"`, integer width/depth/height bounds, and
the selected stud mode. The richer box source remains engine-owned until a
future shared document schema explicitly adopts it.

## Coordinate and trust contract

- The only primitive is an axis-aligned box.
- x/z are measured in studs, y is measured in plates.
- x/z origin is the center of the declared footprint; y=0 is its base.
- Input must be plain data with exact known fields. Accessors, custom
  prototypes, unknown fields, holes, arbitrary URLs, code, uploads, asset
  references, geometry objects, and material definitions have no schema path.
- Compilation allocates descriptors only. It does not fetch, evaluate, import,
  parse GLB, perform CSG, or allocate renderer/physics-engine objects.

## Budgets

- Bounds: 1–8 studs wide/deep and 1–12 plates tall (matching document v2).
- 1–32 boxes, using no more than four built-in material slots.
- 1–16 cuboid colliders.
- Every numeric value is finite and limited to six decimal places.
- Every box axis is at least 1/64 authoring unit and must remain in bounds.
- Combined render-box volume is at most 2× bounds volume; collider volume is at
  most 1.25× bounds volume. These caps bound overlap amplification.

IDs are derived from a stable canonical serialization using two independent
64-bit FNV-1a passes. Box order is canonicalized because it is not semantic.
Compiled output is deeply frozen and stable serialization reconstructs all keys
in a fixed order. The hash is a deterministic cache/document identity, not a
cryptographic signature; validation remains mandatory at every trust boundary.
