import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { wood, matte, leather, standard, setMaxAnisotropy } from '../materials';

export interface SceneBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  table: THREE.Group;
  maxAnisotropy: number;
}

export const TABLE = { w: 1.6, d: 0.9, thickness: 0.03, height: 0.74 } as const;

/**
 * The desk mat: leather, under the writing area at the front-left (the ID
 * card and the capo would sit on it). Off by default: side by side it splits
 * the table into two surfaces and darkens the quadrant where the window fill
 * should read, and it forces anything on it to be seated 3.5 mm up. Kept
 * behind `?mat=1` for comparison.
 */
export const MAT = { w: 0.58, d: 0.36, x: -0.29, z: 0.24, thickness: 0.0035, radius: 0.014, on: false } as const;

const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const flag = (name: string, dflt: boolean): boolean => {
  const v = params?.get(name);
  return v === null || v === undefined ? dflt : v !== '0';
};

/**
 * Height of the surface an object stands on at (x, z): the mat's top where
 * the mat is, else the wood. The engine seats each object's rest pose on it,
 * so a 1 mm card on the mat is not buried by a 3.5 mm mat.
 */
export function surfaceHeightAt(x: number, z: number): number {
  if (!flag('mat', MAT.on)) return 0;
  const inside = Math.abs(x - MAT.x) <= MAT.w / 2 - 0.01 && Math.abs(z - MAT.z) <= MAT.d / 2 - 0.01;
  return inside ? MAT.thickness : 0;
}

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
  renderer.setClearColor(0x0a0908, 1);
  const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
  setMaxAnisotropy(maxAnisotropy);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0908);

  // Room: near-black floor and walls. The back wall is close enough behind
  // the lamp that its spill grazes it (a faint warm gradient at the top of
  // the frame instead of a void); the window fill comes from the left.
  const room = new THREE.Group();
  room.name = 'room';
  const floorMat = matte(0x121009, 0.96);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -TABLE.height;
  floor.receiveShadow = true;
  room.add(floor);
  const wallMat = matte(0x252019, 0.97);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.5), wallMat);
  back.position.set(0, 1.4, -1.15);
  back.receiveShadow = true;
  room.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(8, 4.5), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-2.4, 1.4, 0);
  room.add(left);
  scene.add(room);

  // Table: dark walnut, 3 cm top with rounded edges, apron, four legs mostly out of frame.
  const table = new THREE.Group();
  table.name = 'table';
  const topMat = wood({ seed: 3, repeat: [2, 1], finish: true });
  const top = new THREE.Mesh(new RoundedBoxGeometry(TABLE.w, TABLE.thickness, TABLE.d, 3, 0.006), topMat);
  top.position.y = -TABLE.thickness / 2;
  top.receiveShadow = true;
  top.castShadow = true;
  top.name = 'table-top';
  table.add(top);
  const apronMat = wood({ tone: 0x8f7a68, seed: 3 }); // same figure as the top (one 1024 draw, not two); darker tone
  const apron = new THREE.Mesh(new RoundedBoxGeometry(TABLE.w - 0.12, 0.07, TABLE.d - 0.12, 2, 0.004), apronMat);
  apron.position.y = -TABLE.thickness - 0.035;
  apron.receiveShadow = true;
  table.add(apron);
  const legGeo = new THREE.CylinderGeometry(0.024, 0.02, TABLE.height - TABLE.thickness - 0.07, 14);
  const legMat = matte(0x241a12, 0.8);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(sx * (TABLE.w / 2 - 0.08), -(TABLE.height + TABLE.thickness + 0.07) / 2 - 0.0, sz * (TABLE.d / 2 - 0.08));
    leg.castShadow = true;
    leg.receiveShadow = true;
    table.add(leg);
  }
  if (flag('mat', MAT.on)) table.add(createMat());
  scene.add(table);

  if (flag('probe', false)) addProbe(scene);

  return { renderer, scene, table, maxAnisotropy };
}

