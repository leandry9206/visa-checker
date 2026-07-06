const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

const DIGITS_RE = /^\d{4,6}$/;
const MAX_INVALID_ATTEMPTS = 2;
const POLL_TIMEOUT_SEC = 20;

async function callApi(method, body) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`Telegram API error en ${method}: ${data.description ?? res.statusText}`);
  }
  return data.result;
}

export async function sendMessage(text) {
  return callApi('sendMessage', { chat_id: CHAT_ID, text });
}

export async function sendPhoto(buffer, caption) {
  const form = new FormData();
  form.append('chat_id', CHAT_ID);
  if (caption) form.append('caption', caption);
  form.append('photo', new Blob([buffer], { type: 'image/png' }), 'captcha.png');
  return callApi('sendPhoto', form);
}

async function getUpdates({ offset, timeout }) {
  return callApi('getUpdates', { offset, timeout, allowed_updates: ['message'] });
}

/**
 * Long-poll de getUpdates hasta recibir dígitos válidos, agotar timeoutMin
 * o superar MAX_INVALID_ATTEMPTS respuestas con formato inválido.
 * Devuelve { digits, newOffset }; digits es null si expiró o se agotaron los reintentos.
 */
export async function waitForReply({ offset, timeoutMin }) {
  const deadline = Date.now() + timeoutMin * 60 * 1000;
  let currentOffset = offset ?? 0;
  let invalidAttempts = 0;

  while (Date.now() < deadline) {
    const remainingSec = Math.max(1, Math.floor((deadline - Date.now()) / 1000));
    const pollTimeout = Math.min(POLL_TIMEOUT_SEC, remainingSec);
    const updates = await getUpdates({ offset: currentOffset, timeout: pollTimeout });

    for (const update of updates) {
      currentOffset = update.update_id + 1;
      const msg = update.message;
      if (!msg || String(msg.chat?.id) !== String(CHAT_ID)) continue;

      const text = (msg.text ?? '').trim();
      if (DIGITS_RE.test(text)) {
        return { digits: text, newOffset: currentOffset };
      }

      invalidAttempts += 1;
      if (invalidAttempts > MAX_INVALID_ATTEMPTS) {
        return { digits: null, newOffset: currentOffset };
      }
      await sendMessage('Formato inválido. Respondé solo con los dígitos del captcha (4 a 6 números).');
    }
  }

  return { digits: null, newOffset: currentOffset };
}
