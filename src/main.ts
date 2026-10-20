import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import '@fontsource/newsreader/500.css';
import '@fontsource/caveat/400.css';
import '@fontsource/caveat/500.css';
import './styles.css';

import * as THREE from 'three';
import gsap from 'gsap';
import { state, refreshMedia, flags } from './state';
import { api } from './api';
import { materials } from './materials';
import { createScene, surfaceHeightAt, addProbe } from './engine/scene';
import { Lights } from './engine/lights';
import { createContactShadows } from './engine/contact';
import { CameraRig } from './engine/camera';
import { Picker } from './engine/picking';
import { Hover } from './engine/hover';
import { Focus } from './engine/focus';
import { createLoop } from './engine/loop';
import { Quality } from './engine/quality';
import { watchResize } from './engine/resize';
import { Overlay } from './ui/overlay';
import { Label } from './ui/label';
import { Panel } from './ui/panel';
import { Bubble } from './ui/bubble';
import { A11yList } from './ui/a11y';
import { registry } from './objects/index';
import { isCluster, type TableObject, type ObjectCtx, type FocusCamera } from './objects/types';
import { rest as restPoses, camera as camLayout } from './layout';
import { music } from './music';
import type { LampObject } from './objects/lamp';

async function boot(): Promise<void> {
  performance.mark('table:boot');
  if (flags.qa) gsap.ticker.lagSmoothing(0);
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;

  const { renderer, scene, maxAnisotropy } = createScene(canvas);
  const lights = new Lights(scene, state.isPhone);
  const rig = new CameraRig();
  const overlay = new Overlay(ui);
  const label = new Label(ui);
  const panel = new Panel(ui);
  const bubble = new Bubble(ui);
  const a11y = new A11yList(ui);
  const picker = new Picker(rig.camera, canvas);
  const hover = new Hover();

  // The context objects are built with. focus/exit/reframe bind once Focus exists.
  let focusCtl: Focus | null = null;
  const focusCams = new Map<string, FocusCamera>();
  const ctx: ObjectCtx = {
    scene, renderer, camera: rig.camera, state, materials, api, isPhone: state.isPhone, maxAnisotropy,
    focusPose(id) {
      let c = focusCams.get(id);
      if (!c) { c = { position: new THREE.Vector3(), target: new THREE.Vector3() }; focusCams.set(id, c); }
      return c;
    },
    motion(id) { return hover.motion(id); },
    exit() { void focusCtl?.exit(); },
    reframe(id, duration) { focusCtl?.reframe(id, duration); },
    openPanel(id, spec, onClose) { focusCtl?.openPanel(id, spec, onClose); },
    closePanel() { return focusCtl ? focusCtl.closePanel() : Promise.resolve(); },
  };

  // Objects: create, place roots from layout, register.
  const objects: TableObject[] = [];
  let lamp: LampObject | null = null;
  for (const entry of registry) {
    const r = entry.create(ctx);
    const pose = restPoses[entry.key];
    const root = isCluster(r) ? r.root : r.group;
    if (pose) {
      // seated on whatever is under it (the mat's top where the mat is)
      root.position.set(pose.position[0], pose.position[1] + surfaceHeightAt(pose.position[0], pose.position[2]), pose.position[2]);
      root.rotation.y = THREE.MathUtils.degToRad(pose.rotationY ?? 0);
      if (pose.scale) root.scale.setScalar(pose.scale);
    } else {
      console.warn(`layout.rest has no pose for ${entry.key}`);
    }
    scene.add(root);
    for (const o of isCluster(r) ? r.objects : [r]) objects.push(o);
    if (entry.key === 'lamp') lamp = r as LampObject;
  }
  scene.updateMatrixWorld(true);
  performance.mark('table:objects');
  for (const o of objects) hover.register(o);
  const interactive = objects.filter((o) => o.hit.length > 0);
  picker.register(interactive);
  // The rest camera frames the things on the desk (and the lamp's head), not the table's edges:
  // each object's own padded corners, so a tall thing at the back does not push the front edge down.
  {
    const pts: THREE.Vector3[] = [];
    const b = new THREE.Box3();
    const pad = camLayout.rest.fitPad;
    const corners = (box: THREE.Box3): void => {
      for (const x of [box.min.x, box.max.x]) for (const z of [box.min.z, box.max.z]) for (const y of [box.min.y, box.max.y]) pts.push(new THREE.Vector3(x, y, z));
    };
    for (const o of interactive) {
      picker.worldBounds(o, b);
      b.min.x -= pad; b.min.z -= pad; b.max.x += pad; b.max.z += pad; b.max.y += 0.02;
      corners(b);
    }
    if (lamp) corners(b.setFromCenterAndSize(lamp.headWorld(), new THREE.Vector3(0.16, 0.16, 0.16)));
    rig.setMustSee(pts);
  }
  if (lamp) {
    lights.attachToLamp(lamp.headWorld(), lamp.aimWorld());
    const l = lamp;
    lights.onApply = (w, d) => l.setGlow(w, d);
  }
  // contact shadows under everything that sits on the wood (sized from real bounds)
  const contact = createContactShadows(scene);
  for (const o of interactive) if (o.contactShadow !== false) contact.add(o);

  focusCtl = new Focus({ rig, lights, hover, picker, overlay, label, panel, bubble, a11y, objects: interactive, ctx });
  const focus = focusCtl;

  // Keyboard path: focusing a hidden button shows the hover state; Enter focuses.
  a11y.build(interactive, {
    onFocusIn(obj) { if (!state.focused) { hover.set(obj); label.show(obj.label); } },
    onFocusOut(obj) { if (hover.current === obj && !state.focused) { hover.set(null); label.hide(); } },
    onActivate(obj, btn) { void focus.focus(obj.id, { origin: btn }); },
  });

  // Pointer: parallax source and click routing (a drag is not a click).
  let downX = 0, downY = 0;
  canvas.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; });
  canvas.addEventListener('click', (e) => {
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) return;
    focus.routeClick(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    rig.pointer.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1));
  }, { passive: true });
  canvas.addEventListener('pointerleave', () => rig.pointer.set(0, 0));

  // The hover label follows the object's anchor (it lifts, the camera parallaxes).
  const anchorWorld = new THREE.Vector3();
  const anchorScreen = (obj: TableObject): { x: number; y: number } => {
    obj.group.localToWorld(anchorWorld.copy(obj.anchor)).project(rig.camera);
    return { x: (anchorWorld.x + 1) / 2 * innerWidth, y: (1 - anchorWorld.y) / 2 * innerHeight };
  };
  // x from the anchor, y from the top of the object's projected silhouette, so
  // the label never sits on the object (a box's back edge projects above its top centre).
  const placeLabel = (): void => {
    const o = hover.current;
    if (!o || !label.visible) return;
    const p = anchorScreen(o);
    const r = picker.visibleRect(o);
    label.place(p.x, r ? Math.min(p.y, r.y) : p.y);
  };

  const setHover = (obj: TableObject | null): void => {
    if (obj === hover.current) return;
    hover.set(obj);
    if (obj) label.show(obj.label); else label.hide();
    canvas.style.cursor = obj ? 'pointer' : '';
  };

  // Quality tier: one-way drop on sustained slow frames.
  const quality = new Quality(() => {
    state.quality = 'low';
    renderer.setPixelRatio(1);
    lights.setShadowSize(1024);
    lamp?.setDustCount(60);
  }, flags.lockTier);

  const applySize = (): void => {
    refreshMedia();
    const w = innerWidth, h = innerHeight;
    const dpr = state.quality === 'low' ? 1 : Math.min(devicePixelRatio || 1, state.isPhone ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    rig.fitRest(w, h);
    panel.setSheet(state.portrait);
    rig.parallaxEnabled = !state.isTouch && !state.reducedMotion;
    if (state.focused) focus.onResize();
    else if (rig.mode === 'rest') rig.applyImmediate(rig.rest);
  };
  watchResize(applySize);

  let lastMode = rig.mode;
  // frame-time record of the last camera move (for the no-frame-over-50-ms check on a real GPU)
  const moveStats = { max: 0, frames: 0, last: { max: 0, frames: 0 } };
  let frame = 0;
  const loop = createLoop((dt, t, frameMs) => {
    frame++;
    quality.sample(frameMs);
    if (rig.mode === 'moving') { moveStats.max = Math.max(moveStats.max, frameMs); moveStats.frames++; }
    if (rig.mode !== lastMode) {
      if (lastMode === 'moving') { moveStats.last = { max: moveStats.max, frames: moveStats.frames }; moveStats.max = 0; moveStats.frames = 0; }
      lastMode = rig.mode;
      picker.pointer.dirty = true;
    }
    // one raycast per frame at most, only when the pointer moved (or the scene settled).
    // A keyboard-initiated hover (a focused list button) keeps it until the pointer really moves.
    if (picker.pointer.dirty) {
      const byPointer = picker.pointer.moved;
      picker.pointer.dirty = false;
      picker.pointer.moved = false;
      const keyboardOwns = !byPointer && a11y.el.contains(document.activeElement);
      if (!state.focused && !state.isTouch && rig.mode === 'rest' && !keyboardOwns) {
        const pick = picker.pointer.inside ? hover.atRest(() => picker.raycast(picker.pointer.x, picker.pointer.y)) : null;
        setHover(pick?.obj ?? null);
      }
    }
    hover.updateTilt(picker, dt);
    hover.apply();
    for (const o of objects) o.update?.(dt, t);
    rig.update(dt);
    contact.update();
    lights.apply();
    overlay.apply();
    placeLabel();
    renderer.render(scene, rig.camera);
  });
  loop.onResume(() => quality.reset());

  // First frame: everything compiled and the shadow map drawn while the lights
  // are still at zero, so the first frame of light is the finished table.
  rig.applyImmediate(rig.rest);
  lights.warm = 0;
  lights.apply();
  await renderer.compileAsync(scene, rig.camera);
  performance.mark('table:compiled');
  renderer.render(scene, rig.camera);
  performance.mark('table:first-render');
  loop.start();
  overlay.depth = 1.6;
  overlay.tweenDepth(0, 1.2, 'sine.inOut');
  await lights.warmUp(1.2);
  state.ready = true;
  performance.mark('table:ready');
  focus.mark('ready');
  const deep = focus.deepLink();
  if (deep) void focus.focus(deep, { viaHash: true });

  // Test hooks for tools/shot.mjs and QA. Small, read-only except hover/focus/exit.
  const byId = new Map(interactive.map((o) => [o.id, o]));
  (window as unknown as { __table: unknown }).__table = {
    ids: interactive.map((o) => o.id),
    state,
    timeline: focus.timeline,
    get ready() { return state.ready; },
    rect(id: string, minPx = 0) { const o = byId.get(id); return o ? picker.rectOf(o, minPx) : null; },
    visibleRect(id: string) { const o = byId.get(id); return o ? picker.visibleRect(o) : null; },
    /** World-space bounds of an object (min/max arrays), for layout tuning. */
    bounds(id: string) { const o = byId.get(id); if (!o) return null; const b = picker.worldBounds(o, new THREE.Box3()); return { min: b.min.toArray(), max: b.max.toArray() }; },
    anchor(id: string) { const o = byId.get(id); return o ? anchorScreen(o) : null; },
    pickAt(x: number, y: number) { return hover.atRest(() => picker.pickAt(x, y, state.isTouch ? 44 : 0))?.obj.id ?? null; },
    hover(id: string | null) { setHover(id ? byId.get(id) ?? null : null); },
    focus(id: string) { return focus.focus(id); },
    exit() { return focus.exit(); },
    liftOf(id: string) { return hover.liftOf(id); },
    /** Music test hooks: __table.music.setPlaying(true) arms the Austen trick without YouTube. */
    music: music.hooks,
    /** Environment tuning handles for scripted comparisons (several variants per run). */
    env: { lights, renderer, scene, overlay, probe: () => addProbe(scene) },
    info() {
      return {
        drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        dpr: renderer.getPixelRatio(), tier: state.quality, mode: rig.mode, busy: focus.busy, frame,
        lastMove: moveStats.last,
        camera: { position: rig.camera.position.toArray(), target: rig.pose.target.toArray(), fov: rig.camera.fov, offX: rig.pose.offX, offY: rig.pose.offY },
        rest: { position: rig.rest.position.toArray(), target: rig.rest.target.toArray(), fov: rig.rest.fov },
      };
    },
  };
}

boot().catch((err) => console.error(err));
