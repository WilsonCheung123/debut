import * as THREE from 'three';
import type { ObjectCtx, TableObject } from './types';
import { roundedBox, hitProxy, solid, mergeParts, contactBlob } from './helpers';
import { rest as restPoses } from '../layout';
import { makeCanvasTexture, hash2, metal, plastic } from '../materials';
import { guitar as content } from '../content/guitar';

// The capo and pick (SPEC 4.6). A trigger-style spring capo: a padded bar,
// a curved rubber-lined jaw, two handles, a hinge pin with a visible coil
// spring; black with a slight sheen. It lies the way one does when dropped
// on a table: bar and lower handle down, the other handle rising. Beside it
// a 351-shape celluloid pick, tortoiseshell on canvas, slightly translucent.

const ID = 'guitar';
const TAU = Math.PI * 2;

export function createGuitar(ctx: ObjectCtx): TableObject {
  const group = new THREE.Group();
  group.name = ID;

  const black = plastic({ color: 0x232322, roughness: 0.42 });
  const rubber = plastic({ color: 0x2a2724, roughness: 0.9 });
  const steel = metal({ color: 0x8e8e8b, roughness: 0.42 });

  // --- the capo, built in its own frame: x = hinge axis, +z toward the jaws, +y toward the bar
  const capo = new THREE.Group();
  capo.name = 'capo';
  const blacks: THREE.BufferGeometry[] = [];
  const rubbers: THREE.BufferGeometry[] = [];
  const steels: THREE.BufferGeometry[] = [];

  // the bar that presses the strings, and its rubber pad underneath
  const bar = roundedBox(0.062, 0.0105, 0.0115, 0.0032, 3);
  bar.translate(0, 0.0165, 0.029);
  blacks.push(bar);
  const pad = roundedBox(0.057, 0.0036, 0.0092, 0.0012, 2);
  pad.translate(0, 0.0165 - 0.00525 - 0.0015, 0.029);
  rubbers.push(pad);

  // the curved jaw that cradles the neck (an annular sector extruded along x), rubber-lined
  const jaw = sector(0.0138, 0.0098, Math.PI * 1.12, Math.PI * 1.88, 0.058);
  jaw.translate(0, -0.0045, 0.029);
  blacks.push(jaw);
  const lining = sector(0.0099, 0.0082, Math.PI * 1.2, Math.PI * 1.8, 0.054);
  lining.translate(0, -0.0045, 0.029);
  rubbers.push(lining);

  // arms from the hinge to the bar and to the jaw
  const upperArm = roundedBox(0.021, 0.0095, 0.03, 0.003, 2);
  upperArm.rotateX(-0.42);
  upperArm.translate(0, 0.0105, 0.0135);
  blacks.push(upperArm);
  const lowerArm = roundedBox(0.021, 0.0095, 0.03, 0.003, 2);
  lowerArm.rotateX(0.28);
  lowerArm.translate(0, -0.0065, 0.0135);
  blacks.push(lowerArm);

  // the two handles: back from the hinge, opening away from each other
  const upperHandle = roundedBox(0.0245, 0.0075, 0.047, 0.0032, 3);
  upperHandle.rotateX(0.52);
  upperHandle.translate(0, 0.0155, -0.0205);
  blacks.push(upperHandle);
  const lowerHandle = roundedBox(0.0245, 0.0075, 0.047, 0.0032, 3);
  lowerHandle.rotateX(-0.52);
  lowerHandle.translate(0, -0.0155, -0.0205);
  blacks.push(lowerHandle);
  // grip ridges on the handles' outer faces: the handle is 47 mm long (local z ±23.5 mm), so the
  // four ridges run from -5 to -20.6 mm and stay on it (a 6.2 mm pitch put the last one 3.6 mm past
  // the tip, floating in the air above the capo)
  for (let i = 0; i < 4; i++) {
    const r1 = new THREE.BoxGeometry(0.02, 0.0012, 0.0016);
    r1.translate(0, 0.0039, -0.005 - i * 0.0052);
    r1.rotateX(0.52);
    r1.translate(0, 0.0155, -0.0205);
    blacks.push(r1);
    const r2 = new THREE.BoxGeometry(0.02, 0.0012, 0.0016);
    r2.translate(0, -0.0039, -0.005 - i * 0.0052);
    r2.rotateX(-0.52);
    r2.translate(0, -0.0155, -0.0205);
    blacks.push(r2);
  }

  // the hinge: a plastic knuckle, a steel pin through it, the coil spring around the pin
  const knuckle = new THREE.CylinderGeometry(0.0052, 0.0052, 0.0255, 24);
  knuckle.rotateZ(Math.PI / 2);
  blacks.push(knuckle);
  const pin = new THREE.CylinderGeometry(0.0024, 0.0024, 0.0295, 16);
  pin.rotateZ(Math.PI / 2);
  steels.push(pin);
  const spring = new THREE.TubeGeometry(new SpringCurve(0.0066, 0.0205, 6.5), 220, 0.00072, 7);
  steels.push(spring);

  const blackMesh = solid(new THREE.Mesh(mergeParts(blacks), black), 'capo-body');
  const rubberMesh = solid(new THREE.Mesh(mergeParts(rubbers), rubber), 'capo-rubber');
  const steelMesh = solid(new THREE.Mesh(mergeParts(steels), steel), 'capo-spring');
  capo.add(blackMesh, rubberMesh, steelMesh);

  // lie it down: tipped about the hinge axis until the bar and the lower handle's tip both touch the table
  capo.rotation.x = 0.47;
  capo.rotation.y = 0.2;
  capo.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(capo);
  capo.position.y -= box.min.y;
  capo.position.x -= (box.min.x + box.max.x) / 2;
  capo.position.z -= (box.min.z + box.max.z) / 2;
  group.add(capo);

  // --- the pick, flat on the table beside the capo
  const pickTex = tortoiseshell();
  const pickMat = new THREE.MeshPhysicalMaterial({
    map: pickTex, roughness: 0.3, metalness: 0, clearcoat: 0.9, clearcoatRoughness: 0.18,
    transparent: true, opacity: 0.94,
  });
  const pickGeo = pickGeometry();
  const pick = solid(new THREE.Mesh(pickGeo, pickMat), 'pick');
  pick.position.set(0.064, 0, 0.012);
  pick.rotation.y = 0.75;
  group.add(pick);
  const restYaw = THREE.MathUtils.degToRad(restPoses[ID]?.rotationY ?? 0);
  const blob = contactBlob(0.03, 0.031, restYaw, { x: 0.064, z: 0.012, yaw: 0.75, strength: 0.4 });
  group.add(blob.mesh);

  const proxy = hitProxy(0.15, 0.035, 0.1, `${ID}:proxy`);
  proxy.position.set(0.018, 0.0175, 0.0);
  group.add(proxy);

  return {
    id: ID,
    label: 'Capo and pick',
    group,
    hit: [capo, pick, proxy],
    anchor: new THREE.Vector3(0, box.max.y - box.min.y + 0.004, 0),
    hover: { lift: 0.012, tilt: 3 },
    focus: { camera: ctx.focusPose(ID), panel: content },
    update() { blob.update(group); },
    dispose() {
      blob.dispose();
      for (const g of [blackMesh.geometry, rubberMesh.geometry, steelMesh.geometry, pickGeo]) g.dispose();
      pickTex.dispose();
      pickMat.dispose();
    },
  };
}

