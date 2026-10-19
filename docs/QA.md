# QA

A build is done only when all of this passes on the test matrix: Chrome
desktop 1440 × 900, Safari when available, emulated iPhone 13 (390 × 844) and
Pixel 7 (412 × 915). `npm run qa` runs the scripted part; the rest is a human
with the dev server open.

## The rubric (SPEC 7)

1. **Zero console errors or warnings** in a full scripted visit: load, hover
   each object, focus each object, exit, flip the ID, open the jar, run the
   anchoring flow against the local worker, switch films, open the Spotify
   panel, trigger the Austen bubble with a stubbed `isPlaying = true`.
   `tests/scenarios/full-visit.json` covers everything the engine owns; object
   builders extend it (or add `tests/scenarios/<id>.json`) for their flows.
2. **Every transition is smooth**: no frame over 50 ms during camera moves on
   desktop (read `__table.info().lastMove.max` in a real Chrome after a focus
   and an exit; software GL in Playwright cannot measure this); no visual pop
   on hover enter/leave or focus enter/exit (watch the frame bursts from the
   `timing` run and the dev server by eye).
3. **Screenshots at each focused state look designed**: panel readable, object
   framed with margin, nothing clipped by the panel (landscape) or the sheet (portrait).
4. **Hover label never overlaps its object; labels never leave the viewport**
   (audited on every `hover` step).
5. **Keyboard**: Tab reaches every object, Enter focuses, Esc exits, focus
   returns to the originating button (asserted in the full visit).
6. **Reduced motion honoured**: no lift, no parallax, camera cuts with a 200 ms
   crossfade, panels fade (`tests/scenarios/reduced-motion.json`, run with `--reduced-motion`).
7. **Lighthouse (desktop)**: performance ≥ 90 on `npm run build && npm run preview`
   served statically, accessibility ≥ 95.
8. **No lorem ipsum, no placeholder copy**; anything Wilson must edit is in `[brackets]`.

Also checked by the tool: every object ≥ 60 px wide at 1440 × 900; on touch a
44 px target whose centre tap resolves to the object; 44 px DOM tap targets
in the UI; the choreography marks under a fake clock (panel at +450 ms,
camera settled at +900 ms, exit panel 240 ms, camera back 800 ms).

## Running

```
npm run dev          # 5180
npm run worker       # 8780 (qa starts it if it is not up)
npm run qa           # desktop + iphone full visit, reduced-motion pass, fake-clock timing pass
npm run qa desktop   # one run
```

Outputs land in `shots/qa/`: PNGs plus `<run>-problems.txt`. QA fails on any
`[console.error]`, `[console.warn]`, `[pageerror]`, `[requestfailed]`,
`[http 4xx/5xx]`, `[assert … FAILED]`, `[audit:…]`, `[timing:…]`, `[hover:…]`,
`[focus:…]`, `[exit]` or `[scenario:…]` line. `[env.warn]` lines are
SwiftShader-only driver messages (absent on real GPUs) and `[note:…]` lines
are informational; both are recorded, neither fails the run.

## Scenario file format

A JSON array of steps, run in order by `tools/shot.mjs`:

| step | meaning |
|---|---|
| `{"action":"wait","ready":true}` | wait until the lamp has warmed up (`__table.ready`) |
| `{"action":"wait","ms":500}` / `{"action":"wait","selector":"#panel:not([hidden])"}` | wait |
| `{"action":"hover","id":"book.inferno"}` | move the mouse onto the object; waits for lift + label; audits overlap/offscreen (no-op on touch) |
| `{"action":"focus","id":"id-card"}` | click/tap the object's centre; waits for `focus:settled` and the panel; `"cluster":true` lets a member hidden behind a sibling on touch be focused via the hook (recorded as a note) |
| `{"action":"exit"}` | Escape; waits for `exit:settled` |
| `{"action":"click","selector":"…"}` / `tap` / `{"action":"fill","selector":"…","text":"…"}` | DOM interaction (Playwright selectors) |
| `{"action":"press","key":"Tab"}` | keyboard |
| `{"action":"shot","name":"rest"}` | screenshot + DOM tap-target audit |
| `{"action":"eval","js":"…"}` / `{"action":"log","name":"…","js":"…"}` | run / print an expression |
| `{"action":"assert","name":"…","js":"expression"}` | falsy or throwing → `[assert:name FAILED]`; promises are awaited |
| `{"action":"audit","name":"sizes","minWidth":60,"clusterPrefixes":["book."]}` | object size / tap-target audit |
| `{"action":"timing","name":"…"}` | checks the last focus's marks against SPEC 3 (meaningful with `--clock`) |
| `{"action":"click-object","id":"…"}` + `{"action":"clock","pause":true}` / `{"action":"clock","runFor":450}` | fake-clock stepping (`--clock`) |
| `{"action":"mock","url":"glob","file":"fixture.json"}` | fulfil matching requests from a fixture |
| `{"action":"http","name":"…","method":"POST","url":"/api/note","body":{…},"expectStatus":400}` | a request made from node, for responses the page should not log (deliberate 4xx) |

Test hooks on the page: `window.__table` — `ids`, `state`, `timeline`,
`rect(id, minPx)`, `anchor(id)`, `pickAt(x, y)`, `hover(id|null)`, `focus(id)`,
`exit()`, `liftOf(id)`, `info()` (draw calls, triangles, dpr, tier, mode, busy,
frame, camera, lastMove). URL flags: `?qa=1` (lock the quality tier, wall-clock
tweens), `?motion=reduce`, `?touch=1`.

## Touch targets in clusters

On a 390 px phone the table is ~225 px per metre. Five standing books 3 cm
apart are 7–20 px wide each; the lower books of a stack sit under the top one.
Exclusive 44 px targets per book are geometrically impossible there, and the
engine's raycast is honest: a tap lands on the book that is physically under
the finger. `npm run qa` records these as `[note:tap]` lines rather than
failures. The books builder is expected to make the cluster work on phones
anyway, for example: tapping any book on portrait focuses the shelf with the
tapped book lifted and the others listed in the panel as tappable rows, or the
stack is fanned so each lying book shows an edge of at least ~44 px. Whatever
the solution, the full visit must reach every book's panel on the iPhone run.

## Known environment facts

- Playwright renders through SwiftShader: frames take ~1 s, so hover/focus
  checks wait on engine marks, and timings are verified under a fake clock
  (`tests/scenarios/timing.json`), not wall-clock.
- `PCFSoftShadowMap` no longer exists in three r186; the engine uses
  `PCFShadowMap` with `shadow.radius = 5`.