/** The leather mat: a rounded-rectangle slab with a bevelled edge and a stitched top. */
function createMat(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'desk-mat';
  const { w, d, thickness: h, radius: r } = MAT;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2);
  shape.absarc(w / 2 - r, -d / 2 + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w / 2, d / 2 - r);
  shape.absarc(w / 2 - r, d / 2 - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w / 2 + r, d / 2);
  shape.absarc(-w / 2 + r, d / 2 - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w / 2, -d / 2 + r);
  shape.absarc(-w / 2 + r, -d / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  const bevel = 0.0009;
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: h - bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 }),
    leather({ repeat: [8, 8] }),
  );
  body.rotation.x = -Math.PI / 2; // extrude along +y
  body.position.y = bevel;
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = 'desk-mat-body';
  g.add(body);
  // the top: the pebble grain plus a stitch line around the edge, drawn once (not tiled)
  const stitchInset = 0.011;
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 640;
  const cx = c.getContext('2d', { willReadFrequently: true })!; // CPU raster (see makeCanvasTexture)
  cx.clearRect(0, 0, c.width, c.height);
  // stitches: short cream dashes with a tiny shadow, following the rounded rectangle
  const px = c.width / w;
  const inset = stitchInset * px;
  const rr = (r - stitchInset) * px;
  const path = new Path2D();
  path.roundRect(inset, inset, c.width - inset * 2, c.height - inset * 2, rr);
  cx.save();
  cx.lineWidth = 2.6;
  cx.setLineDash([9, 7]);
  cx.strokeStyle = 'rgba(0,0,0,0.5)';
  cx.lineDashOffset = 0;
  cx.translate(0.8, 1.1);
  cx.stroke(path);
  cx.restore();
  cx.save();
  cx.lineWidth = 2.2;
  cx.setLineDash([9, 7]);
  cx.strokeStyle = 'rgba(214,190,150,0.85)';
  cx.stroke(path);
  cx.restore();
  // the groove the stitches sit in
  cx.save();
  cx.lineWidth = 1;
  cx.strokeStyle = 'rgba(0,0,0,0.35)';
  cx.translate(0, 2.6);
  cx.stroke(path);
  cx.restore();
  const topTex = new THREE.CanvasTexture(c);
  topTex.colorSpace = THREE.SRGBColorSpace;
  topTex.anisotropy = 8;
  const stitches = new THREE.Mesh(new THREE.PlaneGeometry(w, d), standard({ map: topTex, transparent: true, roughness: 0.75, metalness: 0, depthWrite: false }));
  stitches.rotation.x = -Math.PI / 2;
  stitches.position.y = h + 0.00025;
  stitches.receiveShadow = true;
  stitches.castShadow = false;
  stitches.name = 'desk-mat-stitches';
  g.add(stitches);
  g.position.set(MAT.x, 0, MAT.z);
  return g;
}

/**
 * Exposure probe (`?probe=1`, dev only): the ID card image and a sheet of
 * cream paper standing in the pool, to judge skin and paper under the key.
 */
export function addProbe(scene: THREE.Scene): void {
  const loader = new THREE.TextureLoader();
  loader.load('/id-card.webp', (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.0856 * 2.6, 0.054 * 2.6), standard({ map: tex, roughness: 0.55, metalness: 0 }));
    card.position.set(-0.02, 0.001, 0.02);
    card.rotation.x = -Math.PI / 2;
    card.rotation.z = 0.15;
    card.castShadow = true;
    card.receiveShadow = true;
    card.name = 'probe-card';
    scene.add(card);
    const standing = card.clone();
    standing.rotation.set(-0.35, 0, 0);
    standing.position.set(0.02, 0.09, -0.16);
    scene.add(standing);
  });
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.297), standard({ color: 0xf2ead8, roughness: 0.92, metalness: 0 }));
  paper.position.set(-0.32, 0.0008, 0.02);
  paper.rotation.x = -Math.PI / 2;
  paper.rotation.z = -0.08;
  paper.receiveShadow = true;
  paper.name = 'probe-paper';
  scene.add(paper);
}
