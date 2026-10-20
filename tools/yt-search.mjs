#!/usr/bin/env node
// Finds YouTube video IDs for the turntable's playlist (src/content/music.ts).
//
//   node tools/yt-search.mjs "Hans Zimmer Time Inception"      lists the top hits: id, length, channel, title
//   node tools/yt-search.mjs --verify dQw4w9WgXcQ abc123…       checks IDs through the oEmbed endpoint
//
// Search scrapes youtube.com/results (no API key); an official channel shows a
// "*" (verified badge) and label uploads read "Provided to YouTube by …" in the
// title's channel ("Artist - Topic"). Verify prints the title and author oEmbed
// returns, or FAIL when the ID does not resolve.
const args = process.argv.slice(2);
const headers = {
  'accept-language': 'en-US,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36',
  cookie: 'CONSENT=YES+1',
};

if (args[0] === '--verify') {
  for (const id of args.slice(1)) {
    const u = `https://www.youtube.com/oembed?url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}&format=json`;
    try {
      const r = await fetch(u, { headers });
      if (!r.ok) { console.log(`${id}  FAIL http ${r.status}`); continue; }
      const j = await r.json();
      console.log(`${id}  OK  [${j.author_name}]  ${j.title}`);
    } catch (e) { console.log(`${id}  FAIL ${e.message}`); }
  }
  process.exit(0);
}

const q = args.join(' ');
const r = await fetch('https://www.youtube.com/results?search_query=' + encodeURIComponent(q) + '&sp=EgIQAQ%253D%253D', { headers });
const html = await r.text();
const m = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
if (!m) { console.log('no ytInitialData in the results page'); process.exit(1); }
const data = JSON.parse(m[1]);
const out = [];
(function walk(n) {
  if (!n || typeof n !== 'object') return;
  if (n.videoRenderer) {
    const v = n.videoRenderer;
    out.push({
      id: v.videoId,
      title: v.title?.runs?.map((x) => x.text).join(''),
      ch: v.ownerText?.runs?.map((x) => x.text).join(''),
      len: v.lengthText?.simpleText,
      badge: (v.ownerBadges || []).map((b) => b.metadataBadgeRenderer?.style).join(','),
    });
  }
  for (const k in n) walk(n[k]);
})(data);
console.log('## ' + q);
for (const o of out.slice(0, 10)) console.log(`${o.id}  ${o.len ?? '?'}  [${o.ch}]${o.badge ? ' *' : ''}  ${o.title}`);
