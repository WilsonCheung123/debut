import * as THREE from 'three';
import type { ObjectCtx, ObjectCluster, TableObject } from './types';
import { placeholder } from './placeholder';
import { roundedBox, solid } from './helpers';
import { metal } from '../materials';
import { bookSlots } from '../layout';
import { austenPanel } from '../panels/austen';

// PLACEHOLDER. The books builder replaces this file: nine procedurally
// covered books, five standing between two bookends and four in a stack.
// Keep: one cluster root placed by layout.rest.books; one TableObject per
// book with ids from layout.bookSlots; standing books tilt forward on hover.

const standingSize: Record<string, [number, number, number]> = {
  'book.anna-karenina': [0.038, 0.215, 0.14],
  'book.inferno': [0.033, 0.20, 0.13],
  'book.three-body': [0.032, 0.21, 0.14],
  'book.power-broker': [0.062, 0.235, 0.155],
  'book.pride-and-prejudice': [0.036, 0.198, 0.128],
};
const lyingSize: Record<string, [number, number, number]> = {
  'book.thinking-fast-slow': [0.14, 0.030, 0.21],
  'book.innovators-dilemma': [0.135, 0.022, 0.205],
  'book.demi-gods': [0.125, 0.034, 0.185],
  'book.becoming-steve-jobs': [0.145, 0.026, 0.215],
};
const tones = [0x6b4a3a, 0x3f4d3a, 0x2f3b55, 0x5a4a2a, 0x7a5a5a, 0x4a5a6a, 0x66553f, 0x5a3a3a, 0x3a4a4a];

export function createBooks(ctx: ObjectCtx): ObjectCluster {
  const root = new THREE.Group();
  root.name = 'books';
  const objects: TableObject[] = [];
  const bookendMat = metal({ color: 0x4a4b4d, roughness: 0.5 });
  // standing books shoulder to shoulder from x = -0.19 with a 2 mm gap; the stack offset a little per book
  const GAP = 0.002;
  let cursor = -0.19;
  let stackY = 0;
  const stackOffsets: [number, number][] = [[0.14, 0.01], [0.15, 0.0], [0.135, 0.02], [0.145, 0.005]];
  bookSlots.forEach((slot, i) => {
    const size = slot.standing ? standingSize[slot.id] : lyingSize[slot.id];
    const obj = placeholder(ctx, {
      id: slot.id,
      label: slot.title,
      size,
      color: tones[i % tones.length],
      hover: slot.standing ? { tiltMode: 'forward', tilt: 8, lift: 0.006 } : { lift: 0.012 },
    });
    // TEMPORARY (vinyl branch): route the placeholder Pride and Prejudice to the Austen panel for
    // testing; the integrator keeps the books builder's version of this file.
    if (slot.id === 'book.pride-and-prejudice') obj.focus.panel = austenPanel();
    if (slot.standing) {
      obj.group.position.set(cursor + size[0] / 2, 0, 0);
      cursor += size[0] + GAP;
    } else {
      const [sx, sz] = stackOffsets[slot.stackIndex ?? 0];
      obj.group.position.set(sx, stackY, sz);
      stackY += size[1];
      obj.group.rotation.y = (slot.stackIndex ?? 0) * 0.04 - 0.05;
    }
    root.add(obj.group);
    objects.push(obj);
  });
  // two plain metal bookends: an L of two plates each
  const xs = [-0.19 - 0.004, cursor - GAP + 0.004];
  xs.forEach((x, i) => {
    const plate = solid(new THREE.Mesh(roundedBox(0.004, 0.16, 0.12, 0.001), bookendMat));
    plate.position.set(x + (i === 0 ? -0.002 : 0.002), 0.08, 0);
    const base = solid(new THREE.Mesh(roundedBox(0.05, 0.003, 0.12, 0.001), bookendMat));
    base.position.set(x + (i === 0 ? 0.025 : -0.025), 0.0015, 0);
    root.add(plate, base);
  });
  return { root, objects };
}
