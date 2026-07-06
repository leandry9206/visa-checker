# Monitor de trámite consular (Telegram + GitHub Actions)

Revisa cada hora el estado de un trámite en `https://sutramiteconsular.maec.es/` y
avisa por Telegram cuando cambia. **El captcha lo resuelve siempre una persona por
Telegram** — el código nunca lo lee ni lo adivina, solo reenvía la imagen y espera la
respuesta escrita.

## Cómo funciona

1. Cada hora (o al lanzarlo a mano con `workflow_dispatch`), un workflow de GitHub
   Actions abre el sitio con Playwright y rellena el formulario "Consultar Resguardo".
2. Cuando aparece el captcha, el bot te manda la imagen por Telegram.
3. Vos respondés en el chat con los dígitos. El workflow los usa para continuar.
4. Si el dato del trámite cambió respecto a la última vez, te llega un mensaje. Si no
   cambió, no te molesta.
5. El estado (último valor + offset de Telegram) se guarda en `state.json`, que el
   propio workflow commitea de vuelta al repo.

No hay servidor propio: todo corre en los minutos de GitHub Actions.

## 1. Crear el bot de Telegram

1. Hablá con [@BotFather](https://t.me/BotFather) en Telegram.
2. Enviá `/newbot` y seguí los pasos. Vas a recibir un token con forma
   `123456789:AAExxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` → ese es `TELEGRAM_BOT_TOKEN`.
3. Iniciá una conversación con tu bot nuevo y mandale cualquier mensaje (ej. "hola"),
   para que Telegram registre el chat.

## 2. Obtener tu `TELEGRAM_CHAT_ID`

Con el bot ya creado y habiéndole mandado un mensaje, abrí en el navegador (o con
`curl`):

```
https://api.telegram.org/bot<TU_TOKEN>/getUpdates
```

Buscá en la respuesta JSON el campo `message.chat.id`. Ese número es tu
`TELEGRAM_CHAT_ID`.

## 3. Configurar los Secrets del repo

En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
Cargá estos seis secrets:

| Secret | Descripción |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token del bot (paso 1) |
| `TELEGRAM_CHAT_ID` | Tu chat id (paso 2) |
| `TIPO_TRAMITE` | Texto exacto de la opción de "Tipo de trámite" (visado) |
| `IDENTIFICADOR` | Identificador del trámite |
| `IDENTIFICADOR_ACCEDA` | Identificador Acceda (dejalo vacío si no aplica) |
| `ANIO_NACIMIENTO` | Año de nacimiento |

Los Secrets nunca se exponen en los logs, aunque el repo sea público.

## 4. Público vs. privado — minutos de Actions

- **Repo público**: minutos de GitHub Actions **ilimitados**. Recomendado para un job
  que corre las 24 horas cada hora. Los Secrets siguen sin exponerse.
- **Repo privado**: el plan gratuito tiene un límite mensual de minutos; un job por
  hora (24/día) puede agotarlo. Si preferís mantenerlo privado, bajá la frecuencia del
  cron en `.github/workflows/monitor.yml` (por ejemplo cada 2 o 3 horas).

## 5. Confirmar los selectores del formulario

El HTML real de `https://sutramiteconsular.maec.es/` no pudo inspeccionarse de
antemano (el sitio bloquea el acceso automatizado fuera del propio flujo de
Playwright). Por eso `run.js` tiene selectores marcados con
`// TODO: confirmar en la página` para:

- El `<select>` de "Tipo de trámite".
- El input "Identificador".
- El input "Identificador Acceda".
- El input "Año de nacimiento".
- El elemento imagen del captcha.
- El input donde se escriben los dígitos del captcha.
- El botón "consultar trámite".
- El elemento de la página de resultado con el estado del trámite.

Pasos para completarlos:

1. Cargá los Secrets (paso 3) con datos reales.
2. Lanzá el workflow manualmente: pestaña **Actions → Monitor trámite consular → Run
   workflow**.
3. Mirá los logs del step "Run monitor". Si algún selector falla, Playwright te dice
   cuál. Abrí la página en tu navegador, inspeccioná el elemento correspondiente
   (clic derecho → Inspeccionar) y reemplazá el selector TODO en `run.js` por el real.
4. Repetí hasta que el flujo llegue sano hasta el final (captcha incluido).

## Estructura del proyecto

```
run.js                       # flujo completo de una ejecución
telegram.js                  # sendMessage, sendPhoto, waitForReply (long-poll)
state.js                     # leer/escribir state.json
state.json                   # último valor + offset de Telegram (se versiona)
package.json
.github/workflows/monitor.yml
```

## Restricción de diseño

El captcha **siempre** lo resuelve una persona por Telegram. El código no implementa
ni implementará resolución automática (OCR, visión, servicios anti-captcha).
