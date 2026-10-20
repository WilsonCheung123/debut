import * as THREE from 'three';
import type { TableObject } from '../objects/types';
import { HIT_LAYER } from './picking';
import { makeCanvasTexture } from '../materials';

/**
 * Contact shadows: the darkening right where a thing meets the table, which
 * the directional shadow map (one light, blurred) cannot give. One instanced
 * draw call of soft elliptical blobs, each sized from the object's real
 * bounds at registration (so real objects get the right footprint without
 * any work from their builders), following the object's position and yaw
 * every frame and fading as it lifts: the hover lift reads as lifting.
 * Objects that sit on something else (upper books of a stack) get none.
 */
export interface ContactShadows {
  add(obj: TableObject): void;
  update(): void;
}

interface Blob { obj: TableObject; cx: number; cz: number; sx: number; sz: number; strength: number }

const BASE_Y = 0.0009;
const MAX = 48;

export function createContactShadows(scene: THREE.Scene): ContactShadows {
  const tex = makeCanvasTexture({
    width: 128, height: 128, colorSpace: THREE.NoColorSpace,
    draw(c, W, H) {
      const g = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.32, 'rgba(255,255,255,0.66)');
      g.addColorStop(0.62, 'rgba(255,255,255,0.22)');
      g.addColorStop(0.85, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    },
  });
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;

  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const strength = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1);
  geo.setAttribute('aStrength', strength);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex } },
    vertexShader: `
      attribute float aStrength;
      varying vec2 vUv; varying float vS;
      void main() {
        vUv = uv; vS = aStrength;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec2 vUv; varying float vS;
      void main() {
        float a = texture2D(uMap, vUv).a * vS;
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
    transparent: true, depthWrite: false, depthTest: true,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, MAX);
  mesh.name = 'contact-shadows';
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  scene.add(mesh);

  const blobs: Blob[] = [];
  const inv = new THREE.Matrix4(), m = new THREE.Matrix4(), box = new THREE.Box3(), tmp = new THREE.Box3();
  const size = new THREE.Vector3(), centre = new THREE.Vector3(), pos = new THREE.Vector3();
  const q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), xAxis = new THREE.Vector3();

  return {
    add(obj) {
      if (blobs.length >= MAX) return;
      obj.group.updateWorldMatrix(true, true);
      inv.copy(obj.group.matrixWorld).invert();
      box.makeEmpty();
      obj.group.traverse((n) => {
        const mm = n as THREE.Mesh;
        if (!mm.isMesh || !mm.geometry || !mm.visible) return;
        if (mm.layers.isEnabled(HIT_LAYER) && !mm.layers.isEnabled(0)) return;
        if (!mm.geometry.boundingBox) mm.geometry.computeBoundingBox();
        m.multiplyMatrices(inv, mm.matrixWorld);
        tmp.copy(mm.geometry.boundingBox!).applyMatrix4(m);
        box.union(tmp);
      });
      if (box.isEmpty()) return;
      obj.group.getWorldPosition(pos);
      if (pos.y + box.min.y > 0.012) return; // sits on something else, not on the wood
      box.getSize(size);
      box.getCenter(centre);
      // tall or stubby things press harder; thin cards barely at all
      const h = size.y;
      const st = THREE.MathUtils.clamp(0.22 + h * 2.2, 0.16, 0.5);
      blobs.push({ obj, cx: centre.x, cz: centre.z, sx: size.x * 1.18 + 0.02, sz: size.z * 1.18 + 0.02, strength: st });
      mesh.count = blobs.length;
    },
    update() {
      for (let i = 0; i < blobs.length; i++) {
        const b = blobs[i];
        const g = b.obj.group;
        pos.setFromMatrixPosition(g.matrixWorld);
        q.setFromRotationMatrix(g.matrixWorld);
        xAxis.set(1, 0, 0).applyQuaternion(q);
        const yaw = Math.atan2(-xAxis.z, xAxis.x);
        const lift = Math.max(0, pos.y);
        const k = THREE.MathUtils.clamp(1 - lift / 0.04, 0.12, 1);
        const grow = 1 + lift * 5;
        e.set(0, yaw, 0);
        q.setFromEuler(e);
        const cx = b.cx * Math.cos(yaw) + b.cz * Math.sin(yaw);
        const cz = -b.cx * Math.sin(yaw) + b.cz * Math.cos(yaw);
        pos.set(pos.x + cx, BASE_Y, pos.z + cz);
        s.set(b.sx * grow, 1, b.sz * grow);
        m.compose(pos, q, s);
        mesh.setMatrixAt(i, m);
        strength.array[i] = b.strength * k;
      }
      mesh.instanceMatrix.needsUpdate = true;
      strength.needsUpdate = true;
    },
  };
}
