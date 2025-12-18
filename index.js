import 'dotenv/config';

// ====== CONFIG ======
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;
const POLL_MS  = Number(process.env.POLL_INTERVAL_MS || 30000); // 30s por defecto

// Intentamos varios endpoints de SofaScore
const SOFA_ENDPOINTS = [
  'https://api.sofascore.com/api/v1/sport/football/events/live',
  'https://api.sofascore.com/mobile/v4/sport/football/events/live'
];

// Para no repetir la misma alerta por partido
const seenStatus = new Set(); // "<id>:preET"

// ====== HELPERS ======
async function httpJson(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000); // 10s timeout
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': 'https://www.sofascore.com/',
        'Origin': 'https://www.sofascore.com',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function isNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

/**
 * Marcador al 90':
 * 1) normalTime (camelCase) o normaltime (todo junto)
 * 2) period1 + period2
 * 3) current - extraTime - penalties (si existen)
 */
function pickScore(score) {
  if (!score) return 0;

  // 1) normalTime / normaltime
  if (isNum(score.normalTime)) return score.normalTime;
  if (isNum(score.normaltime)) return score.normaltime;

  // 2) period1 + period2
  const p1 = isNum(score.period1) ? score.period1 : 0;
  const p2 = isNum(score.period2) ? score.period2 : 0;
  if (p1 || p2) return p1 + p2;

  // 3) current ajustado por posibles campos extra
  let cur = isNum(score.current) ? score.current : 0;
  if (isNum(score.extraTime))   cur -= score.extraTime;
  if (isNum(score.penalties))   cur -= score.penalties;
  if (cur < 0) cur = 0;
  return cur;
}

async function getLiveFromSofa() {
  for (const url of SOFA_ENDPOINTS) {
    try {
      const data = await httpJson(url);
      const events = Array.isArray(data?.events) ? data.events : [];
      return events.map(e => ({
        id: e?.id,
        comp: e?.tournament?.name,
        country: e?.tournament?.category?.name,
        round: e?.roundInfo?.name || e?.roundInfo?.round || null,
        home: e?.homeTeam?.name,
        away: e?.awayTeam?.name,
        hs: pickScore(e?.homeScore), // marcador correcto al 90'
        as: pickScore(e?.awayScore), // marcador correcto al 90'
        code: e?.status?.code,                 // numérico (120–129 suele ser ET)
        desc: (e?.status?.description || '')   // texto: "After regular time", etc.
      }));
    } catch (_) {
      // probar siguiente endpoint
    }
  }
  return [];
}

// Detecta “Es. TE” (terminó 90' y esperan ET)
function isPreExtraTime(m) {
  const d = (m.desc || '').toLowerCase();
  return d.includes('after regular time')
      || d.includes('awaiting extra time')
      || d.includes('extra time break')
      || d.includes('after 90');
}

function labelPreET(m) {
  const league = m.country ? `${m.comp} (${m.country})` : (m.comp || 'Torneo');
  const round  = m.round ? `\n🔁 Ronda: ${m.round}` : '';
  const link   = `https://www.sofascore.com/event/${m.id}`;
  return [
    '⏳ Es. TIEMPO EXTRA',
    `🏆 ${league}${round}`,
    `⚔️ ${m.home} vs ${m.away}`,
    `🔢 Marcador: ${m.hs} - ${m.as}`,
    `🔗 ${link}`,
    `ⓘ Estado: ${m.desc || m.code}`
  ].join('\n');
}

async function notifyTelegram(text) {
  const url = `https://api.telegram.org/bot${TG_TOKEN}/sendMessage`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: TG_CHAT, text, disable_web_page_preview: true })
    });
    if (!r.ok) console.error('Telegram error', r.status, await r.text());
  } catch (e) {
    console.error('Telegram fetch error:', e.message);
  }
}

// ====== LOOP ======
async function tick() {
  try {
    const events = await getLiveFromSofa();
    for (const m of events) {
      if (!isPreExtraTime(m)) continue;
      const key = `${m.id}:preET`;
      if (seenStatus.has(key)) continue;
      seenStatus.add(key);
      await notifyTelegram(labelPreET(m));
    }
  } catch (e) {
    console.error('tick error:', e.message);
  }
}

// ====== START ======
console.log(`Zetabets ET Watcher (SOFASCORE, SOLO "Es. TE") cada ${POLL_MS/1000}s…`);
notifyTelegram('✅ Bot listo. Aviso SOLO cuando esté "Es. TE" (marcador al 90’).');
setInterval(tick, POLL_MS);
