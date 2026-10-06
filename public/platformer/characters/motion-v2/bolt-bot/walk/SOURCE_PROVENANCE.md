# Bolt Bot walk v2

Preview-only individual complete-pose generation. Root owns image generation; the preview lane owns selection copies, alignment metadata, and review UI. Exact generation and repair prompts are retained in `prompts/`; selected original output paths appear in `generation-sources.json` and SHA-256 hashes in `frames.json`. No exact generator model version is claimed.

This candidate requests wider contact poses, narrower passing poses, and opposite leg depth on the two halves. Phase labels describe requested order; `pose-observations.json`, when present, records the actual visible foot/hip and near/far identity findings. User manual playback review remains the proof of gait quality.

Uniform whole-pose scales calibrate head width to 605 source pixels. The shared 1021-pixel physical reference matches the approved run. Horizontal anchors follow the torso, floor placement follows solid soles, and source pixels remain unchanged. There is no added flight lift, artificial bob, or limb manipulation. Generated anatomy and body/head proportions can still vary.

Approved v1 run assets and metadata are unchanged. Previous walk candidates remain available below the latest pairs.

## Selected outputs

- 1. Contact A: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-4647699b-5214-4e1a-8f00-2e4fca80f861.png`
- 2. Down A: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-9c00e779-ea8b-482e-acff-827594036333.png`
- 3. Passing A: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-c88aff7e-c6b4-43b3-bf70-b03ec412ee41.png`
- 4. Up A: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-d7bf7fdd-8e6f-4d68-9051-57fef336eea9.png`
- 5. Contact B: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-fed820cd-0272-43d3-89cd-ab0f3fc58984.png`
- 6. Down B: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-7f47de52-f21e-4429-9024-0f35efd8ac82.png`
- 7. Passing B: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-8e85fd36-85c2-434c-bb7f-4d0ffc3a90e6.png`
- 8. Up B: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-86a77f74-0b1f-453f-aabf-e05c272f4a82.png`
