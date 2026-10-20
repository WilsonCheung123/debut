import * as THREE from 'three';
import type { TableObject } from '../objects/types';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pick { obj: TableObject; hit: THREE.Object3D | null; via: 'ray' | 'rect' }

/** Layer for invisible hit proxies: raycast but never rendered. */
export const HIT_LAYER = 1;

const PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

/**
 * Picking: a single raycast per frame at most (pointermove only sets the
 * pointer and a dirty flag), against the flat list of hit meshes. Clicks and
 * taps also get a screen-space fallback: each object's projected bounds,
 * expanded to at least `minPx`, so thin or small things stay tappable.
 */
export class Picker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly hitMap = new Map<THREE.Object3D, TableObject>();
  private hits: THREE.Object3D[] = [];
  private objects: TableObject[] = [];
  /** Latest pointer position in CSS px; `dirty` asks for a resolve, `moved` says a real pointer event caused it. */
  readonly pointer = { x: -1, y: -1, inside: false, dirty: false, moved: false };
  private readonly corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  private readonly box = new THREE.Box3();
  private readonly v = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly canvas: HTMLCanvasElement) {
    this.raycaster.layers.set(0);
    this.raycaster.layers.enable(HIT_LAYER);
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointer.x = e.clientX; this.pointer.y = e.clientY;
      this.pointer.inside = true; this.pointer.dirty = true; this.pointer.moved = true;
    }, { passive: true });
    canvas.addEventListener('pointerleave', () => { this.pointer.inside = false; this.pointer.dirty = true; this.pointer.moved = true; });
  }

  register(objects: TableObject[]): void {
    this.objects = objects.filter((o) => o.hit.length > 0);
    this.hitMap.clear();
    this.hits = [];
    for (const o of this.objects) {
      for (const h of o.hit) {
        this.hitMap.set(h, o);
        this.hits.push(h);
        h.traverse((c) => this.hitMap.set(c, o));
      }
    }
  }

  get interactive(): TableObject[] { return this.objects; }

  private setRay(clientX: number, clientY: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  /**
   * Exact raycast against all hit meshes. Callers resolve hover and clicks
   * inside Hover.atRest() so the result never depends on the lift the hover
   * itself caused (otherwise a tilted book uncovers its neighbour, which steals
   * the hover, settles, covers the point again, and the two oscillate).
   */
  raycast(clientX: number, clientY: number): Pick | null {
    this.setRay(clientX, clientY);
    const hits = this.raycaster.intersectObjects(this.hits, true);
    for (const h of hits) {
      const obj = this.hitMap.get(h.object);
      if (obj) return { obj, hit: h.object, via: 'ray' };
    }
    return null;
  }

  /** Raycast against one object's hit meshes only (in-focus click routing). */
  raycastObject(obj: TableObject, clientX: number, clientY: number): THREE.Object3D | null {
    this.setRay(clientX, clientY);
    const hits = this.raycaster.intersectObjects(obj.hit, true);
    return hits.length ? hits[0].object : null;
  }

  /** Raycast first; otherwise the nearest object whose expanded projected rect contains the point. */
  pickAt(clientX: number, clientY: number, minPx: number): Pick | null {
    const ray = this.raycast(clientX, clientY);
    if (ray) return ray;
    let best: TableObject | null = null;
    let bestD = Infinity;
    for (const o of this.objects) {
      const r = this.rectOf(o, minPx);
      if (!r) continue;
      if (clientX < r.x || clientX > r.x + r.w || clientY < r.y || clientY > r.y + r.h) continue;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      const d = Math.hypot(clientX - cx, clientY - cy);
      if (d < bestD) { bestD = d; best = o; }
    }
    return best ? { obj: best, hit: null, via: 'rect' } : null;
  }

  /** The pointer ray's intersection with the table plane (y = 0), or null. */
  pointerOnTable(clientX: number, clientY: number, out: THREE.Vector3): THREE.Vector3 | null {
    this.setRay(clientX, clientY);
    return this.raycaster.ray.intersectPlane(PLANE, out);
  }

  /**
   * Projected screen rect (CSS px) of an object's hit meshes, expanded so that
   * neither side is smaller than `minPx` (0 = raw). Null if behind the camera.
   */
  rectOf(obj: TableObject, minPx = 0): Rect | null {
    const r = this.canvas.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let any = false;
    for (const h of obj.hit) {
      h.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry) return;
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const bb = mesh.geometry.boundingBox!;
        mesh.updateWorldMatrix(true, false);
        let i = 0;
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
          const c = this.corners[i++].set(x, y, z).applyMatrix4(mesh.matrixWorld).project(this.camera);
          if (c.z > 1) continue;
          const sx = r.left + (c.x + 1) / 2 * r.width;
          const sy = r.top + (1 - c.y) / 2 * r.height;
          if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
          if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
          any = true;
        }
      });
    }
    if (!any) return null;
    let w = maxX - minX, h = maxY - minY;
    let x = minX, y = minY;
    if (w < minPx) { x -= (minPx - w) / 2; w = minPx; }
    if (h < minPx) { y -= (minPx - h) / 2; h = minPx; }
    return { x, y, w, h };
  }

  /** Projected screen rect (CSS px) of an object's visible meshes (proxies excluded). */
  visibleRect(obj: TableObject): Rect | null {
    const b = this.worldBounds(obj, this.box2);
    const r = this.canvas.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
    let i = 0;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      const c = this.corners[i++].set(x, y, z).project(this.camera);
      if (c.z > 1) continue;
      const sx = r.left + (c.x + 1) / 2 * r.width, sy = r.top + (1 - c.y) / 2 * r.height;
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx; if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
      any = true;
    }
    return any ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
  }

  private readonly box2 = new THREE.Box3();

  /** World bounds of an object's visible meshes (proxies on the hit layer excluded). */
  worldBounds(obj: TableObject, out = new THREE.Box3()): THREE.Box3 {
    out.makeEmpty();
    obj.group.updateWorldMatrix(true, true);
    obj.group.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry || !mesh.visible) return;
      if (mesh.layers.isEnabled(HIT_LAYER) && !mesh.layers.isEnabled(0)) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      this.box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
      out.union(this.box);
    });
    if (out.isEmpty()) out.setFromCenterAndSize(obj.group.getWorldPosition(this.v), new THREE.Vector3(0.05, 0.05, 0.05));
    return out;
  }
}
