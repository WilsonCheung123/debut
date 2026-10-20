# HANDOFF: Wilson's table (personal site)

Read in this order: this file, `SPEC.md` (the build contract), `docs/BRIEF-wilson-verbatim.md` (Wilson's own words; blurbs and quotes must stay verbatim), `docs/OBJECT-GUIDE.md`, `docs/QA.md`. `docs/VISION-v1-light-table.md` is an earlier, superseded concept kept for history only.

## State as of 2026-10-20 (integration pass on main)

- **main** has every object merged and the assembled table integrated (`1b7a14f`, `b3a77f3`, then this commit): table shrunk to 1.3 × 0.8 m, the objects re-spread so the front half is used (ID front-left, capo and pick front-centre, FPGA and die-cast together left-centre, puppet right of centre in the gap between turntable and lamp, jar front-right), the lamp aimed at the centre-front and scaled 0.9, and the rest camera fitted to the objects' own bounds (centred and iterated) rather than the table's edges. Smallest object (FPGA) is 105 px wide at 1440; ID 127; capo 144. `npm run build` and `tsc` are clean.
- **Draw calls:** 276 → 145 at rest (85 main pass + 60 shadow casters): lamp enamel/steel baked into two meshes, vinyl statics and tonearm parts baked, table legs merged, and the jar's transmission now only while the jar is focused (cheap fresnel glass at rest; both shaders compiled at boot). The scripted assert is 160 with the reasoning in docs/QA.md.
- **Panel routing** on the real books is by direct import (`kahnemanPanel`, `austenPanel`) in `src/objects/books.ts`; the glob lookup and the two placeholder files are gone.
- **QA (desktop only, `tools/qa.mjs`):** `visit-a`, `visit-b` and `reduced` PASS with zero console errors/warnings of ours; the Austen trick, the ID flip + deferred panel, the Kahneman panel and keyboard path are all verified on the assembled table. `timing` failed on a scenario bug (it clicked the FPGA and asserted the ID; fixed in the file, not yet re-run). `hologram` was running (video played natively in headless Chromium: mode "native", readyState 4) when the pass was cut; `puppet`, `jar`, `id-flip`, `deep-link`, `vinyl`, `vinyl-offline`, `vinyl-silent`, `kahneman`, `four-objects`, `visit-books` not yet run on the integrated layout (their flows passed in isolation on the builders' branches).
- **Known visual issues on the integrated table (not yet fixed, see docs/QA.md and the integrator's report):** capo focus angle hides the coil spring (try az −70, el 32); puppet focus shows the lamp's shade mouth at the top (raise el 12 → 24, az 20); the die-cast reads as matte grey plastic, bluish under the window fill (raise metalness ~0.5, warm the base colour); the flat-book focus frame is too tight now that the FPGA/die-cast sit in front of the stack (flatBook dist 0.6 → 0.7, el 46); the puppet at rest reads grey because his camera-facing side gets only the cool fill (turn him toward the lamp, rotationY −16 → ~8). The hls.js path (`?holo=hls`) and Lighthouse are unverified.

## Lines written in Wilson's voice for him to approve

SPEC 0.1: nothing in `[brackets]` ships, so the six round-2 builders wrote the lines
below as educated guesses. Each is one edit away; none is a fact he supplied.

| where | the guess |
|---|---|
| `src/panels/vinyl.ts` | the line under the player: "Mostly film scores. The kind of music that makes a long night of work feel like a montage." |
| `src/content/hologram.ts` | Realm's two sentences ("Realm is my AI film studio: a small team making short films and campaigns with diffusion models, held to the standard of film rather than of demos." / "Every shot is directed, graded and cut; the models are the camera, not the director."), the title "An AI film studio" and the list kicker "five films, projected without sound" |
| `src/content/austen.ts` | the letter's heading (the theme note: Darcy's letter, Wentworth's letter), the salutation "Dear reader," and the sign-off "Yours, / Wilson"; the body is verbatim |
| `src/panels/shelf.ts` | the shelf hint "scroll along the shelf · click a book · esc to return" (touch: "tap a book") |
| `src/panels/pinocchio.ts` | the panel title "Three objects"; the three item titles and descriptions ("The thing you could hold", "A photograph, a minute later", "The computer that fit a life") and the three "Why it matters to me" lines; the hint "Click the puppet, the phone or the camera." and the back link "back to the three" |
| `src/content/id-card.ts` | the title "Wilson Cheung" and kicker "student id" (the body is verbatim) |
| `src/content/fpga.ts` | the title "The first intern", kicker "Architect"; the link card's title/description are the post's own Open Graph tags |
| `src/content/die-cast.ts` | the title "A sample part", kicker "a startup I can't name yet" |
| `src/content/guitar.ts` | the capo panel's single line "learning guitar." |
| `src/content/principles.ts` | the jar note (names Keigo Higashino's The Miracles of the Namiya General Store, English throughout) and the nine principles, written fresh in his voice |
| `src/content/music.ts` | the 15 YouTube video ids (official uploads where one exists; The Flower Garden is a fan upload, see the comment) and the record's name "lol"; he can set `YOUTUBE_PLAYLIST` to his own playlist id instead |
| `src/engine/quality.ts` | the DPR floor of 1.5 on a real GPU (SPEC 0.2 says "never below 1.5"; the ladder gives up dust, transmission and shadow resolution first) |

Decoration that is invented, not claims: the ID back's fine print, the FPGA's silkscreen
markings, the sample tag's lot number, the bookends.

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
