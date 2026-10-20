# HANDOFF: Wilson's table (personal site)

Read in this order: this file, `SPEC.md` (the build contract), `docs/BRIEF-wilson-verbatim.md` (Wilson's own words; blurbs and quotes must stay verbatim), `docs/OBJECT-GUIDE.md`, `docs/QA.md`. `docs/VISION-v1-light-table.md` is an earlier, superseded concept kept for history only.

## State as of 2026-10-20 (round-2 integration on main, cut short for the owner's look)

Six round-2 branches are merged (graphics, books, puppet, hologram, texts, music) and the
assembled table boots clean: `npm run build` and `tsc` pass, the rest frames at 1440 × 900 and
1920 × 1080 (`shots/int/rest-1440.png`, `rest-1920.png`) read as one set under one lamp; the
only light outside the engine is the hologram's cyan point light (intended). Dead code removed:
the message bubble (the Austen letter replaced it), `focus.deferPanel` (the ID no longer flips).

**Scripted QA, this pass (SwiftShader, desktop):**
- Green: `visit-a`, `visit-b`, `visit-books` (nine panels through the shelf, zero problems),
  `reduced` (from the merge-time runs, re-confirmed on the merged main for books).
- Verified in part, then the run was cut: `hologram` with `?holo=hls`: prepared at idle, five films,
  goes live (1470 × 630, frames advance 2.0 s in 2 s), film switch, second click enters cinema
  (overlay fallback headless, unmuted, controls), Escape returns to the hologram. The cinema
  frames-advance assert and the later steps failed on a machine at load average 30–38 (hls
  `bufferStalledError`, 60 s screenshot timeouts): environmental, re-run on a quiet machine.
- Unverified on the merged main: `shelf` (its first run was broken by my own source edits
  reloading the dev page; the scenario is rewritten to poll on shelf state and the re-run was
  killed at the deadline), `puppet` (scenario fixed: frame waits), `id-flip`, `four-clock`,
  `vinyl` (rewritten for the letter), `timing`, `texts` (new), the real-GPU `gfx-audit`,
  `vinyl-live` headed.

**Process lesson, encoded:** a source edit makes Vite reload every open page, which kills a
scenario in progress. `npm run qa` now runs against the static preview on 5181 when it is up
(`npm run build && npm run preview`), with page waits stretched 3× (`SHOT_TIMEOUT_SCALE`), and
`{"action":"wait","frames":n}` replaces fixed-millisecond waits where work resolves in an
object's `update()` (a SwiftShader frame is ~1 s). Never run more than one SwiftShader browser
while measuring anything.

**Open items for the next pass** (all with a plan, none started):
1. Shelf by eye: the end books show more perspective than press.stripe.com's long lens; the
   fov is at the engine's clamp (rest − 4° = 30). Prepared change: a `longLens` flag on
   `FocusFrame` that skips the clamp, shelf frame fov ~22 (the fit raises `dist` itself).
2. Puppet focus: confirm the lamp-shade rim sliver top-left on `shots/qa/puppet-puppet-focus.png`
   and fix with a small `targetOffset` or fov change in `layout.ts`.
3. The jar's lid (metalness 1, its own env map at 0.75) is the brightest thing on the table
   after the lamp in both rest shots; judge on the real GPU before touching it.
4. `node tools/gfx-audit.mjs http://localhost:5180/ shots/audit` on a quiet machine; tune the
   30 ms ladder threshold from the real frame times; docs/QA.md numbers table.
5. `vinyl-live` in one headed window; the Austen letter with the real player.
6. Draw calls at rest and in the heaviest focus (hologram, jar, shelf) against the ≤ 160 assert.

## Lines written in Wilson's voice for him to approve

SPEC 0.1: nothing in `[brackets]` ships, so the six round-2 builders wrote the lines
below as educated guesses. Each is one edit away; none is a fact he supplied.

| where | the guess |
|---|---|
| `src/panels/vinyl.ts` | the line under the player: "Mostly film scores. The kind of music that makes a long night of work feel like a montage." |
| `src/content/hologram.ts` | the title "An AI film studio" and the list kicker "five films, projected without sound" (the description is his, round 3) |
| `src/content/austen.ts` | the letter's heading (the theme note: Darcy's letter, Wentworth's letter), the salutation "Dear reader," and the sign-off "Yours, / Wilson"; the body is verbatim |
| `src/panels/shelf.ts` | the shelf hint "scroll along the shelf · click a book · esc to return" (touch: "tap a book"); the row's hover label "nine books · click to see them all" (`src/objects/books.ts`) |
| `src/content/papers.ts` | the stack of paper's panel: kicker "the papers", title "Blog", body "More to come." (his words, round 3) |
| `src/panels/pinocchio.ts` | the camera's and phone's item titles ("A photograph, a minute later", "The computer that fit a life") and the three small kickers; the hint "Click the puppet, the phone or the camera." and the back link "back to the three" (the panel title, the puppet's title and all three descriptions are his, round 3) |
| `src/content/id-card.ts` | the title "Wilson Cheung" and kicker "student id" (the body is verbatim) |
| `src/content/fpga.ts` | the title "The first intern", kicker "Architect"; the link card's title/description are the post's own Open Graph tags |
| `src/content/die-cast.ts` | the title "A sample part", kicker "a startup I can't name yet" |
| `src/content/guitar.ts` | the heading "learning guitar" (the line under it is his, round 3) |
| `src/content/principles.ts` | the jar note (names Keigo Higashino's The Miracles of the Namiya General Store, English throughout); the "notes on focus" paragraphs are his, round 3 |
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
