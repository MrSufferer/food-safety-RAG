# Rà soát an toàn thực phẩm cho quán ở Đà Nẵng

A small Vietnamese preparation checklist demo for a café or takeaway in Đà Nẵng. It asks about the registration, actual food activity, and a possible certificate exception, lets the owner review those facts, then returns source-linked preparation steps and a conditional authority route.

## Run it

1. Copy `.env.example` to `.env` and add a Gemini API key. Add an OpenRouter key to enable the final provider fallback.
2. Run `npm start` with Node.js 22.9 or newer.
3. Open the local URL printed by the server.

The app tries Gemini 3.1 Flash-Lite first, then the free-tier Gemini 3.5 Flash-Lite fallback, and then OpenRouter. Google lists Gemini 3.1 Flash-Lite as a cost-efficient model with free-tier access; check current [model availability](https://ai.google.dev/gemini-api/docs/models) and [pricing](https://ai.google.dev/gemini-api/docs/pricing) for the project tied to your key. Set `GEMINI_MODEL` or `GEMINI_FREE_MODEL` to choose different Gemini models. The OpenRouter default is `nvidia/nemotron-3-super-120b-a12b:free`; set `OPENROUTER_MODEL` to change it. If every provider fails, the app shows a clear error and the retrieved passages. Provider keys stay in the server environment and are not sent to the browser. No package installation is required.

For the hosted app, configure `GEMINI_API_KEY` (and optional model overrides) on the Render service that runs `server.mjs`. Vercel only hosts the page and forwards `/api` requests to that Render service, so a key added to Vercel does not reach the model server.

## Scope and source behavior

- The supported route is limited to a Đà Nẵng café or takeaway with a household-business registration or an unknown registration type. If registration is unknown, the office route is withheld while independently supported preparation steps remain available. Other registration types are shown as out of scope and are not sent to the model.
- A small-business claim is checked against the reported registration and actual food activity. Shop size alone does not establish a certificate exception, and food-safety conditions still apply to exempt establishments.
- Only the owner's answers and matching source passages are sent to the selected provider. The bundled source snapshot is dated 2026-09-29.
- Generated claims must reference IDs from the selected passages. Claims without valid citations are removed; an incomplete route or next step withholds the checklist and shows the sources instead.
- Gemini requests use Google's `generateContent` endpoint with JSON output mode. Free-tier quotas can still be rate-limited. If both Gemini models fail, the app tries OpenRouter, which routes to `google/gemma-4-31b-it:free` if the configured model is unavailable or rate-limited. OpenRouter's free fallback is documented [here](https://openrouter.ai/docs/guides/routing/model-fallbacks). If OpenRouter also returns HTTP 429, the app builds a local checklist from the selected passages and labels it as a fallback. Free models still have account-level request limits ([OpenRouter pricing](https://openrouter.ai/pricing/)).
- A tick means the owner has read or prepared an item. It does not certify compliance or readiness to file.
- The exact current dossier, fee, and deadline remain unverified. The app asks the owner to confirm those with the commune-level authority.

## Local checks

Run `npm run typecheck` to syntax-check the JavaScript files with Node, then `npm test` to exercise scenario filtering, reviewed-facts flow, source selection, citation validation, provider failure and rate-limit fallback handling, and the local page route. The uncoached newcomer observation was waived as an acceptance criterion; the recorded model run is automated, not participant evidence. See [`evaluation/README.md`](evaluation/README.md).
