# worker/

The Cloudflare Worker behind `/api` (SPEC 5): `POST /api/note`, `POST /api/anchor`,
`GET /api/anchor/stats`, D1 for storage.

Local: `npm run worker` starts `wrangler dev --local` on port 8780 with a local
D1 (sqlite under `.wrangler/`); the Vite dev server proxies `/api` to it. The
schema is created on first request (idempotent) and also lives in `schema.sql`
(`npm run worker:init` applies it explicitly). Secrets go in `worker/.dev.vars`
(copy `.dev.vars.example`); none are needed locally.

Deploy (the owner's step, later):

1. `npx wrangler login`
2. `npx wrangler d1 create wilsons-table` and paste the `database_id` into `wrangler.toml`
3. `npx wrangler d1 execute wilsons-table --remote --file=worker/schema.sql --config worker/wrangler.toml`
4. `npx wrangler secret put TURNSTILE_SECRET --config worker/wrangler.toml` (and `RESEND_API_KEY`, `OWNER_EMAIL`, `IP_SALT`)
5. `npx wrangler deploy --config worker/wrangler.toml`, then route `/api/*` of the site's domain to it.
