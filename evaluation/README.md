# Optional newcomer observation

Status: **waived as an acceptance criterion by maintainer direction on 2026-09-29**. This record can still be used for future product learning; no human participant result is claimed.

If a first-time Vietnamese-speaking café or takeaway owner in Đà Nẵng tries the demo, use this record without coaching them through the flow. Record what they do and say in their own words.

## Registered household-café run

Copy the run details from the result and expanded source panel before the observation:

- Model ID shown beside the snapshot date:
- Snapshot review date:
- Owner facts shown back for review:
- Selected passage IDs:
- Conditional route shown:
- Preparation step the participant identifies:
- Source link the participant opens:
- Unresolved point the participant names:
- Official next action shown:

### Production and model review

These are automated checks only. They are not an uncoached owner observation.

- Run date and snapshot review date: 2026-09-29
- Owner facts: café; confirmed household-business registration; prepares food and drinks at a fixed shop; Đà Nẵng
- Selected passage IDs: `dn-faq-24680-household-certificate-authority`, `dn-procedure-1-013855-h17`, `vn-decree-15-2018-articles-11-12`, `vn-law-55-2010-article-29-separate-utensils`, `vn-law-55-2010-article-29-safe-utensils`
- Configured production model: `google/gemma-4-31b-it:free`
- Production checklist request: HTTP 502 because the upstream provider returned HTTP 429. Retrieved passages remained available in the response. No generated checklist was shown.
- Alternate model review: `google/gemma-4-26b-a4b-it:free` also returned HTTP 429. `nvidia/nemotron-3-super-120b-a12b:free` returned a claim asking the owner to confirm the already-confirmed registration, so that response failed content review. `dots-studio/dots-3-note-preview:free` returned mixed Chinese and Vietnamese text and repeated the registration contradiction, so it also failed content review. No alternate model was configured for production.
- Production cited-answer request: HTTP 200 through the Vercel `/api/checklist` route using `local:question-boundary-v1`. The response included a citation-backed conditional commune route, three cited preparation tasks, and a source-linked answer marking current dossier, fee, and processing time as “chưa xác minh”.
- Model-generated checklist acceptance: still unverified in production because the configured upstream returned 429 and the reviewed alternatives failed content review.
- Human observation: not performed; waived as an acceptance criterion. No participant-usefulness claim is made.

## Issue 15 scenario review

Two saved automated scenarios cover unknown registration with a claimed small-scale exception and a takeaway exemption claim. Inputs, normalized outputs, passage IDs, model identity, review dates, and reviewer notes are in [`issue-15-scenario-review.json`](issue-15-scenario-review.json).

These records use the local `test-model` provider fixture and the app's citation validation and deterministic fact guidance; they are not live model runs. Both scenarios passed the automated citation and content assertions in `test/app.test.mjs`. The live provider key is not configured in this workspace, so a live model replay remains pending. The recorded reviewer notes check that each legal and procedure claim is cited and qualified by the official passage limits.

## Session record

- Date and evaluator:
- Participant context (no identifying details):
- Registration type they selected:
- Did they complete all three steps without help?
- Could they explain why the commune-level authority is a conditional route for their registration?
- Could they find the source passage and its review date?
- Did they understand that ticks record reading/preparation only?
- Could they identify the dossier, fee, and deadline as items still needing official confirmation?
- Where did they hesitate, backtrack, or misread a label?
- Participant's usefulness rating and reason:
- Changes required before owner trial:

Do not mark this evaluation complete based on automated tests or an agent walkthrough. The issue's newcomer check needs an actual first-time owner.
