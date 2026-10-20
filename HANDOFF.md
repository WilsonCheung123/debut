# HANDOFF: Wilson's table (personal site)

Read in this order: this file, `SPEC.md` (the build contract), `docs/BRIEF-wilson-verbatim.md` (Wilson's own words; blurbs and quotes must stay verbatim), `docs/OBJECT-GUIDE.md`, `docs/QA.md`. `docs/VISION-v1-light-table.md` is an earlier, superseded concept kept for history only.

## State as of 2026-10-20 (integration pass on main)

- **main** has every object merged and the assembled table integrated (`1b7a14f`, `b3a77f3`, then this commit): table shrunk to 1.3 × 0.8 m, the objects re-spread so the front half is used (ID front-left, capo and pick front-centre, FPGA and die-cast together left-centre, puppet right of centre in the gap between turntable and lamp, jar front-right), the lamp aimed at the centre-front and scaled 0.9, and the rest camera fitted to the objects' own bounds (centred and iterated) rather than the table's edges. Smallest object (FPGA) is 105 px wide at 1440; ID 127; capo 144. `npm run build` and `tsc` are clean.
- **Draw calls:** 276 → 145 at rest (85 main pass + 60 shadow casters): lamp enamel/steel baked into two meshes, vinyl statics and tonearm parts baked, table legs merged, and the jar's transmission now only while the jar is focused (cheap fresnel glass at rest; both shaders compiled at boot). The scripted assert is 160 with the reasoning in docs/QA.md.
- **Panel routing** on the real books is by direct import (`kahnemanPanel`, `austenPanel`) in `src/objects/books.ts`; the glob lookup and the two placeholder files are gone.
- **QA (desktop only, `tools/qa.mjs`):** `visit-a`, `visit-b` and `reduced` PASS with zero console errors/warnings of ours; the Austen trick, the ID flip + deferred panel, the Kahneman panel and keyboard path are all verified on the assembled table. `timing` failed on a scenario bug (it clicked the FPGA and asserted the ID; fixed in the file, not yet re-run). `hologram` was running (video played natively in headless Chromium: mode "native", readyState 4) when the pass was cut; `puppet`, `jar`, `id-flip`, `deep-link`, `vinyl`, `vinyl-offline`, `vinyl-silent`, `kahneman`, `four-objects`, `visit-books` not yet run on the integrated layout (their flows passed in isolation on the builders' branches).
- **Known visual issues on the integrated table (not yet fixed, see docs/QA.md and the integrator's report):** capo focus angle hides the coil spring (try az −70, el 32); puppet focus shows the lamp's shade mouth at the top (raise el 12 → 24, az 20); the die-cast reads as matte grey plastic, bluish under the window fill (raise metalness ~0.5, warm the base colour); the flat-book focus frame is too tight now that the FPGA/die-cast sit in front of the stack (flatBook dist 0.6 → 0.7, el 46); the puppet at rest reads grey because his camera-facing side gets only the cool fill (turn him toward the lamp, rotationY −16 → ~8). The hls.js path (`?holo=hls`) and Lighthouse are unverified.

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
npm run qa            # every desktop run (about 40 min on software GL); npm run qa visit-a jar runs two
```

## Next steps for whoever picks this up

1. For each builder worktree: finish or salvage its object per SPEC §4, commit on its branch.
2. Merge the branches into main one at a time (`git merge --no-ff`), resolve `src/layout.ts`, `src/objects/index.ts` and panel registration, delete placeholder code paths, retune the layout so real objects don't overlap.
3. Run the desktop QA loop per `docs/QA.md`; fix until zero console errors and no visual pops.
4. Deploy: Cloudflare Workers Static Assets + the worker (Wilson runs `wrangler login`); set `TURNSTILE_SECRET`, `OWNER_EMAIL`, optional `RESEND_API_KEY` as secrets. The owner's email must never appear in client code.

## Open questions for Wilson

Anything in `[brackets]` inside `src/content/*` is copy he must confirm (Realm description, die-cast story details, what he's learning on guitar).
