# HANDOFF: Wilson's table (personal site)

Read in this order: this file, `SPEC.md` (the build contract), `docs/BRIEF-wilson-verbatim.md` (Wilson's own words; blurbs and quotes must stay verbatim), `docs/OBJECT-GUIDE.md`, `docs/QA.md`. `docs/VISION-v1-light-table.md` is an earlier, superseded concept kept for history only.

## State as of 2026-10-20 (stopped on Wilson's instruction)

- **main** = engine complete (scene, camera rig, hover/focus choreography, paper panels, bubble, keyboard list, worker with local D1, Playwright shot tool). Objects on main are still placeholder boxes.
- **Eight builder branches**, all pushed to GitHub (`origin`), each with real but unfinished object work. Every branch's last commit is either the builder's own or a `wip: salvage` commit made at stop time, so nothing is lost. Branch -> job (SPEC section):

| Branch | Job | State at stop |
|---|---|---|
| `worktree-agent-a75f3648453584236` | Books 4.1 | content (nine blurbs/quotes) + procedural cover-design module; object not yet wired |
| `worktree-agent-a093b530b35c69f45` | Thinking, Fast and Slow flow 4.2 | checker-shadow press-and-hold proof + anchoring panel drafted; needs end-to-end test against worker |
| `worktree-agent-a1c800077036819b8` | ID card, FPGA, die-cast, capo 4.3-4.6 | all four objects first versions (ID flip + deferred panel); needs screenshots/QA |
| `worktree-agent-aa879965708220422` | Hologram projector + films 4.7 | wip salvage; check `src/objects/hologram.ts`, `src/panels/hologram.ts` |
| `worktree-agent-a83bb075904774d8f` | Puppet + Think Different page 4.8 | marionette geometry, painted head, strings to cross bar; panel copy to verify |
| `worktree-agent-a6f534a90d0a4c31a` | Turntable, Spotify, Austen bubble 4.9 | wip salvage; check `src/objects/vinyl.ts`, `src/panels/vinyl.ts`, `src/panels/austen.ts` |
| `worktree-agent-a08fb61d0872017eb` | Jar + slip + principles 4.10 | glass jar (transmission), slotted lid, slip pile, slip-of-paper panel; principles copy |
| `worktree-agent-a43b9640003202166` | Environment polish 4.11 | articulate lamp, walnut maps, leather mat, light rig WIP; before/after shots under `shots/env/` |

Each branch may have made small additive edits to engine files; diff against main before merging. Worktrees live under `.claude/worktrees/` (ignored by git); they share one `node_modules` via symlink. Another agent can simply `git checkout <branch>` instead of using the worktrees.
- **Not started:** integration (merge the eight branches into main one at a time, retune `src/layout.ts`), the desktop QA loop (taste, glitch, a11y, content critics per `docs/QA.md`), Lighthouse, deployment.

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
