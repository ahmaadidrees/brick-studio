# Builder six-pose run candidate v7

Root generated every selected output individually using the built-in image tool. No exact model version selector was available. Exact prompts and targeted repair prompts are in `prompts/`; original output paths are in `generation-sources.json`. The earlier unsuccessful passing attempts are not selected.

The source motion reference is the first row of [Animated Runner Character by irmirx](https://opengameart.org/content/animated-runner-character). Credit retained; the source page lists CC0 and CC-BY 3.0. `motion-references/SOURCES.md` records source inspection.

Selected order: Contact A, Passing A, Push-off A, Contact B, Passing B, Push-off B. The image originally prompted as Passing A now occupies Passing B because its foreground knee and backward foreground arm make that assignment more coherent. The repaired opposite pose occupies Passing A.

Every image remains an unchanged complete transparent PNG. `frames.json` records dimensions, SHA-256 hashes, pelvis anchors, and solid sole baselines. No added flight lift is used. Generated head sizes vary: the complete images receive uniform scales matching cap width to the 589 px reference cap, a reproducible head-size proxy. No body part is isolated, reconstructed, rotated, or stretched. Body proportions and head shapes still vary slightly after this calibration.

The new passing poses provide planted support under the hip and forward tucked knees. Alternating arm halves and darker far-leg shading are clearer. Passing B still lacks equally strong far-leg shading; push-off shoes have imperfect toe-contact anatomy; compression and recovery are not perfectly symmetric. These are remaining generated-art limitations. This is a local review candidate, not a production integration claim.

The localhost5186 comparison retains prior walk and run candidates at matched run cycles per second. Production files and deployment were not changed by this iteration.
