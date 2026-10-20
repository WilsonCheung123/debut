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
  /** Wilson's voice; anything not verified is in [brackets] for him to edit. */
  paragraphs: [
    'Realm is my AI film studio. Cinematic films and campaigns, made with generative tools and [a small team], and held to the standard of film: [every shot directed, graded and cut, not prompted and hoped for].',
    '[A line or two on why Realm exists and where it is going.]',
  ],
  listKicker: 'five films, projected without sound',
};

export const thumbnailUrl = (film: Film, width = 480): string =>
  `https://image.mux.com/${film.id}/thumbnail.jpg?width=${width}&time=${film.thumbTime}`;

export const hlsUrl = (film: Film): string => `https://stream.mux.com/${film.id}.m3u8`;

/** The embedded Mux player, in the panel's paper colours, starting as soon as it can. */
export const playerUrl = (film: Film): string => {
  const q = new URLSearchParams({
    autoplay: 'true',
    'primary-color': '#f4efe6',
    'accent-color': '#6e2a2a',
    'metadata-video-title': film.title,
  });
  return `https://player.mux.com/${film.id}?${q.toString()}`;
};
