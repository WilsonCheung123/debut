import * as THREE from 'three';
import gsap from 'gsap';

// The light of one room at night (SPEC 2), built from:
//   key     the lamp: a SpotLight at the bulb with a wide, soft-edged cone and
//           real distance falloff, so the pool is bright at the centre and the
//           far corners of the table are dim but readable
//   sun     a shadow-casting DirectionalLight aligned with the lamp (an
//           orthographic shadow keeps texel density even across the table);
//           low intensity, it mostly exists for the shadows
//   spill   a tiny PointLight at the bulb: what leaks out of a shade in every
//           direction and lights the lamp's own arm and grazes the wall behind
//   fill    the window: a cool SpotLight far to the left with distance falloff,
//           so the left edge of the table is about twice as cool-lit as the right
//   hemi    a very low sky/ground hemisphere instead of a flat ambient: upward
//           faces away from the pool go faintly cool, undersides stay dark
//   keeper  a wide, soft spot that keeps the focused object lit while the
//           key dims to 70% (SPEC 3); far enough away to light it evenly

const FINAL_KEY = new THREE.Color(0xffc48e);   // ~2900 K after ACES: warm, not orange
const AMBER = new THREE.Color(0xff8a2a);       // warm-up start, like a filament coming on
const FILL = new THREE.Color(0xb8cdf5);        // ~6500 K

// keeper: ~1.2 m from the object; 4.5 / 1.2^0.5 restores roughly the 30% the
// key gives up (8.6 / 0.7^1.5 at the pool centre), inside an 11° cone so the
// pool it leaves on the table around the object stays small and soft
const BASE = { key: 8.6, sun: 0.6, spill: 0.75, fill: 6.2, hemi: 0.32, ambient: 0.12, keeper: 4.5 };

export class Lights {
  readonly key = new THREE.SpotLight(FINAL_KEY.clone(), 0, 0, 1.06, 0.62, 1.5);
  readonly sun = new THREE.DirectionalLight(FINAL_KEY.clone(), 0);
  readonly spill = new THREE.PointLight(FINAL_KEY.clone(), 0, 2.6, 2);
  readonly fill = new THREE.SpotLight(FILL, 0, 0, 0.78, 1, 1.25);
  readonly hemi = new THREE.HemisphereLight(0x4a5468, 0x2a1d13, 0);
  readonly ambient = new THREE.AmbientLight(0x6b5c4a, 0);
  readonly keeper = new THREE.SpotLight(0xfff0dc, 0, 0, 0.2, 0.7, 0.5);
  /** 0 at rest, 1 when focused (key to 70%, keeper on). Tweened by focus.ts. */
  dim = 0;
  /** 0 to 1 during the lamp warm-up. */
  warm = 0;
  /** Called at the end of every apply() with (warm, dim): the lamp's emissive parts follow the key. */
  onApply: ((warm: number, dim: number) => void) | null = null;
  private readonly keyTarget = new THREE.Object3D();
  private readonly keeperTarget = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private shadowSize = 2048;

  constructor(scene: THREE.Scene, shadowSize: number) {
    this.shadowSize = shadowSize;
    const { key, sun, spill, fill, hemi, ambient, keeper } = this;
    key.name = 'key';
    key.castShadow = false;
    key.target = this.keyTarget;
    scene.add(key, this.keyTarget);

    sun.name = 'sun';
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    const cam = sun.shadow.camera;
    cam.left = -0.85; cam.right = 0.85; cam.top = 0.75; cam.bottom = -0.75;
    cam.near = 0.1; cam.far = 3.2;
    sun.target = this.keyTarget;
    scene.add(sun);
    this.applyShadowFilter();

    spill.name = 'spill';
    scene.add(spill);

    fill.name = 'fill';
    fill.position.set(-2.2, 1.35, 0.75);
    fill.target.position.set(-0.25, 0, 0.05);
    scene.add(fill, fill.target);

    scene.add(hemi, ambient);

    keeper.name = 'keeper';
    keeper.castShadow = false;
    keeper.target = this.keeperTarget;
    scene.add(keeper, this.keeperTarget);
    this.apply();
  }

  /** Aims the key light from the lamp's bulb toward the table. */
  attachToLamp(head: THREE.Vector3, target: THREE.Vector3): void {
    this.key.position.copy(head);
    this.spill.position.copy(head).add(new THREE.Vector3(0, 0.012, 0));
    this.keyTarget.position.copy(target);
    const dir = head.clone().sub(target).normalize();
    this.sun.position.copy(target).addScaledVector(dir, 1.6);
    this.sun.shadow.camera.updateProjectionMatrix();
    this.keyTarget.updateMatrixWorld();
  }

