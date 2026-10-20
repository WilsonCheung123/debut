# SPEC: Wilson's table

The build contract. Every agent building a part of this site reads this first and conforms to it. Decisions here are settled; do not re-litigate them. If something here is impossible, say so in your report and do the closest thing that works.

## 0. What it is, in one paragraph

A single 3D scene in the browser: a desk, late at night, lit by one warm lamp. On the desk are the things of Wilson's life: nine books, his student ID, an FPGA board, a die-cast metal part with a sample tag, a guitar capo and pick, a hologram projector that plays his studio's films, a wooden puppet holding a Polaroid and an iPhone, a glass jar of paper slips, and a turntable. The camera is fixed. Hover lifts an object and names it. Click flies the camera to it and opens a paper panel with Wilson's words. Esc or click-outside returns. No pages, no menu, no walking, no voice, no sound effects. The feeling: you closed the rest of the internet and sat down at someone's desk.

The bar: no glitch, no jank, every transition thoughtful. The details are the product: the hover lift, the label, the camera move, the panel entrance, the music-pause bubble.

## 0.1 Build priorities (added 2026-10-20, override anything below that conflicts)

- **Desktop web first.** The target is Chrome, Safari and Firefox at 1280 to 1920 px wide (QA at 1440x900 and 1920x1080). Do not spend time optimising for phones: keep the portrait path from throwing errors, but no tap-target work, no bottom-sheet tuning, no mobile screenshots. The 44 px tap audits are informational only.
- **Never stall.** If something is not working after about 20 minutes of effort, immediately try two different approaches; if both fail, take the simplest thing that works, write it down in your report, and move on. Working, committed, partial progress beats a perfect part that never lands. Do not wait on long background jobs idly; do other parts of your job meanwhile.
- **Visible browser windows on the owner's machine are allowed for real-GPU or real-playback checks only** (the owner agreed 2026-10-20): keep them brief, one at a time, close them when done; everything else stays headless.
- **No placeholders for the owner to fill.** Nothing in `[brackets]` ships. Where a fact is unknown, make an educated guess in his voice and keep it plausible; list the guesses in the report under NEEDS_WILSON so he can correct them later.
- **The jar is in English throughout**, including the book: write it as "Keigo Higashino's The Miracles of the Namiya General Store" (author before the title), no Chinese title.
- **Commit early and often** on your branch with messages that say what works, so the integrator can salvage anything.
- **Craft bar is unchanged:** bevelled edges, believable materials, contact shadows, a hover lift that reads as lifting, labels that never collide, focus framing with margin, panel typography that reads like paper, transitions with no pop. Look at your own screenshots critically before reporting done.

## 0.2 Round 2 (Wilson's review of the first assembled build, 2026-10-20). Overrides anything below that conflicts.

**Graphics are the top priority.** His verdict on the first build: "solid but feels like coarse paper"; "needs to be rendered at a much higher resolution". Raise fidelity everywhere a visitor can see it: render at the device's full pixel ratio on desktop (never drop below 1.5 on a capable GPU; degrade shadows, transmission and dust before resolution), real anti-aliasing (MSAA on the WebGL target or SMAA), textures at 2048² where they are seen close (covers, the ID, the wood), the grain overlay reduced to a whisper or removed, soft shadows without acne, materials that read as what they are. Profile on the owner's actual machine with a headed Chromium (Playwright `headless: false` has the real GPU) and read `__table.info()`; the headless SwiftShader rig is for correctness only.

