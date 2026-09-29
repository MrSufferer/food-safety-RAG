# Rà soát an toàn thực phẩm cho quán ở Đà Nẵng

A small Vietnamese preparation checklist demo for a café or takeaway in Đà Nẵng. It asks about the registration, actual food activity, and a possible certificate exception, lets the owner review those facts, then returns source-linked preparation steps and a conditional authority route.

## Run it

1. Copy `.env.example` to `.env` and add an OpenRouter key.
2. Run `npm start` with Node.js 22.9 or newer.
3. Open the local URL printed by the server.

The default model is `nvidia/nemotron-3-super-120b-a12b:free`. Set `OPENROUTER_MODEL` in `.env` to choose another OpenRouter model. The key stays in the server environment; it is not sent to the browser. No package installation is required.

## Scope and source behavior

- The supported route is limited to a Đà Nẵng café or takeaway with a household-business registration or an unknown registration type. If registration is unknown, the office route is withheld while independently supported preparation steps remain available. Other registration types are shown as out of scope and are not sent to the model.
- A small-business claim is checked against the reported registration and actual food activity. Shop size alone does not establish a certificate exception, and food-safety conditions still apply to exempt establishments.
- Only the owner's answers and matching source passages are sent to OpenRouter. The bundled source snapshot is dated 2026-09-29.
- Generated claims must reference IDs from the selected passages. Claims without valid citations are removed; an incomplete route or next step withholds the checklist and shows the sources instead.
- A tick means the owner has read or prepared an item. It does not certify compliance or readiness to file.
- The exact current dossier, fee, and deadline remain unverified. The app asks the owner to confirm those with the commune-level authority.

## Local checks

Run `npm run typecheck` to syntax-check the JavaScript files with Node, then `npm test` to exercise scenario filtering, reviewed-facts flow, source selection, citation validation, provider failure handling, and the local page route. The real newcomer observation is still pending; see [`evaluation/README.md`](evaluation/README.md).
