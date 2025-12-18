import 'dotenv/config';

// ====== CONFIG ======
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT  = process.env.TELEGRAM_CHAT_ID;
const POLL_MS  = Number(process.env.POLL_INTERVAL_MS || 30000);

// Node 18+ → fetch nativo
const SOFA_ENDPOINTS = [
  'https://api.sofascore.com/api/v1/sport/football/events/live',
  'https://api.sofascore.com/mobile/v4/sport/football/events/live'
];

const seenStatus = new Set();

// ====== HELPERS ======
async function httpJson(url) {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 10000);

  const res = await fetch(url, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Accept': 'application/json',
      'Referer': 'https://www.sofascore.com'
    }
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function getLiveFromSofa() {
  for (const url of SOFA_ENDPOINTS) {
    try {
      const data = await httpJson(url);
      return data?.events || [];
    } catch {}
  }
  return [];
}

function isPreExtraTime(e) {
  const d = (e?.status?.description || '').toLowerCase();
  return (
    d.includes('after regular time') ||
    d.includes('awaiting extra time') ||
    d.includes('extra time')
  );
}

async function notifyTelegram(text) {
  await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      text,
      disable_web_page_preview: true
    })
  });
}

// ====== LOOP ======
async function tick() {
  try {
    const events = await getLiveFromSofa();
    for (const e of events) {
      if (!isPreExtraTime(e)) continue;
      if (seenStatus.has(e.id)) continue;

      seenStatus.add(e.id);

      const msg =
        `⏳ Es. TIEMPO EXTRA\n` +
        `${e.homeTeam?.name} vs ${e.awayTeam?.name}\n` +
        `🔗 https://www.sofascore.com/event/${e.id}`;

      await notifyTelegram(msg);
      console.log('[TG] enviado');
    }
  } catch (err) {
    console.error('tick error', err.message);
  }
}

console.log('✅ Zetabets ET activo');
notifyTelegram('✅ Zetabets ET iniciado');
setInterval(tick, POLL_MS);
