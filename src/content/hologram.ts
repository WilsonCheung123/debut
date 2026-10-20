// The hologram projector: Realm (Wilson's AI film studio) and the five films.
// Playback ids from SPEC 4.7; categories, durations and the thumbnail frame
// times are the ones realmfilm.art itself uses for each film.

export interface Film {
  title: string;
  /** Mux playback id (public). */
  id: string;
  /** What kind of film, as the studio's site files it. */
  kind: string;
  /** mm:ss */
  duration: string;
  /** The second the studio's site pulls its poster frame from. */
  thumbTime: number;
}

export const FILMS: Film[] = [
  { title: 'Heading for the Misty Heights', id: 'gufxYjX5Yq5DjAPT47U86iRySJVH9dlcWk7kYA01CUA00', kind: 'long-form film', duration: '11:28', thumbTime: 42 },
  { title: 'Volkswagen ID.ERA 9X', id: 'egwKBUiLY00jYjusvYU01GGaKQeKvj7SmmEUSWbDEMRlI', kind: 'ads campaign', duration: '1:22', thumbTime: 10 },
  { title: 'Driververse', id: '02vmSSor8qZ9UhrFWS4Bl8ACmfwW02b5gLFoo4ptZALhY', kind: 'series trailer', duration: '2:50', thumbTime: 24 },
  { title: 'Arale', id: 'dt8THJES00ZdeRSziCGgJ5X402HHSK7Wx4mX55l6LY6cM', kind: 'creator film', duration: '10:22', thumbTime: 36 },
  { title: 'Big Fish & Begonia', id: 'qculeVz2PQX3bWBalRdiDTNU02xADvRMIMHbcaUcTA4U', kind: 'cultural-tourism trailer', duration: '5:09', thumbTime: 20 },
];

export const REALM = {
  kicker: 'Realm',
  title: 'An AI film studio',
  url: 'https://realmfilm.art',
  /** Wilson's voice; the two sentences on Realm are the builder's educated guess (SPEC 0.1: nothing in brackets ships). */
  paragraphs: [
    'Realm is my AI film studio: a small team making short films and campaigns with diffusion models, held to the standard of film rather than of demos.',
    'Every shot is directed, graded and cut; the models are the camera, not the director.',
  ],
  listKicker: 'five films, projected without sound',
};

export const thumbnailUrl = (film: Film, width = 480): string =>
  `https://image.mux.com/${film.id}/thumbnail.jpg?width=${width}&time=${film.thumbTime}`;

export const hlsUrl = (film: Film): string => `https://stream.mux.com/${film.id}.m3u8`;