/** A coil about the x axis: `turns` turns of radius r over length len, with a short straight leg at each end. */
class SpringCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private readonly r: number, private readonly len: number, private readonly turns: number) { super(); }
  override getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const leg = 0.07;
    if (t < leg) {
      const s = t / leg;
      return out.set(-this.len / 2, -this.r - 0.006 * (1 - s), -0.004 * (1 - s) + this.r * 0.0);
    }
    if (t > 1 - leg) {
      const s = (t - (1 - leg)) / leg;
      return out.set(this.len / 2, this.r + 0.006 * s, -0.004 * s);
    }
    const u = (t - leg) / (1 - 2 * leg);
    const a = u * this.turns * TAU - Math.PI / 2;
    return out.set(-this.len / 2 + u * this.len, Math.sin(a) * this.r, Math.cos(a) * this.r);
  }
}

/** An annular sector (angles in the y–z plane, measured from +z toward +y) extruded along x. */
function sector(rOut: number, rIn: number, a0: number, a1: number, length: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOut, a0, a1);
  s.absarc(0, 0, rIn, a1, a0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 2, curveSegments: 18, steps: 1 });
  // shape (x, y) → (z, y); extrusion z → x; centred on x = 0
  g.rotateY(Math.PI / 2);
  g.translate(-length / 2, 0, 0);
  return g;
}

