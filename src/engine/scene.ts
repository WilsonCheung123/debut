import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { wood, matte, setMaxAnisotropy } from '../materials';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  table: THREE.Group;
  maxAnisotropy: number;
}

export const TABLE = { w: 1.6, d: 0.9, thickness: 0.03, height: 0.74 } as const;

/** Renderer + the room + the table. Table top is the plane y = 0. */
export function createScene(canvas: HTMLCanvasElement): SceneBundle {
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoftShadowMap was removed in r186; PCF + shadow.radius is the soft variant now
  renderer.setClearColor(0x0b0a09, 1);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  setMaxAnisotropy(maxAnisotropy);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0a09);

  // Room: near-black floor and walls. The cool fill light hints at a window to the left.
  const room = new THREE.Group();
  room.name = 'room';
  const floorMat = matte(0x141210, 0.95);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -TABLE.height;
  floor.receiveShadow = true;
  room.add(floor);
  const wallMat = matte(0x16140f, 0.95);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(10, 4), wallMat);
  back.position.set(0, 1.2, -1.7);
  room.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-2.2, 1.2, 0);
  room.add(left);
  scene.add(room);

  // Table: dark walnut, 3 cm top with rounded edges, apron, four legs mostly out of frame.
  const table = new THREE.Group();
  table.name = 'table';
  const top = new THREE.Mesh(new RoundedBoxGeometry(TABLE.w, TABLE.thickness, TABLE.d, 3, 0.006), wood());
  top.position.y = -TABLE.thickness / 2;
  top.receiveShadow = true;
  top.castShadow = true;
  top.name = 'table-top';
  table.add(top);
  const apronMat = wood({ tone: 0xb9a48c, seed: 5 });
  const apron = new THREE.Mesh(new RoundedBoxGeometry(TABLE.w - 0.12, 0.07, TABLE.d - 0.12, 2, 0.004), apronMat);
  apron.position.y = -TABLE.thickness - 0.035;
  apron.receiveShadow = true;
  table.add(apron);
  const legGeo = new THREE.CylinderGeometry(0.024, 0.02, TABLE.height - TABLE.thickness - 0.07, 14);
  const legMat = matte(0x2b1f16, 0.8);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(sx * (TABLE.w / 2 - 0.08), -(TABLE.height + TABLE.thickness + 0.07) / 2 - 0.0, sz * (TABLE.d / 2 - 0.08));
    leg.castShadow = true;
    leg.receiveShadow = true;
    table.add(leg);
  }
  scene.add(table);

  return { renderer, scene, table, maxAnisotropy };
}
