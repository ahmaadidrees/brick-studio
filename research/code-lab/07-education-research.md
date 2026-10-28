# 7 · Education research

[← Index](INDEX.md) · **P3** · Research snapshot: **2026-09-30**

Evidence cells apply to the factual claims in their row. “Proposed” means a Brickgineers design or test recommendation, not an observed product capability. Unknowns are not negative capability claims.

## Research shelf: finding, boundary, classroom use

| Source / framework | What is supported | Boundary / Code Lab use (proposal) | Evidence |
| --- | --- | --- | --- |
| Use–Modify–Create | Begin by using an existing program, then change it, then construct a new one; guiding questions accompany exploration. | Map to play a sample → alter a brick’s parameter/code → author a brick. This is a teaching progression, not proof that a particular editor causes learning. | [UMC](https://kaporfoundation.org/strategies_guide/use-modify-create/) · official docs (educator guide) · undated; checked 2026-09-30 · **high** |
| 2021 middle-grades UMC design case | Published design case documents UMC in middle-grades computational-thinking instruction. | Useful implementation example; do not report an effect size or randomized comparison from the citation alone. | [UMC2021](https://scholarworks.iu.edu/journals/index.php/ijdl/article/view/30733) · peer-reviewed design case · 2021-11-01; IJDL 12(3); DOI 10.14434/ijdl.v12i3.30733 · **medium** |
| Low floor / high ceiling / wide walls | Resnick argues for easy entry, sophisticated possibilities and diverse personally meaningful paths—not merely a ladder to harder exercises. | Keep the platformer module, but offer story, exploration, puzzle, comedy and art prompts rather than one race-to-the-finish assignment. | [WIDE](https://mres.medium.com/designing-for-wide-walls-323bdb4e7277) · blog (primary author) · 2020-06-03 repost of August 2016 essay · **high** |
| Kafai: playing versus making | The 2006 perspective distinguishes instructionist uses of games from constructionist learning through making games. | A theoretical/perspective source, not a universal experiment showing making beats playing. Assess debugging and explanation, not only a polished game. | [KAFAI](https://journals.sagepub.com/doi/10.1177/1555412005281767) · peer-reviewed · Kafai, 2006; Games and Culture 1(1); abstract/bibliography verified · **medium** |
| Scratch concept learning | The 2010 classroom study reports learning with difficulties involving initialization, variables and concurrency. | Two ordinary middle-school settings; do not extrapolate prevalence to all grade-school children or claim it studied Scratch 3 clones. | [MISCON](https://weizmann.elsevierpure.com/en/publications/learning-computer-science-concepts-with-scratch-2) · peer-reviewed (institutional abstract) · Meerbaum-Salant, Armoni & Ben-Ari, ICER 2010; DOI 10.1145/1839594.1839607 · **high** |
| Remix credit | The 2011 study combines an attribution intervention with 12 interviews; automatic credit does not have the same social meaning as deliberate acknowledgement. | Keep automatic provenance and invite students to say what they changed and whom they thank. Public real names are unnecessary. | [REMIX](https://www.microsoft.com/en-us/research/publication/computers-cant-give-credit-how-automatic-attribution-falls-short-in-an-online-remixing-community/) · peer-reviewed (author institution page) · Monroy-Hernández et al., CHI 2011; DOI 10.1145/1978942.1979452 · **high** |


## The 2025 “Scratch-only beats Scratch + robots” claim

| Question | Verified answer | Evidence |
| --- | --- | --- |
| Did such a study exist? | Yes: Sigayret, Blanc and Tricot, JCAL, first published June 5, 2025; two experiments. | [ROBOTS](https://onlinelibrary.wiley.com/doi/10.1111/jcal.70074) · peer-reviewed · Sigayret, Blanc & Tricot; first published 2025-06-05; JCAL 41(4), e70074 · **high** |
| What did it find? | Novice grade-5 Scratch-only students performed better on programming concepts/skills than the compared unplugged and Scratch+Thymio conditions. The second experiment linked robot use with greater extraneous cognitive load; robots also improved motivation. | [ROBOTS](https://onlinelibrary.wiley.com/doi/10.1111/jcal.70074) · peer-reviewed · Sigayret, Blanc & Tricot; first published 2025-06-05; JCAL 41(4), e70074 · **high** |
| Important design limitation | The robot condition was collected a year after the earlier Scratch/unplugged data, which were reanalyzed using mixed models. Do not describe this as one contemporaneous three-arm randomized trial. | [ROBOTS](https://onlinelibrary.wiley.com/doi/10.1111/jcal.70074) · peer-reviewed · Sigayret, Blanc & Tricot; first published 2025-06-05; JCAL 41(4), e70074 · **high** |
| What follows for Brickgineers? | A focused on-screen introduction is defensible. It does not prove robots are generally inferior, eliminate their motivational value, or establish long-term transfer to physical engineering. | Research interpretation · based on [ROBOTS](https://onlinelibrary.wiley.com/doi/10.1111/jcal.70074) · peer-reviewed · Sigayret, Blanc & Tricot; first published 2025-06-05; JCAL 41(4), e70074 · **medium** |


## Novice misconception probes — distinguish evidence from hypotheses

| Concept | Short diagnostic (proposed) | Expected learning / UI support (proposed) | Evidence basis |
| --- | --- | --- | --- |
| Initialization | Run a project twice without reloading; ask why a score differs. | Explicit start/reset contract; show which values persist and which code resets. | [MISCON](https://weizmann.elsevierpure.com/en/publications/learning-computer-science-concepts-with-scratch-2) · peer-reviewed (institutional abstract) · Meerbaum-Salant, Armoni & Ben-Ari, ICER 2010; DOI 10.1145/1839594.1839607 · **high** |
| Variable vs displayed label | Set local health on one painted copy and ask which copies change. | Inspector should reveal owner: level-global versus this copy. The exact painted-copy model is Code Lab’s declared design, not a Scratch study finding. | [MISCON](https://weizmann.elsevierpure.com/en/publications/learning-computer-science-concepts-with-scratch-2) · peer-reviewed (institutional abstract) · Meerbaum-Salant, Armoni & Ben-Ari, ICER 2010; DOI 10.1145/1839594.1839607 · **high** |
| Concurrency | Two green-flag scripts change the same variable; predict a trace at each yield. | Offer a step trace with script/instance identity; distinguish simultaneous-looking animation from cooperative execution. | [MISCON](https://weizmann.elsevierpure.com/en/publications/learning-computer-science-concepts-with-scratch-2) · peer-reviewed (institutional abstract) · Meerbaum-Salant, Armoni & Ben-Ari, ICER 2010; DOI 10.1145/1839594.1839607 · **high** |
| Broadcast is not a function call | A sender broadcasts, then changes a costume; receiver waits before responding. Compare broadcast-and-wait. | Show receivers and which threads the sender is waiting for. **Prevalence of this misconception not verified here**; runtime contrast is established in §1. | [§1 hats](01-scratch-runtime-semantics.md) · source-derived diagnostic · 2026-09-30 · **medium** |
| Template versus instance | Change costume art on a brick template; change only one placement’s local health. Predict each effect. | Preview “all copies” versus “this copy” scope before editing. This is a Code Lab hypothesis, not an established research result. | User-specified architecture → proposed classroom probe · 2026-09-30 · **medium** |
| Cloning is not duplication of execution | Clone during a running script; predict whether execution continues at the same block in the child. | Visualize a new instance and its clone-start hat. **No cited study establishes clone-misconception frequency.** | [§1 clones](01-scratch-runtime-semantics.md) · source-derived diagnostic · 2026-09-30 · **medium** |


## ScratchJr design choices worth borrowing selectively

| Verified choice | Code Lab implication (proposed) | Evidence |
| --- | --- | --- |
| Designed for ages 5–7; graphical blocks create interactive stories and games. | Use large meaningful targets and short initial programs; grade level is not interchangeable with reading fluency. | [JR](https://www.scratchjr.org/about/info) · official docs · current indexed description checked 2026-09-30; live page requires JavaScript · **medium** |
| Children can paint characters and add their voices, sounds and photos. | Support personally meaningful art; route recording/photo features through the privacy plan rather than copying a feature without its consent requirements. | [JR](https://www.scratchjr.org/about/info) · official docs · current indexed description checked 2026-09-30; live page requires JavaScript · **medium** |
| Interface and language were redesigned for younger children, not simply reduced in size. | Keep a small starter palette and gradual disclosure, but preserve the chosen Scratch semantics for blocks that retain Scratch names. | [JRDES](https://scratchfoundation.org/learn/learning-library/scratchjr-interface) · official docs · rolling resource; checked 2026-09-30 · **high** |


## Lightweight classroom evaluation plan — proposed, not a validated instrument

| Stage | Task | Record |
| --- | --- | --- |
| Use | Play a starter, then predict one enemy’s behavior before opening its code. | Prediction accuracy and whether the student can locate the responsible script. |
| Modify | Change jump height or enemy patrol; state the intended effect first. | Whether only intended behavior changes; debugging steps; student explanation. |
| Create | Make a new brick without the starter code. | Decomposition, event choice, use of state, and independent testing. |
| Transfer | Solve the same concept with different art/layout, then with a small text view. | Separate recognition of the previous example from concept transfer. |
| Equity / accessibility | Offer several themes and input methods; observe who needs help and where. | Reading, drag precision, palette navigation and collaboration bottlenecks—not a single aggregate engagement score. |


Rationale sources: [UMC](https://kaporfoundation.org/strategies_guide/use-modify-create/) · official docs (educator guide) · undated; checked 2026-09-30 · **high**<br>[MISCON](https://weizmann.elsevierpure.com/en/publications/learning-computer-science-concepts-with-scratch-2) · peer-reviewed (institutional abstract) · Meerbaum-Salant, Armoni & Ben-Ari, ICER 2010; DOI 10.1145/1839594.1839607 · **high**<br>[WIDE](https://mres.medium.com/designing-for-wide-walls-323bdb4e7277) · blog (primary author) · 2020-06-03 repost of August 2016 essay · **high**. Collect only the minimum school-approved research data; privacy constraints are in [§9](09-school-privacy-moderation.md).

## Unresolved

| Gap | How to resolve |
| --- | --- |
| UMC causal advantage for this interface | Compare lesson variants with comparable time, teacher support and prior knowledge; predefine concept-level outcomes. |
| Clone/broadcast misconception prevalence in elementary students | Run think-aloud predictions with consent; code errors against runtime traces; do not invent percentages. |
| Long-term Scratch-only versus robotics transfer | Read follow-up studies and run delayed tasks matched to the intended outcome, including motivation and physical-system reasoning. |
| ScratchJr exact current block inventory | Open current app and official block guide; document absent/present constructs rather than infer from the smaller interface. |
| Game-making effect sizes | This section verifies conceptual sources and selected findings, not a meta-analysis. Acquire full systematic reviews before making quantified marketing claims. |

