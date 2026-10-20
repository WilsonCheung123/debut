// The registry: every object on the table, in reading order (front-left to
// back-right as the camera sees it). The engine creates them, places their
// roots from layout.rest[key], and registers their TableObjects.
// Object builders edit only their own file; add nothing here.
import type { ObjectCtx, CreateResult } from './types';
import { createBooks } from './books';
import { createIdCard } from './id-card';
import { createPapers } from './papers';
import { createGuitar } from './guitar';
import { createFpga } from './fpga';
import { createDieCast } from './die-cast';
import { createHologram } from './hologram';
import { createPuppet } from './puppet';
import { createJar } from './jar';
import { createVinyl } from './vinyl';
import { createLamp } from './lamp';

export interface RegistryEntry {
  /** Key into layout.rest. */
  key: string;
  create(ctx: ObjectCtx): CreateResult;
}

export const registry: RegistryEntry[] = [
  { key: 'books', create: createBooks },
  { key: 'id-card', create: createIdCard },
  { key: 'papers', create: createPapers },
  { key: 'guitar', create: createGuitar },
  { key: 'fpga', create: createFpga },
  { key: 'die-cast', create: createDieCast },
  { key: 'hologram', create: createHologram },
  { key: 'puppet', create: createPuppet },
  { key: 'jar', create: createJar },
  { key: 'vinyl', create: createVinyl },
  { key: 'lamp', create: createLamp },
];
