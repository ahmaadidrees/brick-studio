# 9 · Kids’ content, privacy and moderation in schools

[← Index](INDEX.md) · **P3** · Research snapshot: **2026-09-30**

Evidence cells apply to the factual claims in their row. “Proposed” means a Brickgineers design or test recommendation, not an observed product capability. Unknowns are not negative capability claims.

**US-focused operational reference, not legal advice.** Applicability depends on school, jurisdiction, data flows and contracts. This is not a 50-state survey or a certification of compliance.

## Law / authorization lookup

| Regime | Relevant rule | Code Lab consequence (interpretation) | Evidence |
| --- | --- | --- | --- |
| COPPA scope | Applies to covered operators collecting personal information online from children under 13, including child-directed services and actual-knowledge cases. | Teacher-built and free are not, by themselves, exemptions. | [COPPARULE](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule) · official government rule publication · 90 FR 16918; published 2025-04-22; effective 2025-06-23; general compliance 2026-04-22 · **high** |
| COPPA school authorization | FTC permits schools to act for parents only for school-benefit educational use, without another commercial purpose; the operator retains compliance duties. | Document authorized school use. A teacher account does not automatically authorize public galleries, unrelated analytics or marketing. | [COPPA](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) · official docs (FTC guidance) · checked 2026-09-30; page warns to consult amended rule · **high** |
| 2025 amended rule | Published April 22, 2025; effective June 23, 2025; general compliance deadline April 22, 2026, with specified Safe Harbor exceptions. New security/retention and consent provisions apply. | Do not use an old implementation checklist as current law. | [COPPARULE](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule) · official government rule publication · 90 FR 16918; published 2025-04-22; effective 2025-06-23; general compliance 2026-04-22 · **high** |
| Schools in the 2025 rulemaking | FTC did not finalize proposed school/ed-tech amendments; it said existing ed-tech guidance continues. | Do not mistake proposed “school-authorized education purpose” text for enacted rules. | [COPPARULE](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule) · official government rule publication · 90 FR 16918; published 2025-04-22; effective 2025-06-23; general compliance 2026-04-22 · **high** |
| FERPA education records | Records directly related to a student and maintained by a covered institution or a party acting for it can be education records. Audio and other formats count. | Student-linked saved games, drawings and recordings may be records, not just grades. | [FERPA](https://studentprivacy.ed.gov/ferpa) · official docs (US Department of Education) · 34 CFR Part 99; current page checked 2026-09-30 · **high** |
| FERPA school-official exception | Outsourced provider must perform an institutional function, be under school direct control for records, and comply with use/redisclosure limits; access needs legitimate educational interest. | Contract, permissions, support access and deletion/export controls matter. Do not say “FERPA certified.” | [FERPA](https://studentprivacy.ed.gov/ferpa) · official docs (US Department of Education) · 34 CFR Part 99; current page checked 2026-09-30 · **high** |
| SOPIPA operator / content | Targets operators knowingly designed/marketed primarily for K–12 school purposes. Covered information includes identifiable pupil materials, documents and voice recordings. | Code Lab’s school positioning and student-linked creations make this a priority review. | [SOPIPA](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584.) · official statute · Cal. BPC §22584; AB 801 amendment effective 2025-01-01 · **high** |
| SOPIPA restrictions | Restricts targeted advertising, noneducational profiling, sale and disclosures; requires reasonable security and school-requested deletion, subject to statutory exceptions. | Use service-provider contracts and a documented deletion path; avoid student-data advertising. | [SOPIPA](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584.) · official statute · Cal. BPC §22584; AB 801 amendment effective 2025-01-01 · **high** |
| SOPIPA 2025 amendment | Adds a qualified parent/former-pupil request route for CCPA-excluded data after leaving the LEA, with documentation and record exceptions. | Implement request triage; do not promise every record must be erased immediately. | [SOPIPA](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584.) · official statute · Cal. BPC §22584; AB 801 amendment effective 2025-01-01 · **high** |


## Content-type inventory

| Content | Risk / classification | Recommended default (proposal) | Evidence |
| --- | --- | --- | --- |
| Typed names, signs, descriptions, code comments | Text can reveal contact/identifying information; student linkage also matters. | Minimize requested identity; review all display surfaces, including comments and saved strings. | [COPPA](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) · official docs (FTC guidance) · checked 2026-09-30; page warns to consult amended rule · **high**<br>[FERPA](https://studentprivacy.ed.gov/ferpa) · official docs (US Department of Education) · 34 CFR Part 99; current page checked 2026-09-30 · **high** |
| Drawings / costumes | A generic drawing is not automatically COPPA personal information; identity embedded in art or linkage to records changes the analysis. | Private to class by default; human preview before broader sharing; preserve original privately while review is pending. | Application of [COPPA](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) · official docs (FTC guidance) · checked 2026-09-30; page warns to consult amended rule · **medium**<br>[SOPIPA](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584.) · official statute · Cal. BPC §22584; AB 801 amendment effective 2025-01-01 · **medium** |
| Microphone voice clips | A child’s voice recording is personal information under COPPA. A narrow temporary voice-command exception is not a persistent creative audio library. | Off until school-approved workflow; push-to-record, preview/delete and limits; never silently record. | [COPPA](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) · official docs (FTC guidance) · checked 2026-09-30; page warns to consult amended rule · **high** |
| Sound effects without voice | Do not equate a generated beep with an identifiable voice; a student-linked saved file can still fall under school records/data rules. | Provide built-in effects as the easy path; review imported media. | Application of [FERPA](https://studentprivacy.ed.gov/ferpa) · official docs (US Department of Education) · 34 CFR Part 99; current page checked 2026-09-30 · **medium**<br>[SOPIPA](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584.) · official statute · Cal. BPC §22584; AB 801 amendment effective 2025-01-01 · **medium** |
| Thumbnails / exports / recordings of play | Can expose the same names, art, voices and identifiers as the underlying project. | Apply publication permissions to derivative exports too; no public storage bucket as a shortcut. | Threat-model inference from [FERPA](https://studentprivacy.ed.gov/ferpa) · official docs (US Department of Education) · 34 CFR Part 99; current page checked 2026-09-30 · **medium**<br>[SOPIPA](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584.) · official statute · Cal. BPC §22584; AB 801 amendment effective 2025-01-01 · **medium** |


## What other platforms actually document

| Platform | Verified moderation practice | Not verified / do not assume | Evidence |
| --- | --- | --- | --- |
| Scratch | Team reviews reported comments/projects daily; violations can be removed with warnings or account/network blocks. Foundation describes an expert moderation team. | Exact automated models, audio-review coverage, false-positive rates, or school-private equivalent were not verified. | [SCRMOD](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000156897-what-does-the-scratch-team-do-when-something-is-reported-or-flagged-) · official docs · updated 2024-07-11; checked 2026-09-30 · **high**<br>[SCRHOME](https://scratchfoundation.org/home) · official docs · current page checked 2026-09-30 · **high** |
| MakeCode | Shared projects undergo Microsoft security/safety scanning; Report Abuse supports removal for unsafe content or personal information. Anonymous share links lack ordinary unpublish controls. | No completeness guarantee for drawing/audio moderation. A secret link is not a classroom access-control system. | [MCSHARE](https://arcade.makecode.com/share) · official docs · rolling docs checked 2026-09-30 · **high** |
| Roblox | Common chat is automatically filtered; developers must filter other uncontrolled displayed text. Server TextService filtering covers submitted/stored/external text before display. | No separate Roblox Education exemption from these requirements was verified. | [ROBFILTER](https://create.roblox.com/docs/ui/text-filtering) · official docs · rolling Creator Hub docs checked 2026-09-30 · **high** |
| MakeCode multiplayer | Its documented limited communication is useful precedent for constrained sessions. | Do not infer peer-to-peer security or school approval merely from room codes. | [§2 MakeCode](02-object-instance-models.md) · official docs synthesis · 2026-09-30 · **medium** |


## Text filters versus picked phrases — proposed architecture

| Layer | Implementation proposal | Failure case to test |
| --- | --- | --- |
| Picked phrases | Send an allowlisted phrase ID, not arbitrary text, for multiplayer messages such as “Try again” or “Over here”. Server validates ID and rate. | Forged IDs, unsafe combination with player names, spam, harassment by repeated use. |
| Free text | Normalize a moderation copy; detect prohibited content/contact details; retain original only within retention policy; never replace authorization with filtering. | Homoglyphs, inserted punctuation, multiple languages, URLs split across fields and false positives in ordinary names. |
| Computed text | Filter the final public string, not only literal code inputs. | A program joins two individually acceptable strings into an unacceptable sign. |
| Drawings and voice | Use teacher review and permission tiers; text filtering alone cannot establish safety of arbitrary pixels or audio. | Offensive image, spoken contact details, background conversation, imported media. |
| Review states | Draft → class-visible → teacher-approved broader share; immutable reviewed version; edits invalidate approval where appropriate. | Approved thumbnail swapped for new unreviewed project; cached prior media persists after revoke. |
| Enforcement | Teacher remove/mute/freeze controls, report queue, appeal/correction path, audit log. | Untrusted client bypasses hidden buttons or restores removed content via an old version. |


These are threat-model proposals, not measured filter guarantees. Product precedents: [ROBFILTER](https://create.roblox.com/docs/ui/text-filtering) · official docs · rolling Creator Hub docs checked 2026-09-30 · **high**<br>[SCRMOD](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000156897-what-does-the-scratch-team-do-when-something-is-reported-or-flagged-) · official docs · updated 2024-07-11; checked 2026-09-30 · **high**.

## School procurement / vendor packet

| Deliverable | Recommended content (proposal) | Evidence / boundary |
| --- | --- | --- |
| Agreement route | Ask each school/district for its approved DPA and state addendum before collecting student data. | SDPC NDPA establishes common expectations and accommodates state requirements. [SDPC](https://privacy.a4l.org/national-dpa/) · official docs · NDPA v2.2 STANDARD listed; checked 2026-09-30 · **high** |
| NDPA access | Current landing page lists v2.2 STANDARD; requests a fillable copy through A4L membership and restricts substantive alterations. | Do not treat the reference PDF as unrestricted boilerplate. [SDPC](https://privacy.a4l.org/national-dpa/) · official docs · NDPA v2.2 STANDARD listed; checked 2026-09-30 · **high** |
| Data map | Every field, media type, purpose, storage location, subprocessor and retention period; include logs/backups. | Proposed evidence packet supporting [COPPARULE](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule) · official government rule publication · 90 FR 16918; published 2025-04-22; effective 2025-06-23; general compliance 2026-04-22 · **high**<br>[FERPA](https://studentprivacy.ed.gov/ferpa) · official docs (US Department of Education) · 34 CFR Part 99; current page checked 2026-09-30 · **high** |
| Operational controls | Tenant isolation, school-controlled roster, staff access, export/deletion procedure, incident response, security contact and change notices. | Proposed controls to substantiate school control and security; exact contract wording varies. [FERPA](https://studentprivacy.ed.gov/ferpa) · official docs (US Department of Education) · 34 CFR Part 99; current page checked 2026-09-30 · **high**<br>[SOPIPA](https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=22584.) · official statute · Cal. BPC §22584; AB 801 amendment effective 2025-01-01 · **high** |
| Content permissions | Explain class-only versus public publishing, recording controls, moderation staffing and removal times. | Proposed documentation; do not inherit another platform’s consent or moderation claims. [COPPA](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions) · official docs (FTC guidance) · checked 2026-09-30; page warns to consult amended rule · **high**<br>[SCRMOD](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000156897-what-does-the-scratch-team-do-when-something-is-reported-or-flagged-) · official docs · updated 2024-07-11; checked 2026-09-30 · **high** |


## Unresolved

| Gap | How to resolve |
| --- | --- |
| Which laws and contract terms apply to these schools | School counsel reviews public/private status, funding, state law, district DPA and actual data flows; do not infer coverage solely from grade level. |
| All-state requirements | Commission a state-by-state matrix for launch jurisdictions, including security, breach notice, retention and contract requirements. |
| Sufficient consent for public projects/voices | Separate school service authorization from wider publication; obtain qualified review and any required parental consent before enabling it. |
| Actual moderation effectiveness | Evaluate a school-approved multilingual test corpus across text, drawings and sound; measure false positives, misses and review turnaround without using children as adversarial testers. |
| Deletion end-to-end | Delete a synthetic student and verify database, blobs, thumbnails, derivatives, logs, caches and backup-retention policy. |
| New rule changes after snapshot | Recheck FTC rule page, state statutes and school agreements before onboarding or changing data uses. |

