# Adding an object to the table

How an object builder turns a placeholder in `src/objects/<id>.ts` into the
real thing without touching anything else. Read SPEC.md first; this is the
mechanics. The engine owns: the camera, lights, hover lift, focus
choreography, the panel chrome, hash routing, keyboard, and the transform of
your `group`. You own: geometry, materials, hit shapes, the panel's words and
behaviour, idle animation.

## 1. Files you may edit

| file | what |
|---|---|
| `src/objects/<id>.ts` | geometry, materials, hit proxies, anchor, `focus`, `update` |
| `src/content/<id>.ts` | the words (plain TS objects / HTML strings) |
| `src/panels/<id>.ts` | a custom panel factory, only when plain content is not enough |
| `src/layout.ts` | **only your own entry** in `rest` and `focus` (and `bookSlots` for books) |

Do not edit `src/objects/index.ts`, the engine, the UI or other objects' files.
Books: `createBooks` returns an `ObjectCluster` (`{ root, objects }`): one root
placed by `layout.rest.books`, nine `TableObject`s inside it with the ids from
`layout.bookSlots`.

## 2. The contract

```ts
export function createJar(ctx: ObjectCtx): TableObject
```

`TableObject` (full type in `src/objects/types.ts`):

- `id`, `label` — id as in SPEC 4 (`'jar'`, `'book.inferno'`); label is the hover text.
- `group` — your root `THREE.Group`. **Origin at the bottom centre, sitting on
  y = 0.** The engine places it from `layout.rest[key]` and composes its
  transform every frame (layout pose + hover lift + the `Motion` layer). Never
  set `group.position/rotation` yourself; animate children, or tween
  `ctx.motion(id)` (see §6).
- `hit` — raycast targets: your visible meshes and/or invisible proxies from
  `hitProxy()`. Empty `hit` means scenery (the lamp).
- `anchor` — a local point at the top of the object; the hover label sits above
  its projected silhouette.
- `hover?` — `{ lift, tilt, tiltMode }`: lift in metres (default 0.012), tilt in
  degrees (default 3), `tiltMode: 'cursor' | 'forward'` (standing books use
  `'forward'` with `tilt: 8`).
