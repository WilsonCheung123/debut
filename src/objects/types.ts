import type * as THREE from 'three';
import type { PanelSpec } from '../panels/types';
import type { State } from '../state';
import type { Materials } from '../materials';
import type { Api } from '../api';

/** Resolved camera pose for a focused object (world units). */
export interface FocusCamera {
  position: THREE.Vector3;
  target: THREE.Vector3;
  /** Optional; clamped by the engine to within 4 degrees below the rest fov. */
  fov?: number;
}

/**
 * The focus-layer transform of an object, owned by the engine and composed
 * every frame on top of the layout pose and the hover lift. Objects tween
 * these numbers (gsap) in onEnter/onExit instead of touching `group`.
 * lift in metres, angles in radians, x/z in metres (table plane).
 */
export interface Motion {
  lift: number;
  yaw: number;
  pitch: number;
  roll: number;
  x: number;
  z: number;
}

export interface ObjectCtx {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  state: State;
  materials: Materials;
  api: Api;
  /** Phone budgets: fewer motes, smaller textures. */
  isPhone: boolean;
  maxAnisotropy: number;
  /** The focus pose for an id, from layout.ts (resolved at focus time). */
  focusPose(id: string): FocusCamera;
  /** The engine-owned focus-layer transform for an object id (tweenable). */
  motion(id: string): Motion;
  /** Exits focus (used by in-focus behaviour that wants to close). */
  exit(): void;
  /** Re-runs the camera tween to the object's current focus pose (e.g. after a flip). */
  reframe(id: string, duration?: number): void;
  /** Opens the focused object's panel now (for objects with `focus.deferPanel`, e.g. the ID after its flip). No-op unless `id` is focused. */
  openPanel(id: string): void;
}

export interface TableObject {
  /** e.g. 'book.anna-karenina', 'id-card' */
  id: string;
  /** Hover label text. */
  label: string;
  /** The object's root. Placed by layout.ts; the engine owns its transform. */
  group: THREE.Group;
  /** Raycast targets (may include invisible proxies made with hitProxy()). Empty = scenery. */
  hit: THREE.Object3D[];
  /** Local point (in group space) where the hover label sits: the object's top. */
  anchor: THREE.Vector3;
  hover?: {
    /** Lift in metres (default 0.012). */
    lift?: number;
    /** Max tilt in degrees (default 3). */
    tilt?: number;
    /** 'cursor' tilts toward the pointer; 'forward' tilts the top toward the camera (standing books). */
    tiltMode?: 'cursor' | 'forward';
    /** Feel of the lift spring: duration in s (default 0.35) and overshoot (back.out amount, default 1.7). Heavy things: longer, less overshoot. */
    spring?: { duration?: number; overshoot?: number };
  };
  focus: {
    camera: FocusCamera;
    panel: PanelSpec | null;
    onEnter?(ctx: ObjectCtx): void;
    onExit?(ctx: ObjectCtx): void;
    /** Clicks on this object's hit meshes while it is focused. hitName = mesh.name. */
    onClickInside?(hitName: string, ctx: ObjectCtx): void;
    /** When true the engine does not open the panel at +450 ms; the object opens it later with ctx.openPanel(id). */
    deferPanel?: boolean;
  };
  /** Idle animation. dt seconds (clamped), t seconds since start. */
  update?(dt: number, t: number): void;
  dispose?(): void;
}

/** A cluster: one placed root with several independently hoverable objects inside (the books). */
export interface ObjectCluster {
  root: THREE.Group;
  objects: TableObject[];
}

export type CreateResult = TableObject | ObjectCluster;

export function isCluster(r: CreateResult): r is ObjectCluster {
  return (r as ObjectCluster).root !== undefined && Array.isArray((r as ObjectCluster).objects);
}
