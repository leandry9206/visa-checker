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
4. El dato que se lee es el **estado de la solicitud** (ej. "TRÁMITE SOLICITADO"). Si
   cambió respecto a la última vez, te llega un mensaje con el nuevo estado y la fecha
   del cambio. Si no cambió, no te molesta (salvo `NOTIFY_ALWAYS=true`, que además
   muestra desde cuándo no cambia).
5. El estado se guarda en `state.json` (último valor, fecha del último cambio, fecha
   de la última consulta y offset de Telegram), que el propio workflow commitea de
   vuelta al repo.

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
| `TIPO_TRAMITE` | Valor exacto del `<option>` de "Tipo de trámite": `VISADO` o `PASAPORTE` |
| `IDENTIFICADOR` | Identificador del trámite |
| `ANIO_NACIMIENTO` | Año de nacimiento (4 dígitos) |

El campo "Identificador Acceda" del formulario **no se usa** — el flujo lo deja
siempre vacío, tal como se pidió.

Los Secrets nunca se exponen en los logs, aunque el repo sea público.

## 4. Público vs. privado — minutos de Actions

- **Repo público**: minutos de GitHub Actions **ilimitados**. Recomendado para un job
  que corre las 24 horas cada hora. Los Secrets siguen sin exponerse.
- **Repo privado**: el plan gratuito tiene un límite mensual de minutos; un job por
  hora (24/día) puede agotarlo. Si preferís mantenerlo privado, bajá la frecuencia del
  cron en `.github/workflows/monitor.yml` (por ejemplo cada 2 o 3 horas).

## 5. Selectores (ya confirmados)

Todos los selectores están confirmados con el HTML real del sitio, no quedan TODOs:

- Formulario de entrada: `#infServicio`, `#txIdentificador`, `#txtFechaNacimiento`,
  `#imagenCaptcha`, `#imgcaptcha`, `#imgVerSuTramite`.
- Errores del propio sitio: `#CompararCaptcha` (captcha incorrecto — `run.js`
  reintenta automáticamente con una imagen nueva) y `#lblErrorGeneral` (otros
  errores del formulario).
- Página de resultado (`ConsultarTramite/DatosConsulta.aspx`): el estado de la
  solicitud está en `#ContentPlaceHolderConsulta_TituloEstado`.

Igual, si el sitio cambia su HTML en el futuro, `workflow_dispatch` + los logs del
step "Run monitor" son la forma de detectarlo (Playwright indica el selector que
falló).

## 6. Comando `/revisar` por Telegram (opcional)

Además de la revisión automática cada hora, podés disparar una consulta al instante
mandándole `/revisar` a un bot por Telegram. Esto necesita una pieza extra fuera de
GitHub Actions, por una limitación real de Telegram:

> Telegram no permite que un mismo bot use `getUpdates` (polling, lo que usa
> `run.js` para esperar los dígitos del captcha) **y** un webhook al mismo tiempo.
> Por eso `/revisar` funciona con un **segundo bot**, dedicado solo a ese comando.
> El bot original (paso 1) sigue igual, sin tocarlo, para el captcha y los avisos.

La pieza extra es una función serverless en **Vercel** (`telegram-webhook/`) que
Telegram llama al instante apenas mandás `/revisar`, y que dispara el
`workflow_dispatch` de `monitor.yml` vía la API de GitHub — la misma llamada que
hace el botón "Run workflow" de la pestaña Actions.

### 6.1. Crear el segundo bot

Repetí el paso 1 con @BotFather para crear un bot nuevo (ej. `VisaCheckerControlBot`)
y conseguí su `TELEGRAM_CHAT_ID` de la misma forma que el paso 2 (mandale un mensaje
y mirá `getUpdates` con el token de este bot nuevo). Va a ser un chat distinto al del
bot original.

### 6.2. Crear un token de GitHub para disparar el workflow

**Settings de tu cuenta de GitHub → Developer settings → Fine-grained tokens → Generate
new token.** Limitalo solo al repo `visa-checker`, con permiso **Actions: Read and
write**. Guardá el token generado.

### 6.3. Desplegar la función en Vercel

1. En [vercel.com](https://vercel.com), **Add New Project** → importá el repo
   `leandry9206/visa-checker`.
2. En **Root Directory**, elegí `telegram-webhook` (así Vercel ignora el resto del
   repo, incluida la dependencia de Playwright).
3. En **Environment Variables** del proyecto de Vercel, cargá:

   | Variable | Valor |
   |---|---|
   | `REVISAR_BOT_TOKEN` | Token del bot nuevo (paso 6.1) |
   | `TELEGRAM_CHAT_ID` | Chat id del bot nuevo (paso 6.1) |
   | `TELEGRAM_WEBHOOK_SECRET` | Cualquier cadena random que inventes (ej. generada con `openssl rand -hex 20`) |
   | `GITHUB_TOKEN` | El fine-grained token del paso 6.2 |
   | `GITHUB_OWNER` | `leandry9206` |
   | `GITHUB_REPO` | `visa-checker` |
   | `GITHUB_REF` | `claude/project-creation-faz9ja` (o `main` una vez que fusiones esta rama) |

4. Deploy. Anotá la URL que te da Vercel (ej. `https://visa-checker-xxxx.vercel.app`).

### 6.4. Registrar el webhook en Telegram

Con el token del bot nuevo y la URL de Vercel, abrí una vez en el navegador (o `curl`),
reemplazando `<TOKEN>`, `<URL>` y `<SECRET>` por los tuyos:

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=<URL>/api/revisar&secret_token=<SECRET>
```

Debería responder `{"ok":true,"result":true,...}`. A partir de ahí, mandarle
`/revisar` al bot nuevo dispara el workflow en segundos; el captcha y el estado
del trámite te siguen llegando por el bot original, sin cambios.

## Estructura del proyecto

```
run.js                       # flujo completo de una ejecución
telegram.js                  # sendMessage, sendPhoto, waitForReply (long-poll)
state.js                     # leer/escribir state.json
state.json                   # último estado, fecha de cambio/consulta y offset de Telegram (se versiona)
package.json
.github/workflows/monitor.yml
telegram-webhook/            # función Vercel para el comando /revisar (opcional, ver sección 6)
```

## Restricción de diseño

El captcha **siempre** lo resuelve una persona por Telegram. El código no implementa
ni implementará resolución automática (OCR, visión, servicios anti-captcha).
