// The turntable's music (SPEC 0.2 "Music"): what the YouTube player plays.
//
// OWNER: replace this with your own playlist. Either
//   (a) set YOUTUBE_PLAYLIST to the id of a public/unlisted YouTube playlist
//       (the `list=PL…` part of its URL); the player then plays that list and
//       TRACKS is ignored, or
//   (b) edit TRACKS: one entry per video, in play order. The id is the
//       `v=` part of a watch URL (https://www.youtube.com/watch?v=<id>).
// Every id below resolved through YouTube's oEmbed endpoint on 2026-10-20 and
// is embeddable. `node tools/yt-search.mjs "<title>"` lists candidates and
// `node tools/yt-search.mjs --verify <id…>` checks replacements.

export interface Track {
  /** YouTube video id. */
  id: string;
  /** Shown under the player while this track is cued or playing. */
  title: string;
  artist: string;
}

/** A YouTube playlist id (PL…). null = play TRACKS. */
export const YOUTUBE_PLAYLIST: string | null = null;

/** The record's name (the label on the vinyl and the panel's heading). */
export const PLAYLIST_TITLE = 'lol';

export const TRACKS: Track[] = [
  { id: 'hMQ7VhcCpuY', title: 'Time', artist: 'Hans Zimmer' },                        // WaterTower Music (Inception)
  { id: 'JuSsvM8B4Jc', title: 'Cornfield Chase', artist: 'Hans Zimmer' },             // WaterTower Music (Interstellar)
  { id: 'vPA6T0la6uI', title: 'Day One', artist: 'Hans Zimmer' },                     // WaterTower Music (Interstellar)
  { id: 'Ia3eQ7QD9Z0', title: 'S.T.A.Y.', artist: 'Hans Zimmer' },                    // WaterTower Music (Interstellar)
  { id: 'CXrKUqq0Te4', title: 'Organ Variation', artist: 'Hans Zimmer' },             // WaterTower Music (Interstellar)
  { id: 'f7SS57LFPco', title: 'Merry-Go-Round of Life', artist: 'Joe Hisaishi' },     // Joe Hisaishi Official (Howl's Moving Castle, 5:12 soundtrack version; 2pQKqQ9sG50 is the 2:46 one)
  { id: 'XcoyRYIMfzw', title: 'The Flower Garden', artist: 'Joe Hisaishi' },          // [no official upload found; this is a fan upload (Layi, 3:41). AUd7yJ4sKPM is a London Music Works cover from the label]
  { id: '06u8fxc_aHM', title: 'Nostalgia', artist: 'Joe Hisaishi' },                  // Joe Hisaishi Official
  { id: 'TK1Ij_-mank', title: "One Summer's Day", artist: 'Joe Hisaishi' },           // Joe Hisaishi Official (Spirited Away)
  { id: 'y5h8OI1qWWY', title: 'Il Porco Rosso', artist: 'Joe Hisaishi' },             // Joe Hisaishi Official (1:56; iKMHCmDdJ2U is the 4:53 version)
  { id: 'Wk7RrtEGDyo', title: "Mia & Sebastian's Theme", artist: 'Justin Hurwitz' },  // Justin Hurwitz - Topic (Interscope; 6HvJnBpplPc is the 10th-anniversary version)
  { id: '4JZ-o3iAJv4', title: 'Can You Hear the Music', artist: 'Ludwig Göransson' }, // Ludwig Göransson - Topic (Back Lot Music, Oppenheimer)
  { id: 'Z93gSAyWjtQ', title: 'Meeting Kitty', artist: 'Ludwig Göransson' },          // Ludwig Göransson - Topic (Oppenheimer)
  { id: 'Ob7fefaJ5-c', title: '私の嘘 (Watashi no Uso)', artist: 'Masaru Yokoyama' },  // Masaru Yokoyama - Topic (Your Lie in April; IqkZZZ6X8mQ is the piano solo)
  { id: '1OZDaRhHHyM', title: 'Merry Christmas Mr. Lawrence', artist: 'Ryuichi Sakamoto' }, // Ryuichi Sakamoto - Topic (DEsEv6WAig0 and LGs_vGt0MY8/Decca are other official versions)
];

export const PLAYLIST_URL = YOUTUBE_PLAYLIST
  ? `https://www.youtube.com/playlist?list=${YOUTUBE_PLAYLIST}`
  : `https://www.youtube.com/watch_videos?video_ids=${TRACKS.map((t) => t.id).join(',')}`;
