# RailDisha

RailDisha is an Indian train journey tracker with live search, ratings, and a published blog. The public website domain is https://raildisha.com.

## Live data

The app uses RailRadar through Vercel serverless functions. Keep `RAILRADAR_API_KEY` in Vercel Environment Variables; never put the key in frontend code.

- `/api/search?q=Himalayan%20Queen` searches the RailRadar train directory.
- `/api/train/14095` retrieves live status for a train number.

If live data is unavailable, the app reports the error instead of showing fake live status.

## Brand assets

- `public/raildisha-logo.png` — header logo (transparent background derived from the official artwork)
- `public/raildisha-logo-source.png` — original supplied logo artwork

The logo artwork already includes the Hindi tagline, so the header does not render duplicate tagline text.

## Local development mocks

Development-only mock mode uses the existing `GATIPATH_MOCK` / `VITE_GATIPATH_MOCK` environment variable names. Those identifiers are intentionally left unchanged so local and hosted mock wiring keeps working.

## Blog

Published guides live under `/blog` with prerendered HTML for crawlable titles, descriptions and canonical URLs on `https://raildisha.com`. Source content is in `src/blog-articles.json`. `npm run build` runs `scripts/prerender-blog.mjs` to emit static blog pages plus `sitemap.xml` / `robots.txt`.

Homepage quick actions: **Train Status** focuses the existing search (no provider call); **PNR Status** opens the official Indian Railways PNR enquiry in a new tab.

## Hosting

Production is published through the existing Vercel GitHub integration. The public site is https://raildisha.com.

## Ratings & reviews (Vercel Blob)

Public ratings use a **Vercel Blob** adapter (`@vercel/blob`) for bounded, moderated JSON records. Process memory and the local filesystem are **not** durable production storage. Until a Blob store is connected, `GET /api/reviews` reports `storageConfigured: false` / `submissionEnabled: false`, and the homepage form keeps Submit disabled.

### Why Blob

Review payloads are small (name ≤ 60 chars, comment ≤ 500, rating 1–5). Pending → published moderation fits private JSON objects under pathname prefixes. No SQL/KV schema is required for this bounded use case.

### Env settings (after you approve connecting storage)

Connect a **Private** Blob store to the Vercel project in the dashboard (Storage → Blob). Official SDK auth order ([Vercel Blob JS SDK](https://vercel.com/docs/vercel-blob/using-blob-sdk)):

| Variable | Role |
| --- | --- |
| `BLOB_STORE_ID` | Added when the store is connected. Paired with runtime OIDC on Vercel. |
| `VERCEL_OIDC_TOKEN` | Injected/rotated by Vercel at runtime (not a long-lived secret you paste). Prefer this over a static token on Vercel. |
| `BLOB_READ_WRITE_TOKEN` | Optional long-lived token. Dashboard adds it only if you check **Add a read-write token env var to this connection**. Needed outside Vercel / some CI. |
| `REVIEWS_MODERATION_TOKEN` | App secret you set after Blob is connected. Required for `POST /api/reviews/moderate`. |

Also install/deploy with dependency `@vercel/blob` (already declared in `package.json`).

### Object layout & moderation workflow

1. Visitor submits via `POST /api/reviews` → private object `raildisha/reviews/pending/<id>.json` with `status: "pending"`.
2. Public `GET /api/reviews` lists only `raildisha/reviews/published/`.
3. Moderator calls `POST /api/reviews/moderate` with header `Authorization: Bearer $REVIEWS_MODERATION_TOKEN` and body `{ "id": "<id>", "action": "publish" | "reject" }`.
4. `publish` copies to `raildisha/reviews/published/<id>.json` and deletes the pending object; `reject` deletes pending only.
5. Rate limit: ≤ 5 submissions / hour / client key; duplicate body+client blocked for 24h. Markers under `raildisha/reviews/rate/`.

### Offline / test-only memory

`GATIPATH_REVIEWS_MEMORY=1` enables an in-process map **only** when not on production/preview. Offline Vitest uses it. Never treat it as durable hosting storage.

### Ready-to-connect status

This feature ships UI + API + fail-closed behavior without creating Blob stores or tokens in-agent. Smallest remaining action: **approve connecting a Private Vercel Blob store** to the project (OIDC), then set `REVIEWS_MODERATION_TOKEN`, redeploy, and merge only after submissions persist.