**Books.** Real covers now, supplied under `assets/covers/` (convert to WebP at 1024 wide for the atlas, keep the aspect; The Innovator's Dilemma cover comes from Open Library's covers API, resolved once at build). All nine books stand vertical; nothing lies flat. The cluster is one hover target ("the books"); clicking it opens a SHELF MODE modelled as closely as possible on https://press.stripe.com/ : the books line up on a shelf filling the viewport, you scroll (wheel/trackpad) along the shelf, the book under the pointer leans out, click opens that book's panel with Wilson's words; Esc or the back chevron returns to the table. Study press.stripe.com's actual behaviour (fetch the page and its bundle, read write-ups, look at videos) before building; the feel is the deliverable. New blurbs (verbatim):
- Anna Karenina: "Tolstoy wrote Anna Karenina amid a deepening spiritual crisis, and his troubles found their way into the lives of his characters. What holds a marriage together when love no longer does? Can we be guilty for feelings we never chose? What do we owe to others, and what part of ourselves must we surrender to repay it? You do not walk away from the book with these questions settled. You carry them into your own life, where a character you once judged begins to resemble someone you love, or, more unsettlingly, yourself."
- Inferno: "Dante's virtual reality project. The first book that made me understand how words could stretch the limits of what we can imagine, and make us feel we had been there." (keep the forest image)
- The Three-Body Problem: "Wow, this book is so good. Some writers believe science limits fiction by ruling out things like magic and time travel. But science is what expands our imagination. Can you imagine how vast the universe is? Can you grasp how brief a Planck time, roughly 10⁻⁴³ seconds, is? What if a book helps you to experience these? Our imagination is bounded by our mortal senses, not science."
- The Power Broker: "Moses is truly a force of nature. Also read it if you are interested in architecture!"
- 天龙八部: "I got caught by my mom reading Jin Yong's novels at 2 am. She let me keep reading, so I finished all 15 of his novels."
- Becoming Steve Jobs, The Innovator's Dilemma, Thinking Fast and Slow: unchanged (the Kahneman flow stays).
- Pride and Prejudice: blurb unchanged. The music-stop reaction is no longer a chat bubble. A LETTER slides in (paper, a wax-seal or fold detail is fine, no kitsch), set in a regal English handwriting face; a short heading explains that letter writing is a big theme in Austen's novels, so the theme is extended here; the letter reads, verbatim: "So you noticed the music stopped when you opened this book. Well, this is not a glitch. Let me ask you a quick question: when you're overwhelmed by sadness, should you listen to sad music? The common answer is yes, because it's cathartic. But if music, instead of relieving our sadness, becomes a tool to deliberately produce it, is the emotion still yours? To live is indeed to feel, but does indulging one's sensibility lead to a loss of emotional ownership? If you want the right answer (in my opinion), read *Persuasion*." (Persuasion in italics.)

**Puppet.** Hands must hold the objects properly (a finger currently passes through the phone); the phone and the instant camera need more detail and must read clearly in focus (larger if needed, real screen glass, lens, flash, shutter, print slot). Focus panel, verbatim intro: "A puppet, an iphone, a polaroid. A puppet, an iphone, a polaroid. A puppet, an iphone... are you getting it? These are not three separate things. This is one thing, and we are calling it an insanely great product." Below it, a gentle hint to click one of the three. Hovering the puppet, the phone or the camera in focus highlights it (a soft lift or glow and its name); clicking opens that item's own description: write them (the builder generates: what each introduced, why it redefined how people live with technology, one line on why it matters to Wilson; Think Different register, no more than 120 words each). The Elon quote and Wilson's goal stay at the end of the intro panel.

**Hologram.** The videos must actually play in a real browser (they did not for the owner in Chrome): debug the real hls.js path with a headed Chromium, verify frames advance on the screen. A second click on the hologram while focused plays the selected film fullscreen with sound (native video fullscreen or the Mux player), dropping the hologram treatment while it plays; closing fullscreen returns to the hologram.

**Student ID.** No flip. Clicking the card opens the story directly. Text, verbatim: "Howdy guys, my name is Wilson. / I spent my childhood in rural China, grew up in Hong Kong, and came to the US for boarding school. Now I study at Harvard. / I do three things: build products, read, and talk to interesting people. To relax, I play the guitar and hit the gym. Drop me a note in the jar if you think we'd enjoy chatting! / That's it. You'll have to look elsewhere to learn more about me. There's only so much room on a student card..."

