# HANDOFF: Wilson's table (personal site)

Read in this order: this file, `SPEC.md` (the build contract), `docs/BRIEF-wilson-verbatim.md` (Wilson's own words; blurbs and quotes must stay verbatim), `docs/OBJECT-GUIDE.md`, `docs/QA.md`. `docs/VISION-v1-light-table.md` is an earlier, superseded concept kept for history only.

## State as of 2026-10-20 05:00 (all eight objects merged)

- **main** has every object merged (last merge `0253285`): books, Kahneman panel, ID card + FPGA + die-cast + capo, hologram, puppet, turntable + Spotify + Austen bubble, jar + principles, environment. `npm run build` and `tsc` are clean. Branches `worktree-agent-*` are kept on GitHub for history only; nothing on them is unmerged.
- **In progress:** integration QA on main (full scripted visit, layout retune for the real objects, draw-call budget, the items each builder left unverified), then the four critics (taste, glitch, a11y/perf, content) with fix rounds. Desktop only per SPEC 0.1.
- **Not done:** Turnstile widget on the jar slip (keep `TURNSTILE_SECRET` unset until it exists, or every submit is rejected); deployment to Cloudflare (owner runs `wrangler login`); a real-GPU check of frame times (`__table.info().lastMove.max` in Chrome) and of the jar's glass transmission; the hls.js path in real Chrome/Firefox for the hologram.

## Things Wilson must read or decide (collected from the builders)

Bracketed text in `src/content/*` is copy he must write or approve. Specifically:
- `src/content/hologram.ts`: Realm's description has three bracketed phrases; the title "An AI film studio" and the list kicker are the builder's words. Decide: hologram freezes while "watch with sound" plays (current) or keeps running muted.
- `src/content/die-cast.ts`: only one fact is his (negotiating with Chinese hardware vendors for data); four bracketed phrases to fill or cut; the company stays unnamed.
- `src/content/fpga.ts`: one bracketed line on what the Architect work was like.
- `src/content/guitar.ts`: two bracketed slots (what he is learning; the capo line).
- `src/content/id-card.ts`: nothing bracketed; confirm "First in my family to do any of it." for first-generation.
- `src/content/principles.ts`: nine lines in his voice; lines 8 and 9 tie the section to the jar and are the builder's additions. The field placeholders and the button label "put it in the jar".
- `src/panels/pinocchio.ts`: the three "why it matters to me" sentences, the title "The object comes first" and the three section titles are written in his voice, not bracketed.
- `src/panels/kahneman.ts`: UI copy ("press and hold the picture", "now let go", column kickers, "1869 to 1948"); policy that returning visitors see the reveal and are not re-asked; the decision to paint A and B in one grey over the SVG (the asset renders B lighter than A).
- `src/panels/vinyl.ts`: the panel heading and record label use the playlist's real name "lol"; one bracketed line about the playlist; "read Persuasion" links to Gutenberg #105.
- Books: the cover uses traditional 天龍八部 (Hong Kong editions) while the label keeps 天龙八部; author credit forms; which titles are paperback vs hardcover; subtitles on three covers; the Anna Karenina quote as supplied.
- Environment: no desk mat by default (exists behind `?mat=1`); black-enamel architect's lamp.
- Decoration that is invented, not claims: ID back fine print, FPGA markings, the sample tag's lot number.

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
