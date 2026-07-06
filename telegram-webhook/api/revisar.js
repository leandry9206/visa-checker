const {
  REVISAR_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
  TELEGRAM_WEBHOOK_SECRET,
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_REF,
} = process.env;

const DISPATCH_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/monitor.yml/dispatches`;

async function sendMessage(text) {
  await fetch(`https://api.telegram.org/bot${REVISAR_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  if (req.headers['x-telegram-bot-api-secret-token'] !== TELEGRAM_WEBHOOK_SECRET) {
    res.status(401).end();
    return;
  }

  // Responder rápido: Telegram reintenta si tarda demasiado en recibir el 200.
  res.status(200).end();

  const message = req.body?.message;
  const text = message?.text?.trim() ?? '';
  const isFromChat = String(message?.chat?.id) === String(TELEGRAM_CHAT_ID);

  if (!isFromChat || !/^\/revisar\b/i.test(text)) {
    return;
  }

  const dispatchRes = await fetch(DISPATCH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: GITHUB_REF }),
  });

  if (dispatchRes.ok) {
    await sendMessage('Ok, arrancando la consulta del trámite ahora. En un momento te llega el captcha por el otro bot.');
  } else {
    const errorBody = await dispatchRes.text();
    console.error('GitHub dispatch failed:', dispatchRes.status, errorBody);
    await sendMessage(`No pude disparar el workflow (HTTP ${dispatchRes.status}). Revisá los secrets de Vercel.`);
  }
}