  /**
   * Points the keeper at the focused object: from well above and behind the
   * focus camera, biased toward the lamp's side so its highlights agree with
   * the key, and far enough (0.9 m) that a 10 cm object is lit evenly rather
   * than with a visible pool.
   */
  aimKeeper(objectCentre: THREE.Vector3, cameraPos: THREE.Vector3): void {
    const dir = cameraPos.clone().sub(objectCentre).normalize();
    this.keeper.position.copy(objectCentre).addScaledVector(dir, 0.9).add(new THREE.Vector3(0.3, 0.55, 0));
    this.keeperTarget.position.copy(objectCentre);
    this.keeperTarget.updateMatrixWorld();
  }

  setShadowSize(size: number): void {
    if (size === this.shadowSize) return;
    this.shadowSize = size;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.applyShadowFilter();
  }

  /**
   * Fits the shadow camera to a world box (the objects' bounds plus the table
   * top) seen from the sun: the eight corners in the light's view give the
   * ortho extents and the depth range, with a small margin. A tight frustum
   * is what makes a 4096 map worth having: every texel lands on the table.
   */
  fitShadow(box: THREE.Box3): void {
    const sun = this.sun;
    const cam = sun.shadow.camera;
    sun.updateMatrixWorld(true);
    this.keyTarget.updateMatrixWorld(true);
    // Matrix4.lookAt builds the light's rotation (looking down -z); with its position it is the light's world matrix, whose inverse is the view
    const inv = new THREE.Matrix4().lookAt(sun.position, this.keyTarget.position, new THREE.Vector3(0, 1, 0)).setPosition(sun.position).invert();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const p = new THREE.Vector3();
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      p.set(x, y, z).applyMatrix4(inv);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const pad = 0.03; // a shadow may fall a little outside the casters' box
    cam.left = minX - pad; cam.right = maxX + pad;
    cam.bottom = minY - pad; cam.top = maxY + pad;
    cam.near = Math.max(0.02, -maxZ - pad);
    cam.far = -minZ + pad;
    cam.updateProjectionMatrix();
    this.applyShadowFilter();
  }

  /**
   * Bias and blur in world terms, so a map resize keeps the same look. Texel
   * size follows from the fitted frustum; the normal bias is one texel plus a
   * hair (enough against acne on the table at the lamp's ~30° grazing angle,
   * small enough that a 1 mm card or pick still casts a shadow touching it:
   * the old 10 mm normal bias lifted every thin thing off its shadow). The
   * blur radius is ~3 mm: a soft penumbra from a shade, not a point source.
   */
  private applyShadowFilter(): void {
    const cam = this.sun.shadow.camera;
    const extent = Math.max(cam.right - cam.left, cam.top - cam.bottom);
    const texel = extent / this.shadowSize;
    this.sun.shadow.normalBias = texel * 1.6 + 0.0005;
    this.sun.shadow.bias = -(texel * 0.5) / (cam.far - cam.near); // depth units: half a texel of world depth
    this.sun.shadow.radius = Math.max(2, 0.003 / texel);
  }

  get shadowMapSize(): number { return this.shadowSize; }

  /** Writes intensities from `warm` and `dim`. Called every frame (cheap). */
  apply(): void {
    const w = this.warm;
    const d = this.dim;
    const keyScale = 1 - 0.3 * d;
    this.key.intensity = BASE.key * w * keyScale;
    this.sun.intensity = BASE.sun * w * keyScale;
    this.spill.intensity = BASE.spill * w * keyScale;
    this.fill.intensity = BASE.fill * w * (1 - 0.35 * d);
    this.hemi.intensity = BASE.hemi * w * (1 - 0.4 * d);
    this.ambient.intensity = BASE.ambient * w * (1 - 0.4 * d);
    this.keeper.intensity = BASE.keeper * d * w;
    // colour temperature: amber at 0 to the final warm white at 1
    this.tmp.copy(AMBER).lerp(FINAL_KEY, Math.min(1, w * 1.15));
    this.key.color.copy(this.tmp);
    this.sun.color.copy(this.tmp);
    this.spill.color.copy(this.tmp);
    this.onApply?.(w, d);
  }

  /** The 1.2 s lamp warm-up on first frame. */
  warmUp(duration = 1.2): Promise<void> {
    return new Promise((resolve) => {
      gsap.to(this, { warm: 1, duration, ease: 'sine.inOut', onComplete: resolve });
    });
  }
}
