import { chromium } from 'playwright';
import { readState, writeState } from './state.js';
import { sendMessage, sendPhoto, waitForReply } from './telegram.js';

const TRAMITE_URL = process.env.TRAMITE_URL ?? 'https://sutramiteconsular.maec.es/';
const REPLY_TIMEOUT_MIN = Number(process.env.REPLY_TIMEOUT_MIN ?? '8');
const NOTIFY_ALWAYS = process.env.NOTIFY_ALWAYS === 'true';

const TIPO_TRAMITE = process.env.TIPO_TRAMITE;
const IDENTIFICADOR = process.env.IDENTIFICADOR;
const IDENTIFICADOR_ACCEDA = process.env.IDENTIFICADOR_ACCEDA ?? '';
const ANIO_NACIMIENTO = process.env.ANIO_NACIMIENTO;

async function main() {
  const state = readState();
  let browser;

  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(TRAMITE_URL, { waitUntil: 'domcontentloaded' });

    // TODO: confirmar en la página — selector real del <select> "Tipo de trámite"
    await page.selectOption('select#tipoTramite', { label: TIPO_TRAMITE });

    // TODO: confirmar en la página — selector real del input "Identificador"
    await page.fill('#identificador', IDENTIFICADOR);

    if (IDENTIFICADOR_ACCEDA) {
      // TODO: confirmar en la página — selector real del input "Identificador Acceda"
      await page.fill('#identificadorAcceda', IDENTIFICADOR_ACCEDA);
    }

    // TODO: confirmar en la página — selector real del input "Año de nacimiento"
    await page.fill('#anioNacimiento', ANIO_NACIMIENTO);

    // TODO: confirmar en la página — selector real del elemento imagen del captcha
    const captchaLocator = page.locator('#captchaImagen');
    const captchaBuffer = await captchaLocator.screenshot();

    await sendPhoto(captchaBuffer, 'Captcha del trámite — respondeme solo con los dígitos');

    const { digits, newOffset } = await waitForReply({
      offset: state.telegramOffset,
      timeoutMin: REPLY_TIMEOUT_MIN,
    });

    state.telegramOffset = newOffset;

    if (!digits) {
      writeState(state);
      await sendMessage('No respondiste a tiempo (o el formato no fue válido), reintento a la próxima hora.');
      process.exit(0);
    }

    // TODO: confirmar en la página — selector real del input "Escriba los números"
    await page.fill('#captchaInput', digits);

    // TODO: confirmar en la página — selector real del botón "consultar trámite"
    await page.click('button:has-text("consultar trámite")');
    await page.waitForLoadState('networkidle');

    // TODO: confirmar en la página — selector real del dato de estado en la página de resultado
    const nuevoValor = (await page.locator('#estadoTramite').textContent())?.trim() ?? '';

    const valorAnterior = state.lastValue ?? null;
    const cambio = nuevoValor !== valorAnterior;

    if (cambio || valorAnterior === null || NOTIFY_ALWAYS) {
      const ahora = new Date().toISOString();
      await sendMessage(
        `Trámite actualizado (${ahora})\nNuevo: ${nuevoValor}\nAnterior: ${valorAnterior ?? '(sin dato previo)'}`
      );
    }

    state.lastValue = nuevoValor;
    state.lastCheckedAt = new Date().toISOString();
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
