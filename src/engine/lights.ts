import * as THREE from 'three';
import gsap from 'gsap';

// One warm key (the lamp: a SpotLight for the pool of light plus a
// shadow-casting DirectionalLight aligned with it), one cool fill from the
// left, a very low ambient, and a small "keeper" spot that keeps the focused
// object lit while the key dims to 70%.

const FINAL_KEY = new THREE.Color(0xffb878);   // ~2700 K after ACES: warm, not orange
const AMBER = new THREE.Color(0xff8a2a);       // warm-up start, like a filament coming on
const FILL = new THREE.Color(0xc9dcff);        // ~6500 K

const BASE = { key: 8, sun: 1.3, fill: 0.34, ambient: 0.5, keeper: 1.4 };

export class Lights {
  readonly key = new THREE.SpotLight(FINAL_KEY.clone(), 0, 0, 0.9, 0.5, 1.3);
  readonly sun = new THREE.DirectionalLight(FINAL_KEY.clone(), 0);
  readonly fill = new THREE.DirectionalLight(FILL, 0);
  readonly ambient = new THREE.AmbientLight(0x6b5c4a, 0);
  readonly keeper = new THREE.SpotLight(0xfff0d8, 0, 0, 0.42, 0.9, 1.1);
  /** 0 at rest, 1 when focused (key to 70%, keeper on). Tweened by focus.ts. */
  dim = 0;
  /** 0 to 1 during the lamp warm-up. */
  warm = 0;
  private readonly keyTarget = new THREE.Object3D();
  private readonly keeperTarget = new THREE.Object3D();
  private readonly tmp = new THREE.Color();
  private shadowSize = 2048;

  constructor(scene: THREE.Scene, isPhone: boolean) {
    this.shadowSize = isPhone ? 1024 : 2048;
    const { key, sun, fill, ambient, keeper } = this;
    key.castShadow = false;
    key.target = this.keyTarget;
    scene.add(key, this.keyTarget);

    sun.castShadow = true;
    sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.012;
    sun.shadow.radius = 5;
    const cam = sun.shadow.camera;
    cam.left = -1.05; cam.right = 1.05; cam.top = 0.9; cam.bottom = -0.9;
    cam.near = 0.1; cam.far = 3.2;
    sun.target = this.keyTarget;
    scene.add(sun);

    fill.position.set(-2.2, 1.1, 0.9);
    scene.add(fill, fill.target);
    scene.add(ambient);

    keeper.castShadow = false;
    keeper.target = this.keeperTarget;
    scene.add(keeper, this.keeperTarget);
    this.apply();
  }

  /** Aims the key light from the lamp head toward the table. */
  attachToLamp(head: THREE.Vector3, target: THREE.Vector3): void {
    this.key.position.copy(head);
    this.keyTarget.position.copy(target);
    const dir = head.clone().sub(target).normalize();
    this.sun.position.copy(target).addScaledVector(dir, 1.6);
    this.sun.shadow.camera.updateProjectionMatrix();
    this.keyTarget.updateMatrixWorld();
  }

  /** Points the keeper at the focused object from near the focus camera. */
  aimKeeper(objectCentre: THREE.Vector3, cameraPos: THREE.Vector3): void {
    this.keeper.position.copy(cameraPos).add(new THREE.Vector3(0, 0.22, 0));
    this.keeperTarget.position.copy(objectCentre);
    this.keeperTarget.updateMatrixWorld();
  }

  setShadowSize(size: number): void {
    if (size === this.shadowSize) return;
    this.shadowSize = size;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }

  /** Writes intensities from `warm` and `dim`. Called every frame (cheap). */
  apply(): void {
    const w = this.warm;
    const d = this.dim;
    const keyScale = 1 - 0.3 * d;
    this.key.intensity = BASE.key * w * keyScale;
    this.sun.intensity = BASE.sun * w * keyScale;
    this.fill.intensity = BASE.fill * w;
    this.ambient.intensity = BASE.ambient * w;
    this.keeper.intensity = BASE.keeper * d * w;
    // colour temperature: amber at 0 to the final warm white at 1
    this.tmp.copy(AMBER).lerp(FINAL_KEY, Math.min(1, w * 1.15));
    this.key.color.copy(this.tmp);
    this.sun.color.copy(this.tmp);
  }

  /** The 1.2 s lamp warm-up on first frame. */
  warmUp(duration = 1.2): Promise<void> {
    return new Promise((resolve) => {
      gsap.to(this, { warm: 1, duration, ease: 'sine.inOut', onComplete: resolve });
    });
  }
}
