# Approved cartoon walking and running release

User accepted Builder walk v8 / run v7 and Bot/Fox walk v2 / run v1 in the local comparison preview, then requested production shipping. Replaces assembled procedural moving limbs with complete individual poses: eight per walk and six per run. Idle, jumping, landing, and other special actions retain their existing art. Gait phase continues to come from the existing distance-based movement and multiplayer fields; physics/protocol unchanged.

Selected source metadata is recorded in source-metadata.json. Runtime WebP copies use cwebp quality90, alpha quality100, width256 with preserved aspect ratio. All42frames together total577376bytes. PNG originals remain in the review artifact. Per-loop source provenance is copied beside runtime assets. Complete loops load before playback; existing character art remains the fallback while loading.

Validation: production TypeScript/Vite build; focused character renderer, gait state, session and remote pose tests. User visually accepted full-size review loops before packaging. In-game production device testing remains manual. Two stale session assertions using the retired absolute-distance cycle were updated to exercise current incremental movement and quantization. No backend deployment required.