- `focus.camera` — always `ctx.focusPose(id)`. The engine fills it at focus time
  from `layout.focus[id]` (a frame relative to your object's real world bounds)
  so you can change geometry freely.
- `focus.panel` — `{ kicker, title, html }` or a factory (§5), or `null`.
- `focus.onEnter / onExit(ctx)` — start/stop video, tween `ctx.motion(id)`, etc.
- `focus.onClickInside(hitName, ctx)` — clicks on your `hit` meshes while
  focused (the ID flip, the puppet's three items). `hitName` is `mesh.name`.
- `focus.deferPanel` — set it when the panel must wait for an in-focus action
  (the ID: the bio appears only after the flip lands). The engine then skips
  the +450 ms open; call `ctx.openPanel(id)` when ready (no-op unless `id` is
  focused; opens once). Scenarios focus such an object with
  `{"action":"focus","id":"id-card","panel":false}`.
- `update(dt, t)` — idle life (LED breathing, record spinning). dt is clamped to 50 ms.

`ObjectCtx` gives you `scene`, `renderer`, `camera`, `state`, `materials`,
`api`, `isPhone`, `maxAnisotropy`, `focusPose(id)`, `motion(id)`, `exit()`,
`reframe(id, duration?)` (re-run the camera to your current bounds, e.g. after a flip),
`openPanel(id)` (for `focus.deferPanel` objects).

## 3. Geometry and materials

- Metres. A credit card is 0.0856 × 0.054; a paperback 0.13 × 0.20 × 0.03.
- Every box has rounded edges: `roundedBox(w, h, d, radius)` from
  `src/objects/helpers.ts` (RoundedBoxGeometry). Mark solid meshes with
  `solid(mesh, name)` so they cast and receive shadows. `mergeParts(geometries)`
  merges same-material parts (boxes, cylinders, extrusions mixed) into one
  geometry for one draw call.
- Materials come from `src/materials`: `wood({ tone, seed })`, `paper({ color })`,
  `metal({ color, roughness })`, `glass({ opacity })`, `plastic({ color, emissive })`,
  `matte(color)`. They are cached and shared; clone before mutating
  (`material.clone()`). Keep roughness 0.55–0.9 (metal 0.3–0.7), metalness 0
  except metal, nothing darker than `#141210` or lighter than `#f2ead8`.
  If you build a material by hand, use `standard(params)` from `src/materials`
  rather than `new MeshStandardMaterial`: it is the same thing with `dithering`
  on, which keeps the dark falloff around your object free of banding.
  `leather()` (pebbled, with bump) and `wood({ finish: true })` (roughness map
  + fine pore bump for close-ups) are there too.
- Textures: `makeCanvasTexture({ width, height, draw(ctx, w, h) })` returns an
  sRGB, mipmapped, anisotropic `CanvasTexture`. Covers 512 × 768, nothing above
  1024². `grain(ctx, w, h, alpha)` adds paper grain; `hash2(x, y, seed)` is a
  stable noise. Chinese text: `ctx.font = '600 120px "PingFang SC", "Songti SC", "Noto Serif CJK SC", serif'`.
- Budget: merge static geometry per object where you can (≤ 120 draw calls at
  rest for the whole table); one material per visual surface, not per part.

## 4. Hit proxies, anchor, sizes

Thin or small things need an invisible proxy so hover and taps feel generous:

```ts
const proxy = hitProxy(0.11, 0.02, 0.08, 'id-card:proxy'); // w, h, d, name
proxy.position.y = 0.01;
group.add(proxy);
hit.push(cardMesh, proxy);
```

Proxies live on the hit layer (never rendered, never in bounds). On touch the
engine also guarantees a 44 px target by expanding each object's projected
rect, so you do not need huge proxies; you do need the *visible* object to be
≥ 60 px wide at 1440 × 900 (`npm run shots -- ... --scenario tests/scenarios/quick.json`
runs the audit and prints the numbers).

In a cluster (the books), thin members cannot have exclusive 44 px targets on
a phone, and the lower books of a stack are hidden under the top one: a tap
resolves to whatever is physically there. See docs/QA.md "touch targets in
clusters" for what is expected of the books builder.

## 5. Panels

Plain content: build it in `src/content/<id>.ts` with the helpers in
`src/content/types.ts` (`p`, `quote`, `figure`, `link`, `bookPanel`), and set
`focus.panel = { kicker, title, html }`. Anything Wilson must edit stays in
`[brackets]` (rendered as a quiet highlight). No lorem ipsum.

Custom behaviour (kahneman flow, jar form, hologram film list, vinyl player,
pinocchio sections): export a `PanelFactory` from `src/panels/<id>.ts`:

```ts
export function jarPanel(): PanelFactory {
  return {
    kicker: 'the jar',
    title: 'Leave a slip',
    mount(ctx: PanelCtx) {           // ctx.body is empty; build your DOM into it
      const form = document.createElement('form'); /* … */
      ctx.body.append(form);
      // ctx.api.post('/api/note', {...}); ctx.scrollTo(el); ctx.close(); ctx.isSheet
      return () => { /* cleanup on close: pause video, abort fetches */ };
    },
  };
}
```

`src/panels/jar.ts` is a compact worked example. Styles: the panel already
sets Newsreader 17/1.55, headings, small-caps `.kicker`, `blockquote`, links,
inputs and 44 px buttons; add object-specific CSS in your panel file by
injecting a `<style>` once (scoped by a class on your root element). The body
scrolls; on portrait it is a bottom sheet (`ctx.isSheet`), max 70% of the height.

Music: `src/music.ts` sets `state.music.isPlaying` and `state.music.pause`
from the YouTube IFrame Player API (playlist in `src/content/music.ts`); the engine performs the Austen trick itself
(SPEC 4.9) and owns the bubble.

## 6. Animating your object

Idle: move children in `update(dt, t)`. Focus: tween the engine's motion layer,
which is composed on top of the layout pose and hover lift every frame:

```ts
onEnter(ctx) { gsap.to(ctx.motion('book.inferno'), { lift: 0.08, pitch: -0.9, duration: 0.9, ease: 'power3.inOut' }); }
onExit(ctx)  { gsap.to(ctx.motion('book.inferno'), { lift: 0, pitch: 0, duration: 0.8, ease: 'power3.inOut' }); }
```

`Motion` = `{ lift, yaw, pitch, roll, x, z }` (metres / radians, world-aligned
rotations about the group origin). Use `ctx.reframe(id)` after a motion that
changes the bounds a lot (the ID flip) so the camera re-centres.

Respect `state.reducedMotion` (cut instead of tween) and `state.isTouch` (no
hover-only affordances). Dispose textures/geometries you create in `dispose()`.

## 7. Focus pose

Edit only your entry in `layout.focus`: `{ dist, az, el, fov?, targetOffset?, portraitDist? }`
relative to your object's bounds centre (az 0 = from the front, positive =
from the left; el = elevation above the table). The engine frames the object
left of the panel on landscape and in the top band above the sheet on portrait
by shifting the view, so aim at the object itself. `fov` is clamped to within
4° below the rest fov.

## 8. Testing

Dev server: `npm run dev` (port 5180). Worker: `npm run worker` (8780).

```
npm run shots -- http://localhost:5180/ shots/jar --viewport desktop --hover jar
npm run shots -- http://localhost:5180/ shots/jar --viewport desktop --focus jar
npm run shots -- http://localhost:5180/ shots/jar --viewport iphone  --focus jar
npm run shots -- http://localhost:5180/ shots/jar --viewport desktop --scenario tests/scenarios/quick.json
```

Each run writes PNGs and `<name>-problems.txt` (console errors/warnings, page
errors, failed requests, audits). Write your own scenario (format in
docs/QA.md) to drive your panel: taps on `#panel .content button`, `fill`,
`assert`, `shot`. Headless frames are slow (software GL): the tool waits on
engine marks, not timers. For real timing or frame-time checks, open the dev
server in Chrome and read `__table.info().lastMove` (max frame ms of the last
camera move) and `__table.timeline`.

Before you hand over: `npm run build` clean, `npm run qa` green, screenshots
of hover + focus on desktop and iPhone in `shots/`, and your `[brackets]` listed.
