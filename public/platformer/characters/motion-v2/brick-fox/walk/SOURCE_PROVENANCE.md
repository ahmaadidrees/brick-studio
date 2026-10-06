# Brick Fox walk v2

Preview-only individual complete-pose generation. Root owns image generation; the preview lane owns selection copies, alignment metadata, and review UI. Exact generation and repair prompts are retained in `prompts/`; selected original output paths appear in `generation-sources.json` and SHA-256 hashes in `frames.json`. No exact generator model version is claimed.

This candidate requests wider contact poses, narrower passing poses, and opposite leg depth on the two halves. Phase labels describe requested order; `pose-observations.json`, when present, records the actual visible foot/hip and near/far identity findings. User manual playback review remains the proof of gait quality.

Uniform whole-pose scales calibrate head width to 478 source pixels. The shared 1005-pixel physical reference matches the approved run. Horizontal anchors follow the torso, floor placement follows solid soles, and source pixels remain unchanged. There is no added flight lift, artificial bob, or limb manipulation. Generated anatomy and body/head proportions can still vary.

Approved v1 run assets and metadata are unchanged. Previous walk candidates remain available below the latest pairs.

## Selected outputs

- 1. Contact A: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-553bead5-894b-4393-9a32-e7ae8f06ac9d.png`
- 2. Down A: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-ac421361-6883-405a-8056-54437b107f5b.png`
- 3. Passing A: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-0230a5d3-e4a3-4635-9a42-b1669ee672c6.png`
- 4. Up A: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-5219b899-287e-468f-baa1-5685d488d8a0.png`
- 5. Contact B: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-ebeec22c-2c0c-4957-a21f-851b4a359fe7.png`
- 6. Down B: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-373d9695-7f39-4ee8-8f0e-a0890fab715d.png`
- 7. Passing B: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-8ab825b2-4882-4fa6-a98e-c8e0902421f9.png`
- 8. Up B: `/Users/ahmaadidrees/.codex/generated_images/01a0f7ff-e038-7e30-9be7-376ea67fde9d/exec-cdd0431b-7144-4132-befc-be0c36bcf35b.png`
