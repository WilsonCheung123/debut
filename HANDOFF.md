# HANDOFF: Wilson's table (personal site)

Read in this order: this file, `SPEC.md` (the build contract), `docs/BRIEF-wilson-verbatim.md` (Wilson's own words; blurbs and quotes must stay verbatim), `docs/OBJECT-GUIDE.md`, `docs/QA.md`. `docs/VISION-v1-light-table.md` is an earlier, superseded concept kept for history only.

## State as of 2026-10-20 (morning)

- **main** = engine complete (scene, camera rig, hover/focus choreography, paper panels, bubble, keyboard list, worker with local D1, Playwright shot tool). Every object on the table is still a placeholder box. Last commit: `9debb7e`.
- **Eight builder branches** exist as git worktrees under `.claude/worktrees/agent-*` (branches `worktree-agent-*`). They were started 2026-10-19 20:17 and all eight were killed by an API rate limit about 25 minutes in, with work saved on their branches. Map branch to job by reading each branch's diff; the jobs (SPEC section numbers) are: books 4.1, Kahneman flow 4.2, ID+FPGA+die-cast+capo 4.3–4.6, hologram 4.7, puppet 4.8, turntable+Austen 4.9, jar+principles 4.10, environment 4.11. Only the jar and environment branches had committed before the kill; the rest have uncommitted edits in their worktrees (`git -C <worktree> status`).
- **Not started:** integration (merge the eight branches into main, retune `src/layout.ts`), the desktop QA loop (taste, glitch, a11y, content critics), Lighthouse.

## How to run

```
npm install
npm run worker:init   # once, creates the local D1 tables
npm run worker        # Cloudflare worker on :8780 (local D1)
npm run dev           # Vite on :5180, proxies /api to the worker
npm run shots -- http://localhost:5180/ shots/x --viewport desktop --focus id-card
npm run qa            # scripted full visit; fails on console errors
```

## Next steps for whoever picks this up

1. For each builder worktree: finish or salvage its object per SPEC §4, commit on its branch.
2. Merge the branches into main one at a time (`git merge --no-ff`), resolve `src/layout.ts`, `src/objects/index.ts` and panel registration, delete placeholder code paths, retune the layout so real objects don't overlap.
3. Run the desktop QA loop per `docs/QA.md`; fix until zero console errors and no visual pops.
4. Deploy: Cloudflare Workers Static Assets + the worker (Wilson runs `wrangler login`); set `TURNSTILE_SECRET`, `OWNER_EMAIL`, optional `RESEND_API_KEY` as secrets. The owner's email must never appear in client code.

## Open questions for Wilson

Anything in `[brackets]` inside `src/content/*` is copy he must confirm (Realm description, die-cast story details, what he's learning on guitar).
