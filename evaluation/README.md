# Owner observation

Status: **waived for this build by maintainer direction on 2026-09-29**. No participant-usefulness claim is made.

This worksheet is retained for an optional later review. If used, do not coach the participant through the flow; record what they do and say in their own words.

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

### Automated model run

This verifies the configured model and citation path only. It is not the required uncoached owner observation.

- Run date: 2026-09-29
- Model ID: `nvidia/nemotron-3-super-120b-a12b:free`
- Snapshot review date: 2026-09-29
- Owner facts: café; household-business registration; prepares food and drinks; Đà Nẵng
- Selected passage IDs: `dn-faq-24680-household-certificate-authority`, `dn-procedure-1-013855-h17`, `vn-decree-15-2018-articles-11-12`, `vn-law-55-2010-article-29-separate-utensils`, `vn-law-55-2010-article-29-safe-utensils`
- Conditional route: ask UBND cấp xã about the food-safety certificate route for the confirmed household-business registration
- Preparation tasks returned: separate utensils and containers for raw and cooked food; use hygienic cooking tools; use safe, washed, dry eating utensils
- Unresolved points: current dossier, fee, and processing time
- Official next action: confirm the current dossier, fee, and processing time with UBND cấp xã
- Outcome: HTTP 200; claims passed citation validation
- Newcomer observation: waived; no participant-usefulness claim is made

## Issue 15 scenario review

Two saved automated scenarios cover unknown registration with a claimed small-scale exception and a takeaway exemption claim. Inputs, normalized outputs, passage IDs, model identity, review dates, and reviewer notes are in [`issue-15-scenario-review.json`](issue-15-scenario-review.json).

These records use the local `test-model` provider fixture and the app's citation validation and deterministic fact guidance; they are not live model runs. Both scenarios passed the automated citation and content assertions in `test/app.test.mjs`. The live provider key is not configured in this workspace, so a live model replay remains pending. The recorded reviewer notes check that each legal and procedure claim is cited and qualified by the official passage limits.

## Weak-evidence and provider-failure checks

The integration checks in `test/app.test.mjs` cover a response whose route citation is absent or unrelated while cited preparation tasks remain available. The response withholds the route, adds an `evidenceGaps` entry naming the source still needed, and keeps only supported tasks. If all model tasks are unsupported, source-mapped preparation tasks may fill the section; if the selected corpus supports no preparation task, the app returns an error with retrieved passages and no checklist. A provider failure follows the same page flow and shows retrieved passages without any generated checklist.

These checks use a local fake provider and synthetic corpus filtering. They verify application behavior, not a live model run or legal review. A live model replay is unavailable in this workspace because `OPENROUTER_API_KEY` is not configured.

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

Automated tests and model runs are not participant evidence. This build does not claim participant usefulness; the uncoached observation was waived.
