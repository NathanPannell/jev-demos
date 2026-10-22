# Jev Demos

One website, five tabs, each a live demo of TypeSafe's **Jev 1.14** (`typesafe/jev-1.14`), a model that returns typed decisions instead of text. Every decision on the site is a real Jev call made through OpenRouter. The only hard-coded things are sample data: a painting, mockup screenshots and a fictional terms of service.

| Tab           | Hook                                                | Jev question types                                                       |
| ------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| HN Ticker     | Classify a million comments for pocket change.      | `noul` per live Hacker News comment                                      |
| Adventure     | Type anything, in any language. Jev picks the move. | `choice` from the moves allowed in the room                              |
| Find It       | Ask Jev where something is. It draws the box.       | `box` (+ `noul` "is it there at all?")                                   |
| Design Audit  | Hold every screen to your design standard.          | 8 × `noul` (one per rule), then `box` on the broken rule                 |
| TOS Red Flags | Nobody reads the terms. Jev reads every line.       | `noul` + `choice` per clause; `score` and `noul` over the whole document |

Latency and cost of the last call show in the footer, and each demo shows its own.

## How Jev is called

Verified with real calls on 2026-10-21:

- `POST https://openrouter.ai/api/v1/systemone` with `{ model, state, questions }`. (`/chat/completions` does not serve Jev; `/v1/decisions` is 404 on OpenRouter.)
- `state` is a string, an object of strings, or an array. Images go in the array as `{ "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }`. TypeSafe's native `assets` map is silently dropped by OpenRouter.
- Answers: `noul` → `{ noul }`, `choice` → `{ choice, probabilities, confidence }`, `score` → `{ score, legend, probabilities, confidence }`, `box` → `{ box: { top, bottom, left, right }, confidence }`, with fractions measured from the top-left corner.
- `usage.cost` is returned in USD. A short comment costs about $0.000012. An 800×600 screenshot is about 1,300 input tokens.
- Long context: a 76K-token request worked through OpenRouter with or without the `TypeSafe-Danger-Zone-Long-Context: true` header. The proxy sends that header, and `TypeSafe-Danger-Zone-Images: true`, when they apply.

## The HN filter, chosen empirically

On 2026-10-21 I pulled 200 live comments from the Algolia HN API and asked Jev seven candidate `noul` questions about each one ($0.0038 total, p50 197 ms). A comment counts as a hit when `noul > 0.5`:

| Candidate question                                                                  | Hit rate  |
| ----------------------------------------------------------------------------------- | --------- |
| Is this comment about AI, LLMs or machine learning?                                 | 17.5%     |
| Does the commenter share a personal anecdote or first-hand experience?              | 20.5%     |
| Is the commenter correcting someone on a factual point?                             | 22.5%     |
| **Does the comment contain a spicy hot take that many readers would push back on?** | **30.5%** |
| Is the commenter disagreeing with someone?                                          | 36.5%     |
| Is this comment snarky or sarcastic?                                                | 45.0%     |
| Is the commenter complaining about something?                                       | 53.0%     |

The ticker uses **"spicy hot take"**: a 30.5% hit rate keeps the hot lane busy without flooding it, and the top-scored examples were genuinely spicy.

## Other measurements (sample data)

- **Design Audit:** on each of the four planted screenshots, the planted rule got the highest `noul`: contrast 0.97, two primary buttons 0.87, four typefaces 0.66 and placeholder-only labels 0.96. The clean screen stayed below 0.5 on every rule. A rule counts as broken when it is the top pick at ≥ 0.6, or when it scores ≥ 0.85 (`src/lib/audit.ts`).
- **TOS Red Flags:** all 11 deliberately hostile clauses in the sample scored ≥ 0.77 on "unusually unfair". The whole document scored "Predatory" (3.98/4).
- **Find It:** I checked Jev's boxes by eye for 8 proverbs in Bruegel's painting. All 8 covered the right figure, some loosely. The site uses six of them.

## Safety on a public site

`/api/jev` is the only route that spends the OpenRouter key, and the key never leaves the server. It enforces:

- An allowlist of question types (`noul`, `choice`, `score`, `box`), with the model pinned server-side.
- Size caps: body 4 MB, image 3.5 MB (PNG/JPEG data URL), state 120K characters, 16 questions, and caps on instruction and criteria lengths.
- Per-IP rate limits (in memory, per instance): 240/min and 4,000/hour overall, 30/min for images, 20/min for long documents.
- A per-instance spend ceiling of $0.50/hour (`JEV_HOURLY_BUDGET_USD`), with each request's estimated cost reserved before the call.
- A JSON-only content type, so other sites can't spend the key from their visitors' browsers: cross-origin JSON needs a CORS preflight, and only allowlisted origins pass it.
- An exact-match CORS allowlist for the AI Build Night Shopify storefront, which embeds the HN Ticker and Design Audit demos and calls `/api/jev` from the browser (a Shopify theme is public, so the key can't live there). The default is `https://aibuildnight.ca`, `https://www.aibuildnight.ca` and `https://reecharge.myshopify.com`; `JEV_ALLOWED_ORIGINS` (comma-separated) replaces it. Wildcards are ignored, and `*.shopifypreview.com` is deliberately not allowed, because any Shopify store can serve pages from it. Allowed origins get `Access-Control-Allow-Origin` on the preflight and on every POST response, errors included; every other origin gets no CORS headers. The same rate limits and spend cap apply to calls from the storefront.
- A Vercel Firewall rule in front of the function: 300 requests/min per IP on `/api/jev`, then a 5-minute block.

The HN ticker streams only while its tab is open, the page is visible and the user has pressed play, and it auto-pauses after two minutes. The key's own OpenRouter limit is the hard backstop. There is no database.

## Develop

```bash
npm ci
OPENROUTER_API_KEY=... npm run dev     # Vite dev server; also serves /api via scripts/vite-api-plugin.ts
node scripts/render-mockups.ts         # regenerate the audit screenshots
```

## CI gate

`.github/workflows/ci.yml` runs on every PR to `staging` and `main`: lockfile install, Prettier, ESLint with zero warnings, `tsc`, Vitest with a coverage floor (thresholds in `vite.config.ts`), the production build, Playwright e2e (desktop and mobile) against `vite preview` of the built app, which also serves `/api` and makes real Jev calls using the `OPENROUTER_API_KEY` repo secret, `npm audit --audit-level=high`, a no-`.env` check and a gitleaks scan. There is no database, so there is no migration job.

## Deploy

Vercel project `jev-demos`: `main` deploys to production and `staging` to the staging domain. Other branches are skipped (`ignoreCommand` in `vercel.json`). `OPENROUTER_API_KEY` is a server-side environment variable.

## Credits

- Pieter Bruegel the Elder, _Netherlandish Proverbs_ (1559) and _Children's Games_ (1560). Public domain, via Wikimedia Commons.
- Hacker News comments via the [Algolia HN Search API](https://hn.algolia.com/api).
- "Muddlecloud Photo Co." and its terms of service are fictional.
