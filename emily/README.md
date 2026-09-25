# Emily · carta de interés sin contar lo que ganás

Generador de **cartas de interés** con una **nota privada de negociación**, construido como PWA
(Vite + TypeScript). Contás tu situación con franqueza, incluido tu salario actual, y la app:

1. escribe la carta (tres versiones para comparar: **borrador local**, **carta de la nube** y **plantilla**);
2. arma una **nota privada** que dice qué tan realista es tu expectativa y cuándo mencionarla;
3. muestra en un panel **"Qué salió a la nube"** el texto exacto que se envió, con lo que se tachó.

**Tu salario actual nunca sale del dispositivo**, y eso lo prueba una prueba automática
(`tests/leak.test.ts`). La evaluación de 18 casos está en [`VALIDACION.md`](VALIDACION.md).

> Esta es la versión de **Emily** (enfoque: validación y didáctica) de un ejercicio con tres
> implementaciones independientes (`../luis`, `../cathy`). Nada de esta carpeta depende de las otras.

---

## Índice

1. [Qué corre dónde y por qué](#1-qué-corre-dónde-y-por-qué)
2. [Requisitos previos](#2-requisitos-previos-versiones-exactas)
3. [Correr la app paso a paso](#3-correr-la-app-paso-a-paso)
4. [Pruebas](#4-pruebas)
5. [Evaluación (18 casos)](#5-evaluación-18-casos)
6. [Cómo se llama al modelo local](#6-cómo-se-llama-al-modelo-local)
7. [Cómo se llama a Gemini con Firebase AI Logic](#7-cómo-se-llama-a-gemini-con-firebase-ai-logic)
8. [Qué es sensible y cómo se demuestra](#8-qué-es-sensible-y-cómo-se-demuestra)
9. [Funcionamiento sin conexión](#9-funcionamiento-sin-conexión)
10. [Estructura del proyecto](#10-estructura-del-proyecto)
11. [Despliegue](#11-despliegue)
12. [Solución de problemas](#12-solución-de-problemas)

---

## 1. Qué corre dónde y por qué

![Arquitectura](docs/diagrams/arquitectura.png)

| Componente | Dónde corre | Tecnología | Por qué ahí |
|---|---|---|---|
| Formulario, **redactor** de datos sensibles, **router** (qué sale a la nube), **nota de negociación**, **carta plantilla** | Navegador (hilo principal) | TypeScript puro (`src/lib/`) | **Privacidad**: el salario y el empleador no necesitan salir para calcular la nota. **Disponibilidad**: funciona sin internet. **Costo**: cero. |
| **Borrador local** de la carta | Navegador, dentro de un **Web Worker** | [transformers.js](https://huggingface.co/docs/transformers.js) 4.3.0 con `onnx-community/gemma-4-E2B-it-qat-mobile-ONNX` (q2f16), WebGPU con respaldo WASM | **Privacidad**: recibe el perfil completo porque nada sale del equipo. **Disponibilidad**: una vez descargado funciona offline. **Costo**: cero por carta. |
| **Carta de la nube** | Google (Gemini) | `gemini-3.8-flash` vía **Firebase AI Logic** (`firebase/ai`, `GoogleAIBackend`), sin servidor propio | **Calidad**: el modelo grande escribe mejor (ver [`VALIDACION.md`](VALIDACION.md)). Recibe **solo** lo que decide el router, ya tachado. |

Criterios del ejercicio que cubre esta división: **privacidad**, **disponibilidad**, **costo** y **calidad**.

El flujo de un clic en **"Preparar carta y nota"** (`src/lib/orchestrator.ts`):

1. **Local, siempre:** nota de negociación + carta plantilla (instantáneo, también offline).
2. **Router** (`src/lib/router.ts` → `buildCloudPayload(profile)`): lista blanca de campos → redactor → compuerta final.
3. Si la compuerta no encontró nada y hay conexión: **nube** (`src/lib/cloud.ts`) → la carta vuelve con `{{NOMBRE}}` y el nombre se pone **en el dispositivo**.
4. **Borrador local** (si el modelo está descargado): el worker escribe la carta con el perfil completo.

## 2. Requisitos previos (versiones exactas)

Probado con estas versiones en macOS 26 (Apple Silicon). Versiones más nuevas probablemente funcionen, pero estas son las verificadas:

| Herramienta | Versión probada | Para qué | Cómo verificar |
|---|---|---|---|
| Node.js | **24.21.0** (mínimo 20.19) | todo | `node -v` |
| npm | **12.0.2** | instalar dependencias | `npm -v` |
| Chromium de Playwright | build **1243** (viene con `@playwright/test` 1.63.0) | pruebas e2e | `npx playwright install chromium` |
| Firebase CLI | 15.6.0 (opcional) | obtener la configuración web | `firebase --version` |
| Google Cloud CLI | 548.0.0 (solo para `npm run eval` completo) | credenciales ADC para Vertex AI | `gcloud --version` |
| Navegador para usar la app | Chrome/Edge 113+ (WebGPU) | borrador local rápido | `chrome://gpu` → "WebGPU: Hardware accelerated" |

Dependencias principales (fijadas en `package-lock.json`): `@huggingface/transformers` 4.3.0 · `firebase` 12.19.0 · `vite` 8.3.1 · `vite-plugin-pwa` 1.3.0 · `vitest` 5.0.2 · `@playwright/test` 1.63.0 · `@google/genai` 2.24.0 · `typescript` 7.0.2 · `tsx` 4.23.15.

Espacio en disco: ~700 MB para `node_modules`; **2.3 GB** adicionales si descargás el modelo local (en el navegador y, aparte, en `.cache/transformers` si corrés la evaluación completa).

## 3. Correr la app paso a paso

Todos los comandos se corren **dentro de la carpeta `emily/`**.

```bash
cd emily
npm ci                     # instala exactamente lo del package-lock.json
cp .env.example .env.local # crea tu archivo de configuración local (no se sube a git)
```

### 3.1 Configurar Firebase (para la carta de la nube)

La app necesita la configuración web de la app de Firebase **`coverletter-emily`** del proyecto
**`viaticos-spending-mngmt`**. Esos valores **no están en el repositorio**: se leen de variables de entorno de Vite.

```bash
firebase login                                              # si no lo has hecho
firebase apps:list WEB --project viaticos-spending-mngmt    # copiá el App ID de "coverletter-emily"
firebase apps:sdkconfig WEB <APP_ID> --project viaticos-spending-mngmt
```

El último comando imprime un objeto `firebaseConfig`. Copiá cada valor a `.env.local`:

| Campo de `firebaseConfig` | Variable en `.env.local` |
|---|---|
| `apiKey` | `VITE_FIREBASE_API_KEY` |
| `authDomain` | `VITE_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `VITE_FIREBASE_PROJECT_ID` |
| `storageBucket` | `VITE_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `VITE_FIREBASE_MESSAGING_SENDER_ID` |
| `appId` | `VITE_FIREBASE_APP_ID` |
| `measurementId` | `VITE_FIREBASE_MEASUREMENT_ID` |

> La `apiKey` de Firebase web identifica la app, no autoriza nada por sí sola; aun así, por regla
> del proyecto no se commitea. La protección contra abuso es **App Check** (siguiente paso).

### 3.2 App Check (obligatorio para la carta de la nube en este proyecto)

El proyecto de Firebase tiene **App Check en modo obligatorio** para Firebase AI Logic. Sin App Check
la carta de la nube falla con `401 Firebase App Check token is invalid` (el resto de la app funciona igual).
Hay dos opciones:

- **Desarrollo local (token de depuración):**
  1. Consola de Firebase → *App Check* → pestaña *Apps* → `coverletter-emily` → menú ⋮ → *Administrar tokens de depuración* → *Agregar token de depuración* → *Generar* y copiarlo.
  2. En `.env.local`: `VITE_APPCHECK_DEBUG_TOKEN=<el token>`.
  3. Solo lo usa `npm run dev`; un build de producción lo ignora.
- **Producción (reCAPTCHA Enterprise, recomendado):**
  1. Habilitar la API *reCAPTCHA Enterprise* en el proyecto de Google Cloud de Firebase y crear una clave de sitio web con los dominios de la app (p. ej. `*.vercel.app` y `localhost`).
  2. Firebase → *App Check* → `coverletter-emily` → registrar el proveedor *reCAPTCHA Enterprise* con esa clave.
  3. `VITE_RECAPTCHA_ENTERPRISE_KEY=<clave de sitio>` en `.env.local` y en las variables de entorno de Vercel.
  4. Dejar la **aplicación obligatoria** de App Check activada para *Firebase AI Logic*: sin ella cualquiera podría usar tu cuota de Gemini con la configuración pública de la app.

La franja de estado de la app muestra el modo: *Nube: Gemini (sin App Check)*, *(App Check de desarrollo)* o *con App Check*.

### 3.3 Arrancar

```bash
npm run dev
```

Abrí **http://localhost:5173**. Probá así:

1. Tocá **"Usar un ejemplo"** (perfil ficticio) y luego **"Preparar carta y nota"**.
2. Verás la **plantilla** y la **nota privada** al instante, y la **carta de la nube** si configuraste Firebase + App Check.
3. En **"Qué salió a la nube"** abrí *Texto exacto enviado*: no aparece `Q15,000`, ni "Banco Industrial", ni "Ana López".
4. En **"Modelo en tu dispositivo"** tocá **"Descargar modelo (2.32 GB)"**. La primera vez tarda (depende de tu conexión); después queda en caché y el borrador local se escribe solo.

Sin `.env.local` la app arranca igual: dice *"Nube sin configurar"* y ofrece plantilla, nota y borrador local.

## 4. Pruebas

```bash
npm test                         # vitest: unitarias + prueba de fugas (≈2 s, sin red)
npx playwright install chromium  # solo la primera vez
npm run test:e2e                 # Playwright contra `vite build && vite preview` (≈30 s)
npm run typecheck                # TypeScript estricto
```

| Archivo | Qué prueba |
|---|---|
| `tests/unit/redact.test.ts` | cada tipo del redactor (montos en todas sus formas, correo, teléfono GT, DPI, NIT, direcciones, empleador con tildes/acrónimo/typos, personas) + regresiones encontradas por la evaluación |
| `tests/unit/router.test.ts` | lista blanca, qué sale y qué no, registro de tachaduras, compuerta final |
| `tests/unit/negotiation.test.ts` | brecha %, bandas, conversión USD↔GTQ, rango de la oferta (regex), reglas de cuándo mencionarlo |
| `tests/unit/template.test.ts` | carta plantilla (250–400 palabras, sin datos sensibles) y verificaciones de carta |
| `tests/leak.test.ts` | **orquestador completo** para 4 perfiles, con (A) el límite de la nube espiado y (B) el SDK real de Firebase con `fetch` simulado: el salario en todas sus formas y el empleador nunca aparecen en lo que sale |
| `tests/e2e/app.spec.ts` | flujo completo en desktop y móvil (nube interceptada, modelo local simulado), bloqueo por la compuerta, y **`context.setOffline(true)` + recarga** → nota y plantilla siguen funcionando |

Las e2e usan un build especial (`VITE_TEST_MODE=1`) donde el modelo local es un sustituto instantáneo
(no descarga 2.3 GB) y el endpoint de Firebase AI Logic se intercepta con `page.route`, de modo que corre
el SDK real pero ninguna petición llega a Google. No necesitan `.env.local`.

## 5. Evaluación (18 casos)

```bash
npm run eval -- --leaks-only   # solo fugas y falsos positivos, sin modelos (≈1 s)
gcloud auth application-default login   # una vez, para Vertex AI
npm run eval                   # completa: fugas + cartas local/nube/plantilla + juez (≈35 min la primera vez)
```

- Casos: `eval/fixtures/*.json` (perfil + `canaries` con tipo y dificultad + `allowed`).
- Criterios de calidad y sesgos del juez: [`eval/CRITERIOS.md`](eval/CRITERIOS.md).
- Resultados crudos: `eval/results/<fecha>.json`. Reporte: **[`VALIDACION.md`](VALIDACION.md)** (se regenera solo; también con `npm run eval:report`).
- Opciones: `--only=01,07` · `--device=cpu` · `--fresh` (ignora la caché de cartas en `.cache/eval-letters`) · `--skip-local` · `--skip-cloud` · `--skip-judge`.
- La primera corrida completa descarga el modelo local a `.cache/transformers` (2.3 GB).
- La nube de la evaluación usa **Vertex AI** (`@google/genai`, proyecto `ai-experiments-487722`, región `global`) con el **mismo modelo y el mismo prompt** que la app, porque Firebase AI Logic es un SDK de navegador protegido con App Check. Si tu cuenta no tiene acceso a ese proyecto, cambiá `VERTEX.project` en `eval/lib/letters.ts`.

## 6. Cómo se llama al modelo local

El modelo vive en un **Web Worker** (`src/worker/local-llm.worker.ts`) para no congelar la página.
La página lo usa con un cliente pequeño (`src/lib/local-llm-client.ts`):

```ts
import { createLocalLlm } from './lib/local-llm-client';
import { buildLetterPrompt, localLetterInput } from './lib/prompt';

const llm = createLocalLlm({
  onEvent: (e) => {
    if (e.type === 'progress') console.log(`${(e.loaded / 1e9).toFixed(2)} / ${(e.total / 1e9).toFixed(2)} GB`);
    if (e.type === 'ready') console.log('listo en', e.device); // 'webgpu' o 'wasm'
  },
});

await llm.load(); // descarga ~2.3 GB la primera vez; después sale de Cache Storage
const carta = await llm.generate(buildLetterPrompt(localLetterInput(perfil)), (trozo) => mostrar(trozo));
```

Protocolo de mensajes (`src/worker/protocol.ts`):

| Página → worker | Worker → página |
|---|---|
| `{ type: 'load' }` | `{ type: 'device', device }` · `{ type: 'progress', loaded, total, progress }` · `{ type: 'ready', device, loadMs }` |
| `{ type: 'generate', id, prompt: { system, user } }` | `{ type: 'token', id, text }` (streaming) · `{ type: 'done', id, text, ms }` · `{ type: 'error', id?, message }` |

La misma función que usa el worker (`createLocalGenerator` en `src/lib/local-model.ts`) funciona en Node, así la usa la evaluación:

```ts
import { createLocalGenerator } from './src/lib/local-model';
const gen = await createLocalGenerator({ device: 'webgpu' }); // o 'cpu'
const texto = await gen.generate({ system: '…', user: '…' });
```

Detalle no obvio: el repositorio ONNX trae la plantilla de chat como `chat_template.jinja`, que el
tokenizador del pipeline `text-generation` no lee. `createLocalGenerator` la obtiene con
`Gemma4Processor.from_pretrained()` y la pasa explícitamente (ver `docs/decisiones.md`).

## 7. Cómo se llama a Gemini con Firebase AI Logic

Todo está en `src/lib/firebase.ts` (inicialización perezosa + App Check) y `src/lib/cloud.ts`
(el único módulo que habla con la nube; recibe un prompt ya armado, **nunca el perfil**):

```ts
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';

const app = initializeApp(firebaseConfig);                         // valores de VITE_FIREBASE_*
// (opcional pero recomendado) initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(key) })
const ai = getAI(app, { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, {
  model: 'gemini-3.8-flash',
  systemInstruction: prompt.system,
  generationConfig: { temperature: 0.7, topP: 0.95, maxOutputTokens: 4096 },
});
const result = await model.generateContent(prompt.user);  // prompt = buildCloudPayload(perfil).prompt
console.log(result.response.text());
```

No hay servidor propio ni llave en el código: la petición va del navegador a
`firebasevertexai.googleapis.com`, autenticada con la configuración de la app y el token de App Check.

## 8. Qué es sensible y cómo se demuestra

| Dato | Tratamiento | Prueba |
|---|---|---|
| **Salario actual** (campo) | Nunca se copia al payload (no está en la lista blanca). Lo usa solo la nota local. | `tests/leak.test.ts`, `tests/unit/router.test.ts`, e2e, evaluación |
| Salario escrito en texto libre (`Q15,000`, `Q 15 000`, `15.000`, `15000`, `$2,000`, `USD 2000`, `15 mil`, `15k`, `quince mil`) | Redactor → `[SALARIO]`; la compuerta además busca el salario **conocido** del usuario en todas sus formas y bloquea si aparece | `tests/unit/redact.test.ts`, `tests/leak.test.ts` |
| **Empleador actual** | Campo excluido; en texto libre se tacha (sin mayúsculas ni tildes, acrónimo, alias entre paréntesis, sin espacios, con un error de dedo) → `[EMPLEADOR_ACTUAL]` | ídem |
| Nombres de terceros ("mi jefa Ana López", "Lic. …") | → `[PERSONA]` | `tests/unit/redact.test.ts` |
| Tu nombre | Viaja como `{{NOMBRE}}` y se restituye en el dispositivo | `tests/leak.test.ts` |
| Correos, teléfonos GT (8 dígitos, +502), DPI (4-5-4), NIT, direcciones (zona N, calle, avenida, colonia, km…) | → `[CORREO]`, `[TELÉFONO]`, `[DPI]`, `[NIT]`, `[DIRECCIÓN]` | `tests/unit/redact.test.ts` |
| Salario deseado | Solo lo usa la nota local; la carta nunca menciona cifras | `tests/unit/router.test.ts` |

Lo que decide qué sale es **código explícito y probado** (`buildCloudPayload`), no un modelo. El redactor
es determinista (expresiones regulares y comparación de texto): tiene límites conocidos y medidos
— ver la tabla de fugas por tipo en [`VALIDACION.md`](VALIDACION.md) — y por eso la app muestra
siempre el texto exacto enviado y permite desmarcar la nube.

No se guarda nada en `localStorage`: al recargar, el formulario queda vacío.

## 9. Funcionamiento sin conexión

- **App shell**: el service worker de `vite-plugin-pwa` precachea HTML, JS, CSS, fuentes e íconos.
- **Modelo local**: transformers.js lo guarda en *Cache Storage* (`transformers-cache`) la primera vez, junto con el runtime de ONNX (que baja de `cdn.jsdelivr.net`; es un archivo estático, no lleva datos tuyos).
- **Sin conexión y sin modelo descargado**: nota de negociación + carta plantilla.
- **Sin conexión y con el modelo descargado**: además, el borrador local.

## 10. Estructura del proyecto

```
emily/
├── index.html                  # maquetación de la página
├── src/
│   ├── main.ts                 # UI (vanilla TS)
│   ├── styles.css
│   ├── firebase-config.ts      # lee VITE_FIREBASE_* (sin valores en el repo)
│   ├── lib/
│   │   ├── types.ts  money.ts  text.ts
│   │   ├── redact.ts           # redactor determinista
│   │   ├── router.ts           # buildCloudPayload: lista blanca + redactor + compuerta
│   │   ├── prompt.ts           # constructor de prompt ÚNICO (local, nube y evaluación)
│   │   ├── negotiation.ts      # nota privada (reglas fijas)
│   │   ├── template.ts         # carta plantilla
│   │   ├── letter-checks.ts    # verificaciones deterministas de la carta
│   │   ├── orchestrator.ts     # un clic: nota + plantilla + nube
│   │   ├── cloud.ts  firebase.ts          # Firebase AI Logic + App Check
│   │   └── local-model.ts  local-model-meta.ts  local-llm-client.ts
│   ├── worker/                 # Web Worker del modelo local
│   └── ui/example.ts           # perfil de ejemplo (ficticio)
├── tests/                      # vitest (unit + leak) y Playwright (e2e)
├── eval/                       # evaluación: fixtures, run.ts, report.ts, CRITERIOS.md, results/
├── scripts/                    # verificaciones manuales (modelo en Node/navegador, llamada real a la nube, íconos)
├── docs/decisiones.md          # decisiones y errores reales
└── VALIDACION.md               # reporte generado por la evaluación
```

## 11. Despliegue

Es un sitio estático: `npm run build` genera `dist/`. En Vercel: framework *Vite*, comando `npm run build`,
salida `dist`, y las variables `VITE_FIREBASE_*` (+ `VITE_RECAPTCHA_ENTERPRISE_KEY`) en *Environment Variables*.
**No** definas `VITE_APPCHECK_DEBUG_TOKEN` en Vercel. `vercel.json` evita que el service worker quede cacheado.

## 12. Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| La carta de la nube dice `401 … Firebase App Check token is invalid` | El proyecto exige App Check para Firebase AI Logic | Sección [3.2](#32-app-check-obligatorio-para-la-carta-de-la-nube-en-este-proyecto): token de depuración en dev o reCAPTCHA Enterprise en producción |
| La franja dice *"Nube sin configurar"* | Falta `.env.local` o alguna `VITE_FIREBASE_*` | Paso [3.1](#31-configurar-firebase-para-la-carta-de-la-nube); reiniciá `npm run dev` después de editar `.env.local` |
| `npm ci` muestra *"install scripts blocked"* (npm 12) | npm 12 bloquea scripts de instalación por defecto | No hace falta aprobarlos: `onnxruntime-node` y `esbuild` ya traen sus binarios. Si algo falla, `npm install-scripts approve <paquete>` |
| `npm ci` falla con `EACCES … _cacache` | Caché de npm con permisos de otro usuario | `npm ci --cache /tmp/npm-cache` (o arreglá los permisos de `~/.npm`) |
| El modelo local dice *WASM, más lento* | El navegador no tiene WebGPU | Usá Chrome/Edge reciente; revisá `chrome://gpu`. En WASM funciona pero puede tardar minutos por carta |
| La descarga del modelo se corta o no avanza | Conexión inestable, o recargaste la página (en `npm run dev`, guardar un archivo recarga la página y mata el worker) | Volvé a tocar "Descargar modelo": los archivos ya completos quedan en caché |
| `Cannot use apply_chat_template() because tokenizer.chat_template is not set` | Usar el pipeline de transformers.js directamente con este repo ONNX | Usá `createLocalGenerator` (carga la plantilla con `Gemma4Processor`) |
| `npm run test:e2e` dice que falta el navegador | Chromium de Playwright no instalado | `npx playwright install chromium` |
| `npm run test:e2e` dice que el puerto 4173 está ocupado | Otro `vite preview` corriendo | Cerralo (`lsof -i :4173`) |
| `npm run eval` falla con `Could not load the default credentials` | Falta ADC | `gcloud auth application-default login` |
| `npm run eval` muestra `429 RESOURCE_EXHAUSTED` | Cuota de Vertex compartida | Se reintenta solo con espera exponencial; si persiste, esperá unos minutos (las cartas ya generadas quedan en caché) |
| `npm run eval` tarda mucho en *local* | Corre en CPU (sin WebGPU en Node) | Es normal: ~1.4 tokens/s en CPU vs ~22 en WebGPU en un Mac M-series. Podés usar `--skip-local` |
| La prueba offline falla en e2e | El service worker no llegó a controlar la página | La prueba espera `controllerchange`; si cambiaste `vite.config.ts`, verificá que `registerType: 'autoUpdate'` siga activo |