/** A standard 351 pick, 30 × 31 mm, 0.7 mm, lying flat; both faces carry the shell texture. */
function pickGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -0.0155);
  s.bezierCurveTo(0.0085, -0.0128, 0.0148, -0.003, 0.0148, 0.0055);
  s.bezierCurveTo(0.0148, 0.0118, 0.0092, 0.0157, 0, 0.0157);
  s.bezierCurveTo(-0.0092, 0.0157, -0.0148, 0.0118, -0.0148, 0.0055);
  s.bezierCurveTo(-0.0148, -0.003, -0.0085, -0.0128, 0, -0.0155);
  const bevel = 0.00012;
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.0007 - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 16, steps: 1 });
  const pos = g.attributes.position as THREE.BufferAttribute;
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + 0.016) / 0.032, (pos.getY(i) + 0.016) / 0.032);
  uv.needsUpdate = true;
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  g.computeBoundingBox();
  return g;
}

/** Tortoiseshell celluloid: amber ground, soft dark blotches, a few honey patches. */
function tortoiseshell(): THREE.CanvasTexture {
  return makeCanvasTexture({
    width: 256, height: 256, anisotropy: 8,
    draw(c, w, h) {
      c.fillStyle = '#b8742c';
      c.fillRect(0, 0, w, h);
      const blob = (x: number, y: number, rx: number, ry: number, rot: number, color: string, a: number): void => {
        c.save();
        c.translate(x, y); c.rotate(rot); c.scale(rx, ry);
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
        g.addColorStop(0, color.replace('A', String(a)));
        g.addColorStop(0.55, color.replace('A', String(a * 0.85)));
        g.addColorStop(1, color.replace('A', '0'));
        c.fillStyle = g;
        c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill();
        c.restore();
      };
      for (let i = 0; i < 26; i++) {
        blob(hash2(i, 1, 21) * w, hash2(i, 2, 21) * h, 14 + hash2(i, 3, 21) * 40, 10 + hash2(i, 4, 21) * 26, hash2(i, 5, 21) * Math.PI, 'rgba(58,28,12,A)', 0.55 + hash2(i, 6, 21) * 0.35);
      }
      for (let i = 0; i < 10; i++) {
        blob(hash2(i, 7, 22) * w, hash2(i, 8, 22) * h, 10 + hash2(i, 9, 22) * 26, 8 + hash2(i, 10, 22) * 18, hash2(i, 11, 22) * Math.PI, 'rgba(232,170,78,A)', 0.4 + hash2(i, 12, 22) * 0.3);
      }
      for (let i = 0; i < 14; i++) {
        blob(hash2(i, 13, 23) * w, hash2(i, 14, 23) * h, 4 + hash2(i, 15, 23) * 10, 3 + hash2(i, 16, 23) * 8, hash2(i, 17, 23) * Math.PI, 'rgba(40,18,8,A)', 0.6);
      }
    },
  });
}
