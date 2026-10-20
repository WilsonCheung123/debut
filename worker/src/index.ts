// Wilson's table: the two write endpoints (SPEC 5).
//   POST /api/note   { name, email, note, token? }  -> { ok: true }
//   POST /api/anchor { group: 'A'|'B', guess }      -> { stats }
//   GET  /api/anchor/stats                          -> { A: { mean, n }, B: { mean, n } }
// D1 binding DB. Turnstile when TURNSTILE_SECRET is set. Rate limit: 5 notes
// per hashed IP per hour. Optional email to the owner via Resend. The owner's
// address is a Worker secret, never in client code.

export interface Env {
  DB: D1Database;
  TURNSTILE_SECRET?: string;
  RESEND_API_KEY?: string;
  OWNER_EMAIL?: string;
  IP_SALT?: string;
  /** Notes per hashed IP per hour (default 5). `npm run worker` raises it for local development. */
  NOTE_LIMIT_PER_HOUR?: string;
}

const LIMITS = { name: 80, email: 254, note: 2000, perHour: 5 } as const;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

const json = (data: unknown, status = 200): Response => new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
const bad = (error: string, status = 400): Response => json({ ok: false, error }, status);

let schemaReady: Promise<void> | null = null;
/** Idempotent: the schema is also in schema.sql for `wrangler d1 execute`. */
function ensureSchema(db: D1Database): Promise<void> {
  if (!schemaReady) {
    schemaReady = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL, note TEXT NOT NULL, ip_hash TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`),
      db.prepare(`CREATE INDEX IF NOT EXISTS notes_ip_time ON notes (ip_hash, created_at)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS anchors (id INTEGER PRIMARY KEY AUTOINCREMENT, grp TEXT NOT NULL CHECK (grp IN ('A', 'B')), guess REAL NOT NULL, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))`),
      db.prepare(`CREATE INDEX IF NOT EXISTS anchors_grp ON anchors (grp)`),
    ]).then(() => undefined).catch((e) => { schemaReady = null; throw e; });
  }
  return schemaReady;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const v = await req.json();
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch { return null; }
}

async function verifyTurnstile(secret: string, token: unknown, ip: string): Promise<boolean> {
  if (typeof token !== 'string' || !token) return false;
  const body = new URLSearchParams({ secret, response: token, remoteip: ip });
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}

async function emailOwner(env: Env, note: { name: string; email: string; note: string }): Promise<void> {
  if (!env.RESEND_API_KEY || !env.OWNER_EMAIL) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: 'The jar <jar@notifications.resend.dev>',
        to: [env.OWNER_EMAIL],
        reply_to: note.email,
        subject: `A slip in the jar from ${note.name}`,
        text: `${note.note}\n\n— ${note.name} <${note.email}>`,
      }),
    });
  } catch (e) {
    console.error('email failed', e);
  }
}

async function stats(db: D1Database): Promise<{ A: { mean: number | null; n: number }; B: { mean: number | null; n: number } }> {
  const rows = await db.prepare(`SELECT grp, AVG(guess) AS mean, COUNT(*) AS n FROM anchors GROUP BY grp`).all<{ grp: string; mean: number; n: number }>();
  const out = { A: { mean: null as number | null, n: 0 }, B: { mean: null as number | null, n: 0 } };
  for (const r of rows.results ?? []) {
    if (r.grp === 'A' || r.grp === 'B') out[r.grp] = { mean: r.mean === null ? null : Math.round(r.mean * 10) / 10, n: Number(r.n) };
  }
  return out;
}

async function postNote(req: Request, env: Env, ip: string): Promise<Response> {
  const body = await readJson(req);
  if (!body) return bad('bad json');
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!name || name.length > LIMITS.name) return bad('name: 1 to 80 characters');
  if (!EMAIL_RE.test(email) || email.length > LIMITS.email) return bad('email: does not look like an address');
  if (!note || note.length > LIMITS.note) return bad('note: 1 to 2000 characters');
  if (env.TURNSTILE_SECRET && !(await verifyTurnstile(env.TURNSTILE_SECRET, body.token, ip))) return bad('verification failed', 403);

  const ipHash = await sha256Hex(`${env.IP_SALT ?? 'salt'}:${ip}`);
  const recent = await env.DB.prepare(`SELECT COUNT(*) AS n FROM notes WHERE ip_hash = ? AND created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 hour')`).bind(ipHash).first<{ n: number }>();
  const perHour = Number(env.NOTE_LIMIT_PER_HOUR) > 0 ? Number(env.NOTE_LIMIT_PER_HOUR) : LIMITS.perHour;
  if ((recent?.n ?? 0) >= perHour) return bad('too many notes for now; try again in an hour', 429);

  await env.DB.prepare(`INSERT INTO notes (name, email, note, ip_hash) VALUES (?, ?, ?, ?)`).bind(name, email, note, ipHash).run();
  await emailOwner(env, { name, email, note });
  return json({ ok: true });
}

async function postAnchor(req: Request, env: Env): Promise<Response> {
  const body = await readJson(req);
  if (!body) return bad('bad json');
  const group = body.group;
  const guess = typeof body.guess === 'number' ? body.guess : Number(body.guess);
  if (group !== 'A' && group !== 'B') return bad('group: A or B');
  if (!Number.isFinite(guess) || guess < 0 || guess > 150) return bad('guess: a number between 0 and 150');
  await env.DB.prepare(`INSERT INTO anchors (grp, guess) VALUES (?, ?)`).bind(group, guess).run();
  return json({ ok: true, stats: await stats(env.DB) });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const ip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';
    try {
      if (!url.pathname.startsWith('/api/')) return bad('not found', 404);
      await ensureSchema(env.DB);
      if (req.method === 'POST' && url.pathname === '/api/note') return await postNote(req, env, ip);
      if (req.method === 'POST' && url.pathname === '/api/anchor') return await postAnchor(req, env);
      if (req.method === 'GET' && url.pathname === '/api/anchor/stats') return json(await stats(env.DB));
      return bad('not found', 404);
    } catch (e) {
      console.error(e);
      return bad('server error', 500);
    }
  },
} satisfies ExportedHandler<Env>;
