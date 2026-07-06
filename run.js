import { chromium } from 'playwright';
import { readState, writeState } from './state.js';
import { sendMessage, sendPhoto, waitForReply } from './telegram.js';

const TRAMITE_URL = process.env.TRAMITE_URL ?? 'https://sutramiteconsular.maec.es/';
const REPLY_TIMEOUT_MIN = Number(process.env.REPLY_TIMEOUT_MIN ?? '8');
const NOTIFY_ALWAYS = process.env.NOTIFY_ALWAYS === 'true';
const MAX_CAPTCHA_ATTEMPTS = 2;

// Valor del <option> del select (p.ej. "VISADO" o "PASAPORTE"), no la etiqueta visible.
const TIPO_TRAMITE = process.env.TIPO_TRAMITE;
const IDENTIFICADOR = process.env.IDENTIFICADOR;
const ANIO_NACIMIENTO = process.env.ANIO_NACIMIENTO;

// Rellena el formulario "Consultar Resguardo" y resuelve el captcha por Telegram.
// Reintenta hasta MAX_CAPTCHA_ATTEMPTS veces si el sitio marca el captcha como incorrecto
// (la imagen se regenera en cada intento). "Identificador Acceda" se deja siempre vacío.
async function fillAndSubmit(page, state) {
  await page.selectOption('#infServicio', TIPO_TRAMITE);
  await page.fill('#txIdentificador', IDENTIFICADOR);
  await page.fill('#txtFechaNacimiento', ANIO_NACIMIENTO);

  for (let attempt = 1; attempt <= MAX_CAPTCHA_ATTEMPTS; attempt++) {
    const captchaBuffer = await page.locator('#imagenCaptcha').screenshot();
    const caption =
      attempt === 1
        ? 'Captcha del trámite — respondeme solo con los dígitos'
        : 'El captcha anterior no coincidía, te mando uno nuevo — respondeme solo con los dígitos';
    await sendPhoto(captchaBuffer, caption);

    const { digits, newOffset } = await waitForReply({
      offset: state.telegramOffset,
      timeoutMin: REPLY_TIMEOUT_MIN,
    });
    state.telegramOffset = newOffset;

    if (!digits) {
      return { ok: false, reason: 'timeout' };
    }

    await page.fill('#imgcaptcha', digits);
    await page.click('#imgVerSuTramite');
    await page.waitForLoadState('networkidle');

    if (await page.locator('#CompararCaptcha').isVisible()) {
      continue;
    }

    const errorGeneral = (await page.locator('#lblErrorGeneral').textContent())?.trim();
    if (errorGeneral) {
      return { ok: false, reason: 'form-error', message: errorGeneral };
    }

    return { ok: true };
  }

  return { ok: false, reason: 'captcha-max-attempts' };
}

async function main() {
  const state = readState();
  let browser;

  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(TRAMITE_URL, { waitUntil: 'domcontentloaded' });

    const outcome = await fillAndSubmit(page, state);
    writeState(state);

    if (!outcome.ok) {
      const mensajes = {
        timeout: 'No respondiste a tiempo (o el formato no fue válido), reintento a la próxima hora.',
        'captcha-max-attempts': 'El captcha no coincidió varias veces, reintento a la próxima hora.',
        'form-error': `El formulario devolvió un error: ${outcome.message}`,
      };
      await sendMessage(mensajes[outcome.reason]);
      process.exit(0);
    }

    const nuevoValor = (await page.locator('#ContentPlaceHolderConsulta_TituloEstado').textContent())?.trim() ?? '';

    const valorAnterior = state.lastValue ?? null;
    const cambio = nuevoValor !== valorAnterior;
    const ahora = new Date().toISOString();

    if (cambio || valorAnterior === null) {
      state.lastChangedAt = ahora;
      await sendMessage(
        `Estado del trámite: ${nuevoValor}\nCambió el ${ahora}` +
          (valorAnterior ? `\nEstado anterior: ${valorAnterior}` : '')
      );
    } else if (NOTIFY_ALWAYS) {
      await sendMessage(
        `Estado del trámite: ${nuevoValor}\nSin cambios desde ${state.lastChangedAt ?? '(primera consulta)'}`
      );
    }

    state.lastValue = nuevoValor;
    state.lastCheckedAt = ahora;
    writeState(state);
  } catch (err) {
    writeState(state);
    await sendMessage(`Error en el monitor de trámite: ${err.message}`).catch(() => {});
    console.error(err);
    process.exitCode = 1;
  } finally {
    await browser?.close();
  }
}

main();
