# The light table

*Vision and build plan for Wilson's personal site. Written 2026-10-17 from a 14-thread research sweep, a six-concept design panel judged on four lenses, a ten-cluster verification pass against primary sources, and two red teams. Facts marked [V] were read on a primary page on 2026-10-16/17; [I] are inferences.*

---

## 1. The decision

Build the site as **a light table in a dark room**, not a 3D room you walk through.

The screen is a backlit glass pad, already on when you arrive. Everything you are lies on or beside the glass as a translucent sheet: the nine mask layers of a small chip you had fabricated, a NAND gate you cut by hand in red Rubylith, your diffusion films as 35 mm strips with their provenance printed in the edge code, Botticelli's map of Hell under your pencil marks, a reading calendar with today's cell cut out so the light comes through. The only verbs are lift, lay, align, and look through a loupe. There are no pages, no menus, no character to steer. A plain inventory page is one visible click away for recruiters and screen readers.

The thesis the table makes without saying it: **at work you train models to do what used to be done on this piece of furniture; everything on the table you did by hand, except the chip, which the tools placed, and that is the job.** Rubylith chip layout, vellum drafting (CAD's ancestor), reading film, and tracing illuminated manuscripts all happened on a light table. Your four domains cohere by history, not by being placed in adjacent rooms.

### Why not the 3D room you sketched

This is the one prior the research should move, so here is the evidence.

- **The four sites you sent are not walkable worlds.** Anna Cheng's is a scroll-driven skydive with one input (native scroll) and every piece of chrome made diegetic. Paul Bakaus's is a conventional six-page blog wearing a pixel skin, with three opt-in games about his real frustrations. Gordon Tu's is a plain white one-paragraph bio whose single toy is his removable glasses. Krishna Gupta's is a 720 px resume made alive by one hand-drawn avatar with memory and moods. What they share: one charismatic object or verb, refusal to pad thin content, honest provenance, and a making-of as content. [V, from bundles and public repos]
- **The room with hotspots is the course graduation project.** On the three.js forum, 46 of the latest 50 portfolio showcase threads are from 2026 and 27 got zero replies [V]. Every 3D Awwwards winner from 2023 to 2026 has Usability as its lowest sub-score [V]. Hacker News on the excellent Bruno Simon 2025 rebuild: "an extremely well-executed portfolio site; no more, no less." That is the ceiling for a place-with-hotspots, and your sketch (three hotspots in a room) is that template with less content than its clones.
- **What still wins is a verb, shared state, or a story about a person.** Messenger (deliver parcels, multiplayer), Bruno 2025 (global weather, public whispers), Aimee's Papercraft World (seasons revealing a life, almost no "work" on it), Carter Ogunsola's print shop (crank a press to flip projects). Thin content is survivable; a thin room is not.
- **The light table is a verb and an argument,** and it runs at near-zero cost on a phone, which is where friends will open it.

What would change this conclusion: if you want a free-walk 3D world specifically as a statement of identity (for instance you are heading into games or spatial computing), the fallback is the "Closer" concept in section 10: a Gaussian-splat scan of your real desk with exactly two interiors.

---

## 2. The rule

Every piece of content is a sheet. A sheet survives only if it passes three tests:

1. **It is true.** You made it, chose it, or cut it. Public-domain texts count as content you chose; AI-painted scenery does not.
2. **Its physics does the work.** Mask layers multiply because tracing paper multiplies. Registration pins snap because masks must align. The loupe magnifies because that is how masks and contact sheets are read. Anything whose physical behaviour is decoration (a jar that is a textarea, an envelope that is a date, a sticker that is a footer) is cut.
3. **It tells the visitor something about you** (Bakaus's test; he rejected a pretty forest hero for failing it).

Adding content, forever, is one more sheet and one line in a manifest. Sheets at the edge of the glass are opaque and dim; sheets on the glass are translucent and blend. That is physically true of tracing paper, and it is also the performance budget: only what is on the glass is composited.

There are no drawers and no labels. A light table is a pile, and the pile is visible. The phone is not a shrunk table: the phone **is** the pad (white ground, one sheet at a time, swipe through the pile, tilt for parallax between two layers, loupe drawn above the finger).

---

## 3. A first visit

**0 to 10 seconds.** No loader, no entry gate, no music. A dark margin, a lit rectangle, and on it a chip already stacked, registered on two pins, glowing: nine translucent layers in the garish KLayout colours that chip designers actually see, reading as a tiny city. Beside it, under the stack, a drafting sheet whose title block says in one line who you are. Nothing else moves.

**10 to 60 seconds.** The first gesture is destruction, which is a one-move delight (assembly is a chore): they lift the top layer off. Its tab carries one plain sentence: *metal 4, the top layer I'm allowed to draw on.* Under it, poly: *a tool placed every one of these gates.* They slide a layer a millimetre; the chip visibly breaks (shapes that should meet no longer do); drag it within reach of the pins and it snaps back with a click. They pick up the loupe and read the pencil note on the title block: *I wrote the logic. The tools placed it. At Architect I work on the model that does both. Everything else on this table I did by hand.* Under the stack is a different sheet, deep red, crudely knife-cut: a NAND gate in real Rubylith. The loupe over it plays twenty seconds of your voice: how the 4004 was cut on a table like this, and what you do now.

**The thing they send.** Every state has a permalink and a static image, so what travels is a URL that reproduces the moment without the friend being told what a mask is: `/today` (the calendar cell lit for today's date, with the pencil line showing how far behind you are), `/canto/12` (your pencil marks over Botticelli, with your fifteen-second reading), `/stack` (the chip, with a one-tap "misalign" button). The sentence a visitor says is: "his website is a chip you can take apart, next to the gate he cut by hand."

**The ending.** A pull cord. Pull it and the pad dies; in the dark the only legible things are email, GitHub, and the inventory. An off switch is the memorable inversion; an on switch is a preloader.

---

## 4. The sheets at launch

Five things. Each must work flawlessly on an iPhone in daylight before anything is added.

### 4.1 The chip stack (your Architect experience)

- **The object.** A 1x1 Tiny Tapeout tile you design now and submit to shuttle TTSKY26d, which closes 2026-11-30 20:00 UTC [V]. Nine layer sheets rendered pixel-registered from your own GDS (poly, li1, met1 to met4, and three contact/via layers is the legible set; sky130 draws about fifteen). The physical chip arrives around June 2027 (official estimate; history is 7.5 to 15 months and one shuttle never arrived) [V]. Until then the sheets are the chip, and that is fine: the layout is the artifact.
- **The design.** Small on purpose. The suggestion is a canto counter (0 to 100, button-stepped, seven-segment output) so the chip counts the same number as the Dante sheet. If you are not writing RTL at Architect, the honest caption is still strong: you described the logic, Claude Code helped write and test it, OpenROAD placed and routed it, and the point of the sheet is to show what the model you work on has to beat. There is no Tiny Tapeout rule against AI-assisted RTL; the design must be open source under Apache 2.0 with docs and a test [V].
- **The Rubylith NAND.** One gate, cut by hand with a knife, photographed on the lit pad (a flatbed without a transparency unit renders Rubylith as mud). It is the one thing on the table no one else can have, and it makes the thesis physical.
- **The title block.** A drafting sheet, Leroy-style lettering, whose title block is the bio (DRAWN: W. CHEUNG, REV, DATE) and whose notes field holds the thesis sentence and the two honest lines about your jobs. The stealth startup is one line (*a startup I can't name yet, AI for CAD*) until it signs off on more. The ten beliefs about AI for hardware and ten open questions, if you write them, live on this sheet's reverse and on the inventory page as text; scanned handwriting is costume.
- **The one 3D moment** is free: Tiny Tapeout hosts a URL-driven 3D viewer (`gds-viewer.tinytapeout.com/?model=<your .oas>`) and a 2D explorer with switch-level simulation [V]. Link to them from the stack rather than building a viewer; the category is crowded and the physical-metaphor presentation is the differentiator.

### 4.2 The films (your projects)

- Each diffusion film is a **35 mm strip of six frames** with the provenance where film provenance always lived, in the edge code: model, month, seed or prompt hash. Beside the final strip, for at least one film, a **contact sheet of failed takes**. The process is the content; the finished film is the payoff. This fixes the weakest part of every concept the panel produced: all six treated your only finished creative work as an MP4 with a caption.
- The loupe over a frame plays that frame, muted, magnified (the loupe owns the only `<video>` element; strip frames are posters). Tap the frame and the film plays fullscreen with sound, unmuted inside the tap, which is the only way iPhone Safari allows it [V].
- Other projects enter the pile as the sheet type native to them: an app as a drawing sheet with a title block and one screenshot, a research report as an index card. Candidates on your machine, for you to accept or reject: the mini-app factory (Ease, Halfway, Seed, Earmark), the outreach engine, coursepicker, the deep-dive reports, the brain vault. The rule is the same: one sheet, one true line, no page.

### 4.3 The reading surface (Dante and Tolstoy)

You have no notes, and the room does not need them. The public-domain text is the content; you contribute **position, selection, and voice**, which take minutes rather than hours.

- **Dante is a map with a marker.** Botticelli's Map of Hell (the clean 2,735 x 1,910 px Commons file, public domain; the higher-resolution Vatican scan is watermarked and contractually encumbered, do not use it [V]) under a tracing sheet of your pencil: finished cantos ticked, the current one circled, the rest blank. That blankness is an honest null state, not a shelf of ratings. For each finished canto you choose one tercet, the smallest honest unit, and record it in your own voice in under fifteen seconds, with an optional pencil line on why it stopped you. The loupe on a tick plays it. The ceiling is 100 clips. Reading three lines of a copyrighted modern translation is a strong fair-use case but not a safe harbour; attribute translator and edition, or read Longfellow (Gutenberg #1004) or the Italian (Gutenberg #1012), both public domain [V].
- **Tolstoy is a calendar,** his own device. If it is *War and Peace*, the Maude text on Gutenberg has exactly 365 chapter headings (15 books plus two epilogues; the panel's "361" was wrong) [V], so a chapter a day is literally a year. Today's cell is **die-cut**, the only thing lit from beneath. A pencil line runs from the chapter the schedule says you should be on to the chapter your bookmark is actually at; the gap is the content, and it is a true fact about a person that no bio admits. If you stop reading, the gap does not keep growing into a shame counter: after three idle weeks the sheet freezes as a dated snapshot (*bookmark stopped 2027-01-14*), which reads as a true statement rather than a broken page. If it is *Anna Karenina* (Gutenberg #1399, 239 chapters) or anything else, only the config changes.
- The surface is the only personalization on the site that is true rather than performed, and it costs you one number in `now.json` a week.

### 4.4 The jar (what grows)

The one write surface at launch. A notepad asks *what are you curious about?* A small keyword table routes the predictable phrasings to the sheet that answers them (chips, films, Dante, Tolstoy, who are you). Everything it cannot answer drops into a glass jar with a counter (*31 asked, 22 answered*). On a cadence you declare and can keep (monthly is enough), you record answers in a batch; the asker finds theirs waiting. This is a blog replacement that needs selection and voice, never essays, and it grows from real demand instead of guessed FAQs.

Two mechanics make it survive reality. The asker gets a **claim slip**, a short token URL on the jar label, because Safari deletes localStorage after seven days without interaction with the site, which is exactly the return-visit case [V]. And the page never reads the database at load: the Worker writes to D1, a publish script regenerates a static `jar.json`, and only the token-addressed "your question" hits D1 live. Admin is a forty-line CLI, not a web UI.

### 4.5 The names sheet (your name in metal)

The headline mechanic, verified and corrected.

- **What is true.** Tiny Tapeout allows art on the sky130 metal-4 layer (GDS 71/20) as a hard macro placed at fixed coordinates; the precheck has no rule against it; the only forbidden layer is metal 5, which carries their power grid [V]. Visitor names drawn as 5x7 pixel glyphs made of rectangles pass design rules at 0.5 µm pixels if no two pixels touch only at a corner [V]. Every project's GDS is published within weeks of the shuttle close under the terms you agree to, so a visitor can open the public layout in Tiny Tapeout's viewer and find their coordinate long before silicon exists [V].
- **What is not true, and the sheet must say so.** The art is covered by the metal-5 power grid and fill; it is invisible on the delivered chip unless Texplained delayers and images that shuttle, which has happened for 4 of about 29 shuttles [V]. The receipt is the public GDS and a micron coordinate, not a photo. Capacity on a 1x1 tile that also holds logic is roughly 30 to 40 names at 0.5 µm pixels, more at 0.3 µm or on a 2x2 tile [V, arithmetic]. Scarcity said aloud is a feature.
- **Decouple it from launch.** The shuttle closes two weeks after a realistic launch, and names must be frozen ten days before close to re-harden and pass precheck locally. So: collect 20 to 30 names from friends off-site before 2026-11-20, bake them into the tile, submit. At launch the sheet is a finished artifact (*30 names went into TTSKY26d on 30 Nov; find yours in the public GDS; the next sheet opens for TTSKY27a in spring 2027*). Public name input opens later, with a human approval queue, because a slur typed before close becomes part of a chip with your name on it forever. Names recur one sheet per shuttle you buy a tile for; the shuttle cadence is about three sky130 runs a year [V].
- If you decide against the chip entirely, this sheet does not exist and the jar is the thing that grows. The site still works.

### 4.6 Inventory and exit

A plain-HTML page, first in DOM order and visibly linked (not only a keyboard shortcut): every sheet listed in human words (Chip, Films, Reading, Questions), every line's text, every video as `<video>`, the beliefs and questions, contact, and a making-of that credits the tools as cast and records costs and dead ends (Gordon Tu's lesson: a documented making-of is credible content when you have no writing). Thirty seconds for a recruiter, complete for a screen reader, and the no-canvas fallback.

---

## 5. What is yours, and what was cut

At launch, exactly two personal things, both true:

- **The table remembers you.** Which sheets you lifted and left out, in localStorage, shown in the world rather than in a toast.
- **Your question has an answer.** The jar, via the claim slip.

Permalinks with static images (`/today`, `/canto/N`, `/stack`, and later `/name/<coordinate>`) are the share objects. They are built at publish time; nothing renders images at runtime.

Cut from v1, each with the reason, each on a dated "next sheets" list rather than in the build:

| Cut | Why |
|---|---|
| A typed "looking for…" router with an in-browser embedding model and Jev behind it | A semantic search stack for eight destinations. Keyword table plus jar covers launch; see section 6 for when the router earns its place. |
| ROUTE sheet (a Numberlink the visitor solves, then Lee's 1961 maze router replays over it) | 60 to 120 seconds of puzzle tax; legible to the few who know what routing is. Good idea, wrong place. When it returns, the router solves it live while you watch. |
| Live-redrawing dimensions on the drafting sheet; a sealed envelope stamped with the stealth startup's date | Publishes a confidential date; the live sheet is 10 to 14 hours for a trick. One honest line until the company signs off. |
| "What are you reading?" catalog cards with Open Library covers | A second user-generated surface with a second moderation queue. v2; the Open Library path is verified and free (cover-id and OLID paths are unthrottled, resolve at submission time) [V]. |
| Other visitors' loupes as faint circles on the glass (Durable Object presence) | Tells the visitor nothing that moves a belief. |
| Room light following the visitor's clock | Invisible on a white pad. |
| Printing your traced overlay at 300 dpi | Browsers print CSS pixels at 96 per inch; the audience that owns tracing paper is near zero. Capture strokes as SVG anyway. |
| A cloned voice for the Italian and Russian lines | A line you cannot read is a line the site should not read. See section 6. |
| Scanned handwritten index cards, pencil-on-tape drawer labels, glow-in-the-dark sticker | Costume. The two red teams independently counted eighteen vintage-analog signifiers in the draft and called it a prop table. Keep the ugliness of the real media (KLayout colours, Kodak edge codes, Leroy lettering) and lose the warm kraft-paper tone. |

---

## 6. Voice and AI, with names

**Your real voice carries everything personal.** One session in a closet with a cheap dynamic mic or a phone, one take per clip: the thesis line on the title block, the Rubylith line, one caption per film, the tercets you have actually finished. Lines under fifteen seconds, captions always in the DOM, nothing autoplays, a visible "sound: on/off" state. Reception evidence is consistent: a living owner, upfront disclosure, and non-interactive narration read as charming; clones that converse or speak for someone read as creepy, and the standing complaint even about good clones is "flat" [V]. Of your four inspiration sites, none uses the owner's voice; this is a real differentiator.

**No voice clone at launch.** If you later want one for a specific job, ElevenLabs Instant Voice Cloning starts on the $6 Starter tier (first month $1, 30k credits, commercial licence; cloning is not on Free) [V]; Cartesia Pro is $5 with cloning and a commercial licence [V]; Gemini's voice replication shipped 2026-09-22 and requires you to record a specific consent sentence, with free-tier availability of voice creation unverified [V]. Label any cloned line visibly; ElevenLabs' use policy requires disclosure where omission would mislead [V].

**Jev, honestly.** TypeSafe AI's Jev is a typed decision model: it answers `choice`, `score`, and `noul` (true/false) questions over a state and never writes text [V]. It is a router and a judge, not a mouth. It costs $0.042 per million input tokens with free output, has no free tier, blocks browser calls by CORS so it must sit behind a Worker, and its self-serve signups were paused on 2026-09-22 after the waitlist was dropped two days earlier; whether a hobbyist can get a key today is unverifiable [V]. Gordon Tu listed Jev in his bio for thirteen days and removed it without a stated reason; his site never called it [V].

The useful fact: the "System One" request shape is now multi-vendor. Cloudflare's **Clef** models are Jev-API-compatible, Apache-2.0 open weights, and `@cf/cloudflare/clef-flash` is priced in neurons, so Workers AI's free 10,000 neurons per day covers roughly 10,000 routing requests of 300 tokens [V]. Cloudflare's own benchmark has Clef-flash beating Jev on three of TypeSafe's four workflows [V]. So: write the jar's router once against the System One shape, serve it from Clef-flash for $0, and swap to Jev if an eval on your own misses shows a gap. This is the first post-launch addition, once the jar holds more than a dozen recorded answers, because below that a keyword table and a shrug are honest and free. Routing one sentence to eight destinations with a frontier classifier is ceremony, and you asked to be told plainly.

**"The astra model" is GPT-6 Astra** (OpenAI, launched 2026-09-03, $10 per million input and $50 output, computer use via the Responses API) [V]. It does not generate meshes. It writes Blender Python, runs Blender headless, and iterates on renders; OpenAI's launch demo is a house modelled in Blender and walked in Unreal, built that way by their own developer-experience staff [V]. OpenAI recommends code execution over screenshot-driven computer use for it, and a simple scripted scene cost one careful tester about $4 at API prices [V]. The free equivalent is **Blender MCP** (`mcp-for-blender` 2.1.9, MIT, 31k stars) driven from Claude Code, and at least one careful tester reports parity with Astra on simple scenes [V]. A plan-changing fact from the verification pass: **your Mac is Intel** (i5-8257U), so Blender tops out at 4.5 LTS, which Blender MCP supports [V]. Nothing in v1 needs Blender. If you want the Astra experiment, the right job is a one-off GDS-to-3D extrusion script, and the honest place for it is the making-of.

**Gaussian splats** of your real desk (Scaniverse free tier, SuperSplat cleanup, Spark renderer) are a lovely weekend experiment and the backbone of the runner-up concept, but Spark requires three.js's classic WebGL renderer while three's own new splat loader requires the WebGPU renderer, so the two are mutually exclusive [V]. Not v1; a candidate for the making-of.

**AI in the pipeline, where it earns its place:** Claude Code writes the Verilog and its cocotb test, the Worker, the Canvas engine and the publish script; Tiny Tapeout's own `tt_tool.py --create-png` and gdstk render the per-layer sheets (gdstk reads a GDS, filters by layer and datatype, and writes SVG; KLayout rasterizes but has no SVG writer) [V]; gdstk generates the name-art macro; the precheck runs locally in Docker before any shuttle submission.

---

## 7. The build

### 7.1 Rendering, decided once

The glass is a **Canvas 2D** surface: sheets as bitmaps, `globalCompositeOperation = 'multiply'` for the stack, drag and pin-snap in a few hundred lines, the loupe as a second small canvas drawing the hi-res detail asset of whichever sheet is under it. Text (captions, title block transcript, inventory) is DOM.

Why not DOM `mix-blend-mode`: no benchmark exists for nine 2048 px blended layers on iPhone, WebKit has open correctness bugs where blended layers inside composited scrollers fail to blend against the right backdrop, and the fallback would be a second renderer and a rewrite [V]. Canvas blend modes are supported on every iOS version in use [V]. PixiJS v8 (multiply is a native blend, no extra import) is the escalation if Canvas 2D profiles badly, decided by a day-one spike on an iPhone 12 and a Pixel 6a, never as a late fallback.

Budgets: phone sources at 1024 to 1280 px via the manifest; at most four sheets on the glass, the rest at the edge with normal blending; `touch-action: none` on the canvas only and `overscroll-behavior: none` on the page; one sheet draggable at a time; the loupe on touch is a toggled mode drawn above the finger.

### 7.2 Stack

| Layer | Choice | Why |
|---|---|---|
| App | Vite 8, TypeScript, no framework | The UI is one canvas, one input, and a static page. |
| Motion | GSAP 3.15 (Draggable and Inertia included; all plugins free since 3.13) [V] | Weight and snap without writing a spring. |
| Audio | HTML5 `<audio>` for voice (AAC `.m4a` baseline, Opus `.ogg` as a second source for iOS 18.4+) [V]; Web Audio for paper and switch sounds | iOS silences Web Audio with the ring/silent switch but not media elements; after the visitor turns sound on, set `navigator.audioSession.type = 'playback'` (Safari 16.4+) so everything plays [V]. Howler is three years unmaintained and unnecessary here. |
| Haptics | `navigator.vibrate` on Android; on iOS 18+, a transparent `<label>` over a hidden `<input type="checkbox" switch>` for the pin snap (programmatic clicks no longer trigger it) [V] | One line each; off under reduced motion. |
| Video | H.264 MP4 on R2 with 1-second keyframes, posters as JPEG; fullscreen via the `<video>` element's own fullscreen (iPhone has no element fullscreen) [V] | |
| Content | `sheets.json` (the manifest), `now.json` (canto, chapter, start date, cadence, timezone), `jar.json` (regenerated) | The manifest is the CMS. |

### 7.3 Hosting, $0 [V throughout]

- **Shell, sheets, audio:** Cloudflare Workers Static Assets. Static asset requests are free and unlimited; 25 MiB per file; 20,000 files per version. Route only `/api/*` through the Worker so the 100,000 requests per day cap can never take the site down (assets-first routing; a Worker-first route returns 429 over quota).
- **Video and anything over 25 MiB:** R2 free tier (10 GB, 10 million reads a month, free egress) on `cdn.<your-domain>` with a cache-everything rule and a CORS policy allowing `Range`. Serving your own video from R2 is permitted under Cloudflare's current terms; the restriction targets proxying video from elsewhere. The domain's DNS must be on Cloudflare for an R2 custom domain, which the registrar transfer makes trivial.
- **Dynamic:** the same Worker, `/api/jar` and `/api/claim`, Turnstile (free, tokens single-use and valid 300 seconds, so load it lazily when the notepad opens and reset on expiry), D1 (5 million reads and 100,000 writes a day), one WAF rate-limit rule on `/api/*`, input length caps and an allowlist regardless.
- **Domain:** Cloudflare Registrar at cost (about $10.50 for .com, about $12 for .dev renewal; confirm in the dashboard).
- **Analytics:** Umami Cloud Hobby (100k events a month, one site) for play events (*lifted met4*, *loupe on strip*, *heard canto 5*, *dropped a question*). Cloudflare Web Analytics has no custom events.
- **Not Vercel:** Hobby's 100 GB a month includes static files, overage pauses the site for 30 days, and its non-commercial clause counts "advertising the sale of a product or service" as commercial, which matters if the site ever mentions your film studio's services.

The first thing that breaks is the 25 MiB per-file cap (move the file to R2); the second is the Worker's daily request cap on `/api/*` (429s; the table keeps working).

### 7.4 Accessibility and etiquette

Inventory link first in DOM order. Every sheet reachable by keyboard from the inventory list; Tab through sheets on the glass, Enter to lift, arrow keys to nudge, a visible focus ring drawn on the canvas. `prefers-reduced-motion`: no inertia, instant placement, no pad flicker (the pad is on when you arrive anyway; the off-cord fade is one soft ramp under a second). Contrast floor for the dark margin on a phone in daylight; the pad itself is white, which is the daylight-safe design. Captions for every voice line. Sound and haptics default off, one visible switch. Test on one mid-range Android, not only an iPhone.

### 7.5 Asset pipeline

1. Buy an A3 LED tracing pad, a sheet of Rubylith (Ulano), tracing paper, a knife and mat, a grease pencil. No scanner: photograph everything on the lit pad in a dark room with a phone on a tripod, so every sheet shares the pad's real lighting and the seam between real glass and fake paper never appears.
2. Chip: the `ttsky-verilog-template` repo; the GitHub Action hardens with LibreLane 3.0.14 and publishes your `.oas` to GitHub Pages with links to the hosted 3D and 2D viewers [V]. Per-layer PNGs via `tt_tool.py --create-png` or gdstk filtered on `(layer, datatype)` (metal 4 drawing is 71/20; via4 shares layer 71, so filter by datatype) [V], against one fixed bounding box so the nine sheets register.
3. Name art: gdstk rectangles only; 0.5 µm pixels on a 0.8 µm pitch or rows merged into single rectangles; a LEF with obstructions; `ROUTING_OBSTRUCTIONS` and `PDN_OBSTRUCTIONS` on metal 4 where the macro sits, as the TT09 "GDS Art" project did [V]; local precheck in Docker.
4. Films: ffmpeg to six frames per strip into an SVG strip template with edge codes; 720p H.264 with 1-second GOP; posters.
5. Texts: download Gutenberg files once and commit them (Gutenberg forbids automated access and deep links, and serves no CORS header) [V]; strip Project Gutenberg references or keep their licence sentence [V]. Italian Commedia and Russian *War and Peace* are on Wikisource with CORS if you want the originals [V].
6. Audio: `ffmpeg loudnorm`, AAC-LC 64 kbps mono, plus Opus; Adobe Podcast Enhance for cleanup if needed (free tier exists; limits unreadable today).
7. Publish script: regenerates `jar.json`, the share images, and the inventory from the manifests, then `wrangler deploy` from GitHub Actions.

### 7.6 Plan and hours

The honest total for the full draft spec was 230 to 330 hours. Four weekends buys the five launch things, on desktop and phone, if content day zero happens first.

| When | Work | Gate |
|---|---|---|
| Day zero (you, before any code) | Answer section 8. Order the pad and Rubylith. Shoot the pad. Cut and shoot the NAND. Write the title-block sentence and the two honest job lines. Record the thesis line and three tercets. Transcode one film. Decide chip yes/no; if yes, start the Verilog with Claude Code. | Launch content defined: pad photo, NAND, nine layer PNGs, 10 tercets, 1 strip, 1 contact sheet, the lit calendar day. |
| Weekend 1 (14 h) | Canvas engine: pile, drag, pins, multiply, loupe with detail assets; phone layout as its own design; inventory page; deploy to Cloudflare. | 60 fps on an iPhone 12 and a Pixel 6a with four sheets on the glass, or switch to PixiJS now. |
| Weekend 2 (14 h) | Chip stack with registered layers, Rubylith, title block with voice; films: strips, edge codes, one contact sheet, R2 video, fullscreen play. | A stranger can take the chip apart and understand the thesis without help. |
| Weekend 3 (14 h) | Reading surface: Botticelli, pencil tracing, tercet playback; calendar with die-cut today, gap line, freeze logic; jar: Worker, D1, Turnstile, claim slip, CLI admin, static `jar.json`. | `/today` and `/canto/N` permalinks render correct static images. |
| Weekend 4 (12 h) | Keyboard path, reduced motion, contrast, captions; performance pass; one static OG image; share images; making-of; launch. | Launch only with living parts: 10 tercets, the lit day, the jar open. |
| In parallel, if chip yes (2 weekends of your time) | Verilog, test, docs; harden iterations (10 to 30 minutes each in CI); art macro; names frozen 2026-11-20; local precheck; submit before 2026-11-30 20:00 UTC. Buy the tile only after precheck passes. | |

Content production is the real critical path: roughly 35 to 60 hours of serial, physical, you-only work (pad photo, Rubylith, writing the sentences you will defend publicly while employed at two startups, recording, the Verilog). Build against placeholders and it will look like placeholders.

### 7.7 Costs

| Item | Cost |
|---|---|
| A3 LED pad, Rubylith, tracing paper, knife and mat, grease pencil | about $100 to $170 |
| Tiny Tapeout 1x1 tile + first subsidised devkit + shipping (53 of 80 subsidised kits left on SKY26d as of 2026-10-17; €300 unsubsidised) [V] | about €185 |
| Domain | about $10 to $12 a year |
| Hosting, analytics, video delivery | $0 |
| Voice clone (only if ever wanted) | $1 trial month |
| Blender, Blender MCP, gdstk, KLayout, LibreLane | $0 |

---

## 8. Decisions that are yours

These change the work, not the architecture. Answer them before day zero.

1. **The chip.** What do you actually do at Architect, and do you want to design and submit a Tiny Tapeout tile (with Claude Code's help, honestly captioned) by 30 November? This decides sections 4.1 and 4.5. Without it, the stack can be built from an open design you can explain and the Rubylith NAND stays; the names sheet disappears.
2. **The books.** Which Tolstoy, which Dante translation or the Italian, your current positions, your start date, and the timezone that defines "today." Everything in 4.3 is config on these.
3. **Projects inventory.** Which of the diffusion films, the mini-app factory, the outreach engine, coursepicker, the deep dives, and the brain vault are public-worthy? Do process artifacts for the films exist (prompts, seeds, failed takes)? Is anything in them unpublishable?
4. **Who the site exists to find,** and what they should do in the last ten seconds. A founder looking for collaborators or clients designs the exit differently from a student looking for a job, and it decides whether "non-commercial" hosting clauses ever matter.
5. **Cadence you can keep.** One number: how often the bookmark moves and how often the jar is answered. Monthly is fine; the site states it.
6. **Publishing your city and hours.** The panel hardcoded a city from your email; nothing here does until you say so.
7. **Employer sign-off.** One honest line each about Architect and the stealth startup, approved in writing before launch. The caption describes what you do, never what the company will ship.
8. **Voice.** Are you willing to record yourself (yes is assumed)? Do you want a clone at all?

---

## 9. What is verified, what is not, what would change the conclusion

**Verified on primary pages** (2026-10-16/17): Tiny Tapeout shuttle dates, tile and devkit prices, art-layer rules, precheck rule list, metal-4 design rules, GDS publication terms, viewer URLs; every Cloudflare free-tier figure and the current video clause; Vercel Hobby limits and commercial wording; iOS audio-session, autoplay, haptic, fullscreen and codec behaviour (WebKit source and Apple release notes); GSAP, Howler, PixiJS, three.js and Spark versions and constraints; ElevenLabs, Cartesia and Gemini voice pricing and rules; Jev's API, pricing, CORS, signup history and the Clef alternative; Gutenberg IDs and the 365-chapter count; Botticelli file provenance; Open Library limits; GPT-6 Astra's model card, pricing and demo; Blender versions and this Mac's architecture.

**Not verified:** iPhone compositing performance for the multiply stack (no benchmark exists; the day-one spike is the test); whether a hobbyist can obtain a Jev key today; Adobe Podcast Enhance limits; Cloudflare Registrar per-TLD prices (at-cost policy confirmed, numbers triangulated); whether the "owner's reading position versus schedule on a personal page" has a precedent (none found through the channels available; award galleries were largely unreachable).

**Novelty, honestly.** Light table plus loupe is a $49 Framer template and a September 2026 open-source photography portfolio; drag-then-loupe is a June 2026 Codrops case study; names in silicon at scale is NASA's mechanic; interactive GDS viewers are a crowded category; chapter-a-day calendars are a community genre; 35 mm edge codes are already a Codrops-featured motif [V]. What was not found anywhere: translucent, registered, multiply-blended chip-mask sheets as a site's grammar; a visitor guestbook fabricated through a Tiny Tapeout shuttle; an owner's real reading position against a schedule on a personal page. Lead with those three.

**What would change the conclusion:** a decision that free-walk 3D is itself the identity statement (go to the splat concept below); a decision against the chip (the table loses its headline object; the jar and the reading surface carry it, and the Rubylith stays); an audience that is clients for a film studio (the films move to the centre of the glass, and the exit becomes a booking).

---

## 10. The five concepts rejected, and what was kept from each

The panel produced six complete visions from assigned angles; four judges (taste, feasibility, personalization, constitutional fit) ranked them; the light table was first on two lenses and second on two, with a rank sum of 6 against 10 for the runner-up.

- **Across the Table** (a dark room, one lamp, you ask and his recorded voice puts the object between you; a three-tier router; nothing generated). First on personalization. Rejected because its core verb is a text box, the most "internet" gesture there is, and sixty canned moves read as a rules bot by the third question. **Kept:** the jar as the growth loop, and the rule that the AI routes and never speaks.
- **Closer** (a Gaussian splat of your real room at your real hour; approach any object and fall into it at its own scale; a walkable extrusion of your GDS with eight switches lighting real nets). The best single moment in the field and the fallback if you want 3D. Rejected because five bespoke interiors in five weekends is a three-times underestimate, and its switch-panel precompute only works for combinational logic. **Kept:** the chip as a city, now delivered free by Tiny Tapeout's hosted 3D viewer.
- **Still Here** (your real desk scanned three times and crossfaded by its own clock; real is splat, added is ghost; the camera only goes where the phone went). The most disciplined rules in the field and no event: a week later a designer remembers "a nice splat of a desk." **Kept:** provenance read from the material rather than from labels (on-glass sheets translucent, off-glass opaque), the honest edge where the world ends, and the dated freeze.
- **Open Studio** (gouache-painted rooms from Blender gray-boxes painted over by an image model, with a live character occluded by paint). A real technical novelty and a tasteful clone idea (reading only the languages you cannot). Rejected because AI-painted gouache is the new stock photography and a walking chibi is the other 2026 tell. **Kept:** time of day as swapped images rather than live lighting, if the pad ever gets a window reflection.
- **Power Good** (a cyanotype city that is a chip, brought up block by block by routing wires, Numberlink as your actual professional problem, a live Lee router replaying against the visitor's hand). First on feasibility, last on taste: a pixel walk-around with a leaderboard. **Kept:** the ROUTE sheet, parked for v2, where the router solves while you watch rather than gating anything.

A completeness critic read all six and found they had copied the same content layer from the research brief (Tiny Tapeout chip, Keeter-pattern CAD toy, ten beliefs, tercet per canto, Tolstoy calendar, reading guestbook), so the real decision was narrower than it looked. Section 8 exists because of that finding: the container is decided; the content layer is yours.