**FPGA.** Text, verbatim: "I was the first intern at Architect, an AI for chip design startup. / I sourced training data and helped post-train a state-of-the-art Verilog model. / The team recently hit a milestone. Their own write-up:" followed by the write-up presented well: a link preview card (title, description and image fetched once at build time from https://architectlabs.com/blog/redwood, cached under public/), not a bare button.

**Die-cast.** Text, verbatim: "This is a sample part from a Chinese manufacturer, one of thousands of CAD files I sourced for a startup teaching AI to design parts of its own. / I believe some of that data ended up at one of the labs whose model helped build this website. Small world!"

**Capo and pick.** No words for now: the panel is a single quiet line ("learning guitar") or nothing; keep the objects.

**Music.** YouTube instead of Spotify (Spotify would not play whole songs). Use the YouTube IFrame Player API with a playlist (config value; the owner will supply the playlist URL or the video IDs for his 15 tracks; until then search for the official uploads of each track and list the IDs in a config with a comment). Same contract: the record spins and the arm follows play state; the engine pauses music when Pride and Prejudice opens; the player persists across focus changes; lazy-load on first turntable focus.

Also apply the integrator's six open items from HANDOFF.md where still relevant (capo focus angle, lamp ellipse in puppet focus, die-cast material, puppet grey at rest, FPGA sliver in ID focus; the flat-book frame is moot).

## 1. Stack (settled)

- Vite 8 (vanilla TypeScript, no framework), `three@0.186.x` on the classic `WebGLRenderer`, `gsap@3.15` for all tweens, `hls.js` for the hologram video (native HLS on Safari), `@fontsource/newsreader` (body serif), `@fontsource/caveat` (handwriting), system sans for small labels, system CJK for Chinese text on canvas.
- No post-processing library. Glow is additive materials; vignette and dimming are a CSS overlay on the canvas.
- Cloudflare Worker (TypeScript) + D1 for the two write endpoints; `wrangler dev` locally; Vite proxies `/api` to it. No other backend.
- Playwright (already installed under `~/apps/tools/node_modules`, Chromium cached) drives screenshots and interaction tests. Headless WebGL needs `--use-gl=angle --use-angle=swiftshader --ignore-gpu-blocklist` (or `--enable-unsafe-swiftshader`); the shot tool must handle this.
- Repo: `/Users/dreamwilson/Desktop/personal-site` (git). Layout:

```
index.html
src/main.ts                 boot: engine + registry + ui
src/engine/                 scene.ts camera.ts lights.ts picking.ts hover.ts focus.ts loop.ts quality.ts resize.ts
src/ui/                     panel.ts (paper panel), label.ts (hover label), bubble.ts (message bubble), overlay.ts (vignette/dim), a11y.ts (hidden object list)
src/objects/<id>.ts         one file per object, exports create<Name>(ctx): TableObject
src/objects/index.ts        registry (all objects), created by the engine phase; object agents edit only their own file
src/layout.ts               rest poses and focus poses for every object (engine phase sets them; object agents may tune their own entry)
src/materials/              shared materials + canvas texture helpers (wood, paper, metal, glass, plastic; makeCanvasTexture)
src/content/<id>.ts         the words for each object's panel (plain TS objects / HTML strings)
src/panels/<id>.ts          custom panel behaviour where a plain content panel is not enough (kahneman flow, jar form, hologram controls, vinyl, pinocchio)
src/state.ts                global state: focused id, music.isPlaying, reducedMotion, isTouch, quality tier
public/                     id-card.webp, forest.webp, checker-shadow.svg, favicon
worker/                     src/index.ts, schema.sql, wrangler.toml
tools/shot.mjs              screenshots + scenarios (adapted from ~/apps/tools/screenshot.mjs)
tests/                      playwright scenarios (json) + a runner script
docs/                       VISION-v1-light-table.md (history), OBJECT-GUIDE.md (how to add an object), QA.md (rubric)
```

## 2. The scene

- Units are metres. Table top is the plane y = 0. Table top 1.60 m (x) by 0.90 m (z), centred at origin; x to the right, z toward the camera. Table is dark walnut, slightly worn, with a 3 cm thick top and simple legs that are mostly out of frame. Floor and walls are near-black; a faint cool fill suggests a window to the left.
- Lighting: one warm key (the desk lamp at the back-right, colour ~2700 K, intensity so that the table reads warm but not orange), one cool fill from the left at ~15% strength (~6500 K), a very low ambient. One shadow-casting directional light aligned with the lamp, PCFSoft, map 2048 desktop / 1024 phone, tight frustum around the table. Objects cast and receive shadows. Tone mapping ACESFilmic, exposure ~1.0, output sRGB.
- Camera: PerspectiveCamera, fov 34 on landscape, 46 on portrait. Rest pose: above and in front, three-quarter view from the front-left, pitched down about 38°, so the whole table is visible with a small margin and no object is narrower than ~60 px at 1440 px width. The engine agent tunes exact numbers and writes them in `layout.ts`. On landscape the camera parallaxes with the pointer by at most ±1.2° (lerped, 8% per frame); none on touch; none under reduced motion.
- Materials: `MeshStandardMaterial` everywhere, roughness 0.55 to 0.9, metalness 0 except metal parts. All boxes use rounded edges (RoundedBoxGeometry or bevelled extrusions). No pure black, no pure white: darkest surface ~#141210, lightest ~#f2ead8. Palette is muted and warm; accent colours live on book covers and the hologram.
- Idle life, always on: ~200 dust motes drifting slowly in the lamp cone (instanced points, additive, low alpha, 60 on phone); the FPGA's one LED breathing on a 4 s cycle; the vinyl spinning when music plays; the hologram's faint flicker when on. Nothing else moves unprompted.
- Entry: no gate, no loader text. The page is black; when the scene is ready the lamp "warms up" over 1.2 s (key intensity 0 to 1, colour temperature from amber to its final value) and the vignette settles. First frame of light is the finished table.

## 3. Interaction choreography (this is the product)

**Hover** (pointer: fine only; nothing on touch):
- Raycast on pointermove only, against each object's `hit` meshes (plus enlarged invisible proxies where the visible mesh is thin).
- Enter: the object rises 12 mm and tilts up to 3° toward the cursor, with a damped spring (~350 ms, slight overshoot, no bounce chain). Its shadow stays on the table (the lift must read as lifting). Cursor becomes `pointer`. A DOM label fades in over 120 ms at the object's anchor point projected to screen: object name in small caps, letter-spaced, cream on nothing (text-shadow only), 13 px.
- Leave: settles back in 450 ms, no overshoot. Only one object hovered at a time.
- Books in a stack lift individually; standing books tilt out ~8° (Stripe Press).

**Focus** (click or tap, or Enter on the hidden a11y list):
1. Label fades out (120 ms).
2. Camera eases to the object's focus pose over 900 ms, `power3.inOut`, position and look-at tweened together; fov may tighten by up to 4°.
3. Concurrently the scene dims: key light to 70% over 600 ms and the CSS vignette deepens; the focused object is excluded from dimming (its material stays lit, or a small spot keeps it).
4. At 450 ms into the move the panel enters: on landscape a paper card slides in from the right edge (translateX 24 px to 0, opacity 0 to 1, 420 ms, `expo.out`), max-width 440 px, full height minus 48 px margins, scrollable inside; on portrait a bottom sheet (translateY 32 px to 0) taking up to 70% of the height, with a drag-handle.
5. The URL hash becomes `#<id>` (deep-linkable, back button works). Focus is trapped in the panel; Esc, the panel's back chevron, or a click/tap outside the panel exits.
6. Exit: panel leaves (240 ms, `power2.in`), camera returns (800 ms), lights restore. The object does a tiny settle (it was lifted).
- Some objects have **in-focus clicks** (the ID flips; the puppet's three items; the hologram's film list). These are declared by the object and routed by the engine.
- Under `prefers-reduced-motion`: no lift, no parallax, camera cuts with a 200 ms crossfade, panels fade instead of sliding.

**Panels**: off-white paper (#f4efe6) with a very subtle grain (canvas-generated noise texture at 4% opacity), 1 px hairline border (#d9d2c4), soft shadow (0 24px 48px rgba(0,0,0,.35)). Body in Newsreader 17 px / 1.55; headings in Newsreader 26 px; small caps labels in system sans 12 px, letter-spaced 0.08 em; quotes set as hanging blocks. Links underlined hairline. Nothing bold-shouty. Each panel has a 36 px back chevron top-left and the object name as a small-caps kicker.

**Message bubble** (used by the Austen trick and nowhere else): a small iMessage-style bubble bottom-centre, grey, with a single button "why did my music stop?"; clicking it expands into a white bubble that types Wilson's answer out at 28 ms per character with a blinking caret, then shows "read Persuasion" as a quiet link. Dismiss on click outside or on panel close.

**Hidden a11y list**: an offscreen `<ul>` of `<button>`s, one per object, in reading order. Focusing a button shows that object's hover state; Enter focuses it. Panels have `role="dialog"` and `aria-labelledby`.

## 4. Objects and content

Every object implements:

```ts
export interface TableObject {
  id: string;                     // e.g. 'book.anna-karenina', 'id-card'
  label: string;                  // hover label
  group: THREE.Group;             // placed by layout.ts
  hit: THREE.Object3D[];          // raycast targets (may include invisible proxies)
  anchor: THREE.Vector3;          // local point for the hover label
  hover?: { lift?: number; tilt?: number };
  focus: {
    camera: { position: THREE.Vector3; target: THREE.Vector3; fov?: number };
    panel: PanelSpec | null;       // { kicker, title, html } or a custom panel factory
    onEnter?(ctx): void; onExit?(ctx): void;
    onClickInside?(hitName: string, ctx): void;
  };
  update?(dt: number, t: number): void;   // idle animation
  dispose?(): void;
}
```

`docs/OBJECT-GUIDE.md` (written by the engine phase) explains the materials helpers, how to make a canvas texture, how to declare hit proxies, and how to run `tools/shot.mjs --focus <id>` to see your object.

### 4.1 Books (one cluster, nine hits) — `src/objects/books.ts`, `src/content/books.ts`
Nine books: *Anna Karenina*, *Inferno*, *Becoming Steve Jobs*, *The Innovator's Dilemma*, *The Three-Body Problem*, *The Power Broker*, *Thinking, Fast and Slow*, *天龙八部*, *Pride and Prejudice*. Arrangement: five standing between two plain metal bookends, four lying in a slightly offset stack beside them. Covers are **designed procedurally on canvas**, not scanned: each book gets a palette, typographic cover (title, author), and one drawn motif (e.g. three orbiting discs for Three-Body; a bridge silhouette for The Power Broker; a quiet forest for Inferno; two mirrored faces for Thinking, Fast and Slow; a seal-script 龍 for 天龙八部; a regency silhouette for Pride and Prejudice). Spines carry title and author. Page edges are cream with a faint texture. Books have real proportions and differ in size and thickness. Be creative; make the set look like one shelf a person owns.

Focus pose: close on the book; the book lifts ~8 cm and turns to face the camera. Panel = title, author, Wilson's blurb, quote. Content (Wilson's words; keep them, light copy-editing only):
- Anna Karenina: "Tolstoy has a way of capturing the human psyche. Also: life happens. Don't take it too seriously." Quote: "He knew she was a woman like any other, but he loved her, and therefore her failures were dear to him."
- Inferno: "Dante's virtual reality project, with nothing but words." Quote: "Midway upon the journey of our life I found myself within a forest dark, for the straightforward pathway had been lost." Panel shows `public/forest.webp` (the red-robed traveller image) above the text.
- Becoming Steve Jobs: "Much better than Isaacson's, lol."
- The Innovator's Dilemma: "The tragedy of an incumbent is getting the right answer to the wrong question. So what's the right question? This book asks it, and gives you the right answer."
- The Three-Body Problem: "After reading this I felt like I was floating in the liminal space between time and space, detached from my surroundings. Wow. It's so good."
- The Power Broker: "What a force of nature looks like."
- Thinking, Fast and Slow: "Self-awareness for your visual and mental illusions." Then the custom flow in 4.2.
- 天龙八部: "I got caught by my mom reading Jin Yong's novels at 2 am. She let me keep reading."
- Pride and Prejudice: "You might wonder what a 19th-century feminist novelist has to do with a guy from Hong Kong in the 21st century who's into tech. Welp. So much." Plus the Austen trick in 4.9.

### 4.2 Thinking, Fast and Slow flow — `src/panels/kahneman.ts`
Opens in the book's panel, in sequence:
1. The checker-shadow illusion (`public/checker-shadow.svg`, Adelson's, already supplied) with the line "Squares A and B are the same shade." and a **proof the visitor performs**: a press-and-hold (or drag) that isolates A and B against a neutral field, or drags a same-shade bridge between them. It must be convincing.
2. "Now a mental one." The anchoring experiment, exactly:
   - Assign on load: the visitor is randomly placed in group A or B (persist in localStorage so they stay in it). They are not told the other group exists.
   - Question one. Group A: "Was Gandhi older or younger than 114 when he died?" Group B: same with 35. Two buttons: Older / Younger.
   - Question two. "How old was Gandhi when he died?" A numeric input. Submit.
   - Record: `POST /api/anchor { group, guess }`. Nothing else is stored.
   - Reveal: three numbers side by side: average guess from people who saw 114; average guess from people who saw 35; the real answer: 78. The visitor's own guess is highlighted in their group's column. Show the count behind each average ("from 23 people"); never fabricate numbers.
   - Explain, one line: "The first number was random and obviously wrong. It still pulled your guess toward it. That's anchoring: the mind starts from whatever it was handed and doesn't adjust far enough."
   - Close: "Like squares A and B: you can know the number is irrelevant and still be moved by it."
   - If the API is unreachable, still reveal the real answer and say the averages are unavailable right now.

### 4.3 Student ID — `src/objects/id-card.ts`, `src/content/id-card.ts`
A credit-card-sized card, rounded corners, thin, with a satin clear-coat sheen. Front texture: `public/id-card.webp` (supplied illustration, converted from `~/Downloads/Harvard student portrait card.png`, max 1024 px wide, keep the aspect). Back: a designed cream back with a thin maroon rule, a small VERITAS-style mark, and a faint barcode strip; the bio text lives in the panel, not in the texture. Focus: camera close, card lifts and faces the camera; **click again flips it** (180° on its long axis, 700 ms, slight arc) and the panel appears with the bio. Bio (Wilson's facts; write it in his voice, brief, first person):
- Spent the first years of his life in rural China, grew up in Hong Kong, came to the US for boarding school; first-generation.
- "I don't have a lot of interests. I do three things: build products, read, and talk to interesting, smart people. If you can help with any of the three, reach out."
- Threads he cares about: US–China, tech × humanities, spirituality.
- No email on the page (the jar is the contact path).

### 4.4 FPGA board — `src/objects/fpga.ts`, `src/content/fpga.ts`
A small dev board: green PCB, one square chip with a small heatsink or label, pin headers, a USB-C port, a few passives, one LED that breathes. Panel, "Architect": Wilson was the first intern; he sourced training data and helped post-train a state-of-the-art Verilog model; the team recently hit milestones: link https://architectlabs.com/blog/redwood. Keep it to three or four sentences; no product claims on the company's behalf.

### 4.5 Die-cast part — `src/objects/die-cast.ts`, `src/content/die-cast.ts`
A small aluminium die-cast housing (ribs, fillets, two bosses, a slightly rough cast finish, one machined face), with a paper tag on a string reading 样品 / SAMPLE and a handwritten lot number. Panel, "a startup I can't name yet (AI for CAD)": Wilson's experience negotiating with Chinese hardware-manufacturing vendors for data. Write three or four honest sentences from that one fact; mark anything invented in [brackets] for Wilson to edit. Do not name the company.

### 4.6 Capo and pick — `src/objects/guitar.ts`, `src/content/guitar.ts`
A spring-style capo (black with a rubber pad) and a celluloid pick (tortoiseshell pattern). Panel: he's learning guitar. Two or three light lines; leave a [bracketed] slot for what he's learning.

### 4.7 Hologram projector (the films) — `src/objects/hologram.ts`, `src/panels/hologram.ts`
A small black puck with a glass lens on top. At rest, a faint cone of light rises from it with a dim, slowly rotating ghost of the first film's thumbnail (so the table has one living light besides the lamp). Focus: the cone brightens, a translucent 16:9 plane fades in floating ~25 cm above the puck, slightly bowed toward the camera, playing the selected film **muted** via `hls.js` (native HLS on Safari) as a `VideoTexture` through a custom shader: additive, cyan-tinted toward the edges, fine horizontal scanlines, a slow 0.5% brightness flicker, soft edge falloff. Subtle, not sci-fi kitsch. The panel: "Realm" kicker, a short description of Realm (AI film studio; link https://realmfilm.art; Wilson to edit, mark [brackets]), then the five films as a vertical list with thumbnails (`https://image.mux.com/<id>/thumbnail.jpg?width=480`), title, and a "watch with sound" button that swaps the list for an embedded Mux player (`https://player.mux.com/<id>` iframe) inside the panel. Selecting a film also switches the hologram. Films and playback IDs:
1. Heading for the Misty Heights — gufxYjX5Yq5DjAPT47U86iRySJVH9dlcWk7kYA01CUA00
2. Volkswagen ID.ERA 9X — egwKBUiLY00jYjusvYU01GGaKQeKvj7SmmEUSWbDEMRlI
3. Driververse — 02vmSSor8qZ9UhrFWS4Bl8ACmfwW02b5gLFoo4ptZALhY
4. Arale — dt8THJES00ZdeRSziCGgJ5X402HHSK7Wx4mX55l6LY6cM
5. Big Fish & Begonia — qculeVz2PQX3bWBalRdiDTNU02xADvRMIMHbcaUcTA4U
HLS: `https://stream.mux.com/<id>.m3u8` (verified public). Video plays only after the user's click (the focus click is the gesture); muted autoplay with `playsinline`. On exit, pause and release the video.

### 4.8 Puppet with Polaroid and iPhone — `src/objects/puppet.ts`, `src/panels/pinocchio.ts`
A stylised wooden marionette, **our own design, not Disney's character**: natural pale wood with visible grain, ball joints, a long conical nose, a simple painted collar, no Disney costume elements (no feathered hat, no red/yellow outfit). He stands on a small round wooden base, slightly leaning, strings rising to a small cross bar lying on the table behind him (no strings to nowhere). In his left hand an instant camera (plain white body, black lens block, a slot at the front; no rainbow stripe), in his right hand a modern smartphone (dark glass slab, rounded, screen off with a faint reflection). Focus: camera close on the puppet so the two objects are legible; **in-focus clicks on puppet / camera / phone** scroll the panel to that item's section (and gently nudge the item).
Panel, "Think different" register, three sections then a coda:
- Intro (write this well): before a single frame of *Pinocchio* was drawn, Disney's model shop sculpted him so animators could turn him in their hands, study him from every angle, and see how light fell on his face; the object came before the drawing. The three objects here each introduced a cultural moment and redefined how people live with technology.
- Sections: the puppet (Disney, 1940: animation as a serious art; the maquette as a tool of craft), the instant camera (Polaroid: the photograph you could hold a minute later; Land's insistence on the whole experience), the iPhone (2007: the computer that fit a life). Each section ends with one line on why it matters to Wilson. Keep each under 90 words.
- Coda: the quote "Life needs to be more than just solving problems every day. You need to wake up and be excited about the future." attributed to Elon Musk; then Wilson's goal, in his words: "My goal is to make products that are so insanely good that one day, walking down a random street, I'll see someone using one. If you know anyone I should talk to, or have anything cool, send them my way." Then: "This is a reminder of the pursuit of excellence."

### 4.9 Turntable and the Austen trick — `src/objects/vinyl.ts`, `src/panels/vinyl.ts`
A compact turntable: plinth, platter, a black record with a cream label, tonearm. Focus: panel hosts the Spotify playlist embed via the Spotify **iFrame API** (`https://open.spotify.com/embed/iframe-api/v1`; `IFrameAPI.createController(el, { uri: 'spotify:playlist:2UsGkMoSFLxP51roLefR0v' }, cb)`; listen to `playback_update` for `isPaused`; `controller.pause()`). The record spins and the tonearm swings onto it while playing; `state.music.isPlaying` reflects the embed. The embed is loaded lazily on first focus of the turntable (not at page load). Verify the API surface against Spotify's docs before relying on it; if the iFrame API cannot report state, fall back to a visible "playing" toggle the visitor sets and the pause trick still issues `pause()`.
**The Austen trick**: if music is playing and the visitor focuses *Pride and Prejudice*, the engine pauses the music and, 600 ms later, shows the message bubble (section 3) with the button "why did my music stop?". Wilson's answer (verbatim): "When you're overwhelmed by sadness, should you reach for melancholy music? The common answer is yes, that it's catharsis. But there's a quieter problem underneath. If music becomes a tool for producing feeling rather than a way of honoring a feeling you already have, is the emotion still yours, or did the music manufacture it? And even if indulging our sensibility feels harmless, what does it cost us? These are the questions Austen was asking, long before anyone had a playlist for heartbreak. If you want the right answer (in my opinion), read Persuasion." Music does not auto-resume.

### 4.10 The jar — `src/objects/jar.ts`, `src/panels/jar.ts`, `src/content/principles.ts`
A glass jar (refractive-looking glass via transmission or a cheap trick: transparent material with a fresnel rim), a few folded and crumpled paper slips inside, a simple lid with a slot. Focus: the panel is **a slip of paper**, slightly crumpled (CSS: paper texture, two soft crease shadows, a torn edge), that unfolds (scale/rotate from a crumpled thumbnail over 500 ms). Fields: name, email, note, each rendered in Caveat (handwriting) as the visitor types; placeholder text in faint pencil grey. Submit: `POST /api/note`; on success the slip folds and drops into the jar (a small 3D slip is added to the jar) and a line appears: "In the jar. Replies come the way they do in the Namiya General Store: eventually, and only when there's something worth saying." Above the fields, a short note in Wilson's voice: this jar is inspired by 解忧杂货店 (The Miracles of the Namiya General Store), where people slip their worries through the shop's shutter at night and find answers in the milk crate by morning; he is not an old man with wisdom, but if you have something thoughtful to say, write it down.
A quiet link "how I work, and how to reach me" expands the **principles** section inside the same panel: Wilson's own principles, written fresh (not copied from Sigil Wen's post, which is the reference for tone and intent): he takes focus seriously; best work happens in long uninterrupted stretches; he says no to most meetings; write instead of booking time; reach out only with something thoughtful; integrity above everything; think for yourself; be unapologetic about how you work best. Eight to ten short lines, first person, no preaching.

### 4.11 Lamp, table, room — `src/objects/lamp.ts` (engine phase)
A simple articulated desk lamp at the back-right, its head aimed at the table centre; the key light originates there. Not clickable. The table (4.0) and the dust motes live here too.

## 5. Backend — `worker/`

- `POST /api/note` `{ name, email, note, token? }` → validates (name ≤ 80, email RFC-ish, note ≤ 2000), Turnstile `siteverify` when `TURNSTILE_SECRET` is set (skipped in local dev), inserts into `notes`, returns `{ ok: true }`. Rate limit: 5 per IP per hour (count rows by hashed IP). Optional: if `RESEND_API_KEY` and `OWNER_EMAIL` are set, email the note to the owner. The owner's address is never in client code.
- `POST /api/anchor` `{ group: 'A'|'B', guess: number }` → inserts, returns `{ stats }`. `GET /api/anchor/stats` → `{ A: { mean, n }, B: { mean, n } }`.
- `schema.sql`: `notes(id, name, email, note, ip_hash, created_at)`, `anchors(id, grp, guess, created_at)`.
- `wrangler.toml` with a D1 binding; `npm run worker` runs `wrangler dev --local`; Vite dev proxies `/api` to `http://localhost:8787`. Secrets via `.dev.vars` (gitignored). Deployment is the owner's step later (`wrangler login`).

## 6. Performance and devices

- Budgets: ≤ 120 draw calls at rest; textures ≤ 1024² (covers 512 × 768); geometry merged per object; total JS ≤ 400 KB brotli (three ~150 KB, gsap ~25 KB, hls.js lazy); first paint under 2 s on a mid phone over 4G.
- DPR: min(devicePixelRatio, 2) desktop, 1.5 phone; drop to 1.0 if mean frame time over 60 frames exceeds 26 ms, and reduce shadow map to 1024, dust to 60.
- Render continuously at 60 fps while the tab is visible (dust and idle life), pause when hidden. Resize is debounced; the camera's rest pose adapts to aspect so the table always fits.
- Portrait phone: camera pulls up and back so the table fits the width; hit proxies guarantee ≥ 44 px tap targets for every object (verify by projecting bounds); panels are bottom sheets.
- Test matrix: Chrome desktop 1440 × 900, Safari (if available), and emulated iPhone 13 (390 × 844) and Pixel 7 (412 × 915) in Playwright.

## 7. Quality bar and QA (`docs/QA.md`)

A build is done only when all of these pass on the test matrix:
1. Zero console errors or warnings in a full scripted visit (load, hover each object, focus each object, exit, flip the ID, open the jar, run the anchoring flow against the local worker, switch films, open the Spotify panel, trigger the Austen bubble with a stubbed `isPlaying = true`).
2. Every transition is smooth: no frame over 50 ms during camera moves on desktop in Playwright's trace; no visual pop (object scale/position jumps) on hover enter/leave or focus enter/exit.
3. Screenshots at each focused state look designed: panel readable, object framed with margin, nothing clipped by the panel on landscape or the sheet on portrait.
4. Hover label never overlaps the object it names; labels never leave the viewport.
5. Keyboard: Tab reaches every object, Enter focuses, Esc exits; focus returns to the originating button.
6. Reduced motion honoured.
7. Lighthouse (desktop) performance ≥ 90 on the built site served statically, accessibility ≥ 95.
8. No lorem ipsum, no placeholder copy; anything Wilson must edit is in [brackets].

## 8. Things that are decided so nobody re-decides them

Fixed camera; no character; no walking; no voice; no sound effects; no page navigation; no React; no post-processing passes; no external 3D model files (everything procedural); no real book-cover scans; the puppet is our design; music only through the Spotify embed; the owner's email never in the client; Wilson's words kept as written except light copy-editing; anything invented is bracketed.
