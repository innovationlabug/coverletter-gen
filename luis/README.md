# Carta y copia — generador de cartas de interés "split-brain" (Luis · APIs)

PWA en Next.js (App Router, runtime Node) que, a partir de tu situación real —incluido tu salario actual—, genera:

1. **La carta de interés** (el "original"): lista para enviar junto al CV. La escribe Gemini con datos limpios y cita 1–2 hechos verificables de la empresa (con la URL de la fuente visible).
2. **La copia privada** (la "copia al carbón"): una nota de negociación que dice qué tan realista es tu expectativa frente a tu salario actual, frente al mercado (JSearch) y frente al rango de la oferta, y **cuándo** mencionarla. Se calcula en el navegador y **nunca sale de tu dispositivo**.

Además, la interfaz muestra el estado de cada API (ok, lento, falló, sin conexión, desde caché, bloqueado) y un panel **"Qué salió a la nube"** con el JSON exacto que tu navegador envió y lo que el servidor reenvió a cada proveedor. Es una app para enseñar, así que lo que viaja se ve.

## Qué hace

- Formulario: nombre, puesto actual, empleador actual, salario actual (GTQ/USD), puesto deseado, empresa destino, ubicación, salario deseado, años de experiencia, logros y oferta pegada (opcional).
- En paralelo consulta **Tavily** (investigación de la empresa) y **JSearch** (salario de mercado), luego pide la carta a **Gemini** con los hechos de Tavily ya limpios.
- La nota de negociación, el redactor, el cálculo de brecha salarial y la carta de respaldo corren **localmente**.
- **Sin conexión**: la app carga desde el service worker y entrega la nota (con el benchmark en caché, si lo hay) y una carta de plantilla.

## Qué corre dónde y por qué

![Arquitectura](docs/diagrams/arquitectura.png)

| Componente | Dónde | Tecnología | Razón |
|---|---|---|---|
| Redactor + validador (`src/lib/redact.ts`) | Navegador | TypeScript puro, regex deterministas | **Privacidad**: lo sensible se elimina antes de cualquier `fetch` |
| Router con allowlist (`src/lib/router.ts`) | Navegador | TypeScript puro | **Privacidad**: qué sale lo decide código probado, no un modelo |
| Brecha salarial + nota de negociación (`src/lib/negotiation.ts`) | Navegador | TypeScript puro | **Privacidad** (usa el salario actual), **latencia** (instantáneo), **costo** (cero tokens), **disponibilidad** (funciona offline) |
| Carta de respaldo (`src/lib/template.ts`) | Navegador | Plantilla determinista | **Disponibilidad**: offline o si Gemini falla |
| Caché de benchmark (`src/lib/apis/jsearch.ts`) | Navegador (localStorage, 7 días) | JSON | **Costo** (200 req/mes gratis) y **disponibilidad** offline |
| Carta final | Nube | Gemini `gemini-3.8-flash` vía `@google/genai` en `src/app/api/letter/route.ts` | **Calidad**: redacción natural en español, integra hechos de la empresa |
| Investigación de la empresa | Nube | Tavily Search API (API de IA) en `src/app/api/company/route.ts` | **Calidad**: hechos verificables con URL de fuente |
| Benchmark salarial de mercado | Nube | JSearch `/estimated-salary` (API no-IA) en `src/app/api/salary/route.ts` | **Calidad** de la nota: mínimo/mediana/máximo reales |
| App shell offline | Navegador | `public/sw.js` escrito a mano + `app/manifest.ts` | **Disponibilidad** |

Las tres API keys viven solo en el servidor (variables de entorno de Vercel / `.env.local`). El navegador nunca habla directo con Gemini, Tavily ni JSearch: habla con las tres rutas de la app, que validan otra vez y reenvían.

## Cómo se llama al componente local

Todo el "cerebro local" son funciones puras en `src/lib`. Se pueden usar desde la UI, desde tests o desde un script.

```ts
import { redactText, findSensitive, assertPayloadClean, contextFromProfile } from "@/lib/redact";
import { buildCloudPayload } from "@/lib/router";
import { buildNegotiationNote, findOfferRange } from "@/lib/negotiation";
import { buildTemplateLetter } from "@/lib/template";
import { generate } from "@/lib/generate";

const profile = {
  name: "Ana Lucía Pérez",
  currentRole: "Desarrolladora backend",
  currentEmployer: "Banco Industrial",
  currentSalary: 15000, currentCurrency: "GTQ",
  desiredRole: "Software Engineer",
  targetCompany: "Tigo Guatemala",
  location: "Guatemala",
  desiredSalary: 19000, desiredCurrency: "GTQ",
  yearsExperience: 5,
  achievements: "Bajé la latencia 40 %. Hoy gano Q15,000 en Banco Industrial.",
  jobOffer: "Salario: Q16,000 - Q22,000 mensuales",
} as const;

// 1. Redactor determinista
const ctx = contextFromProfile(profile);            // empleador, salarios y nombre a proteger
redactText("Gano Q15,000 en Banco Industrial", ctx).text;
// → "Gano [monto] en [empleador actual]"

// 2. Router: payload exacto por destino (lanza SensitiveDataError si queda algo)
buildCloudPayload(profile, "tavily").payload;   // { company, role }
buildCloudPayload(profile, "jsearch").payload;  // { jobTitle, location, yearsBucket }
buildCloudPayload(profile, "gemini", { facts }).payload;
// { desiredRole, targetCompany, yearsExperience, achievements (redactado), jobOffer (redactado), companyFacts }

// 3. Nota de negociación (local)
const note = buildNegotiationNote({ profile, benchmark /* opcional */ });
note.headline;        // "Realista: +27 % sobre tu salario actual"
note.sections;        // realismo, mercado, oferta, cuándo mencionarla, qué nunca va por escrito
findOfferRange(profile.jobOffer); // { min: 16000, max: 22000, currency: "GTQ", period: "MONTH", … }

// 4. Carta de respaldo (local)
buildTemplateLetter(profile).text;

// 5. Orquestador completo (lo que usa la UI)
const result = await generate(profile, {
  onStatus: (api, info) => console.log(api, info.status),
  onOutgoing: (rec) => console.log("salió:", rec.route, rec.body),
});
result.letter.source; // "gemini" | "template"
```

Reglas del validador (`findSensitive`): montos en todas sus formas (`Q15,000`, `Q 15 000`, `15000`, `15,000.00`, `15.000`, `$2,000`, `USD 2000`, `15 mil`, `15k`, `quince mil`, `2 millones`), el salario actual y el deseado **exactos** en cualquier formato (incluido un salario de 3 dígitos o dígitos pegados a otro texto), correos, teléfonos de Guatemala (8 dígitos, `+502`), DPI (13 dígitos, 4-5-4), NIT, el empleador actual (sin distinguir mayúsculas ni tildes, ignorando "S.A.") y tu nombre completo. Los años 1900–2099 no se consideran montos.

## Cómo se llama a cada API

Las tres pasan por el mismo helper del cliente, `fetchWithPolicy` (`src/lib/apis/policy.ts`): timeout con `AbortController`, **1 reintento** con backoff ante 429 / 5xx / error de red, sin reintento tras un timeout (si tardó una vez, reintentar solo duplica la espera: se usa el respaldo). Cada ruta del servidor tiene además su propio timeout hacia el proveedor, un poco menor, para responder un 504 limpio.

Códigos que devuelven nuestras rutas: `400` cuerpo inválido o con campos desconocidos (zod `.strict()`), `422` datos sensibles detectados en el servidor, `403` origen cruzado, `424` fallo no reintentable del proveedor (403, 401, sin key), `429` límite, `502` error del proveedor (reintentable), `504` el proveedor tardó.

### Gemini (`POST /api/letter` → `gemini-3.8-flash`)

- **Autenticación**: API key `GEMINI_API_KEY` en el entorno del servidor (Vercel / `.env.local`). El SDK `@google/genai` la envía en el header `x-goog-api-key`. Nunca llega al navegador.
- **Si falla o tarda**: timeout de 20 s en el cliente (18 s en el servidor). 429 o 5xx → un reintento. Si aun así falla, o no hay conexión → **carta de plantilla local**; la nota no se ve afectada. El chip muestra "falló", "lento, sin respuesta" o "sin conexión".
- **Costo**: tier gratuito disponible. En pago, `gemini-3.8-flash` cuesta US$0.75 por millón de tokens de entrada y US$3.75 por millón de salida hasta el 31 de diciembre de 2026 (US$1.50 / US$7.50 desde el 1 de enero de 2027). Una carta usa del orden de 1,500 tokens de entrada y ~1,000 de salida (incluido el razonamiento en nivel bajo): ≈ US$0.005 por carta. Precios verificados el 25 de septiembre de 2026 en <https://ai.google.dev/gemini-api/docs/pricing>.
- **Qué datos le envías** (exactamente): `desiredRole`, `targetCompany`, `yearsExperience`, `achievements` (redactado), `jobOffer` (redactado), `companyFacts[]` (`id`, `title`, `snippet` de Tavily, también redactados; **sin URLs**). No se envían: nombre (la firma `[[FIRMA]]` se reemplaza en el navegador), puesto actual, empleador actual, salario actual ni deseado.

### Tavily (`POST /api/company` → `https://api.tavily.com/search`)

- **Autenticación**: header `Authorization: Bearer $TAVILY_API_KEY`, variable de entorno del servidor.
- **Si falla o tarda**: timeout de 8 s (7 s en el servidor), un reintento en 429/5xx/red. Si falla → la carta se escribe **sin hechos de la empresa** (Gemini recibe `companyFacts: []` y tiene prohibido inventarlos).
- **Costo**: 1 crédito por búsqueda `basic`; 1,000 créditos gratis al mes; pago por uso US$0.008 por crédito.
- **Qué datos le envías**: del navegador a la ruta, `{ company, role }`. La ruta arma `{ query: "<empresa>: qué hace la empresa, productos, cultura y noticias recientes (contexto: puesto de <rol>)", max_results: 3, search_depth: "basic" }`. Nada más.

### JSearch (`POST /api/salary` → `GET https://api.openwebninja.com/jsearch/estimated-salary`)

- **Autenticación**: header `x-api-key: $JSEARCH_API_KEY`, variable de entorno del servidor.
- **Si falla o tarda**: timeout de 6 s (5 s en el servidor), un reintento en 429/5xx/red. Un 403 ("You are not subscribed to this API") se traduce a `424 not_subscribed` y **no se reintenta**. Si falla → la nota se genera **sin benchmark de mercado** y dice por qué. Los resultados se guardan 7 días en `localStorage` y se usan primero (también offline): el chip muestra "desde caché" y no se gasta cuota.
- **Costo**: plan gratuito de 200 solicitudes al mes (límite duro); Pro US$25 por 10,000 solicitudes.
- **Qué datos le envías**: del navegador, `{ jobTitle, location, yearsBucket }`. La ruta llama con `job_title`, `location`, `location_type=ANY` y `years_of_experience` (uno de `LESS_THAN_ONE`, `ONE_TO_THREE`, `FOUR_TO_SIX`, `SEVEN_TO_NINE`, `TEN_TO_FOURTEEN`, `ABOVE_FIFTEEN`, calculado de tus años). La respuesta se normaliza a mensual (`YEAR`/12, `HOUR`×173.3, …) y a GTQ con el tipo de cambio fijo de `src/config/constants.ts` (7.75 GTQ/USD). En la nota se muestran fuente, cantidad de salarios, confianza y fecha de actualización.

## Qué es sensible y cómo se prueba

| Dato | Tratamiento |
|---|---|
| Salario actual | **Nunca sale.** Solo lo usa `negotiation.ts`. Si aparece en texto libre, se redacta; si aparece en un campo estructurado, el envío se bloquea. |
| Salario deseado | Tampoco sale: la carta no menciona cifras y JSearch no lo necesita. |
| Empleador actual | Nunca sale. Si la empresa destino es tu empleador actual, Tavily y Gemini se **bloquean** y se usa la plantilla (decisión explícita: preferimos no enviarlo a adivinar si es una postulación interna). |
| Tu nombre | No sale: la firma se pone en el navegador. |
| Puesto actual | No sale; solo lo usa la plantilla local. |
| Correos, teléfonos, DPI, NIT, montos en logros / oferta / hechos de Tavily | Se redactan a `[correo]`, `[teléfono]`, `[DPI]`, `[NIT]`, `[monto]`, `[empleador actual]`. |

Pruebas:

- `tests/redact.test.ts`: decenas de formatos de salario, teléfonos, DPI, NIT, correos y empleador con tildes.
- `tests/router.test.ts`: allowlist exacta por destino, redacción en texto libre y bloqueo de residuos en campos estructurados.
- `tests/leak.test.ts`: **la prueba de la condición 2.** Mockea `fetch` global, ejecuta `generate()` con las **rutas reales** en el medio y captura cada solicitud en los dos saltos (navegador → ruta y ruta → Tavily/JSearch/Gemini). Busca el salario actual y el deseado en todas sus formas escritas, el empleador (sin tildes) y el nombre. Incluye un perfil con el salario pegado en "logros" (se redacta) y uno con empresa destino = empleador (se bloquea). Se verificó que la prueba **falla** si se desactiva la redacción del router.
- `tests/apis-failure.test.ts`: timeouts, 429 → reintento → éxito, 500 dos veces → plantilla, 403 de JSearch → nota sin benchmark, offline → plantilla, caché de 7 días y `localStorage` que lanza excepciones.
- `e2e/app.spec.ts` (Playwright contra `next build && next start`): formulario → carta + nota con las rutas mockeadas; `context.setOffline(true)` + recarga → la app carga desde el service worker y entrega nota + plantilla; benchmark desde caché offline; JSearch 403 → chip "falló".

## Cómo correr la app

```bash
cd luis
npm i
cp .env.example .env.local   # y pon GEMINI_API_KEY, TAVILY_API_KEY, JSEARCH_API_KEY
npm run dev                  # http://localhost:3000
```

El service worker solo se registra en build de producción (`npm run build && npm start`); en `next dev` cachearía chunks viejos.

Despliegue: Vercel con los valores por defecto de Next.js (no hace falta `vercel.json`). Configura las tres variables de entorno en el proyecto de Vercel.

## Cómo correr las pruebas

```bash
npm test                          # vitest: unitarias, leak test y fallas de API
npx playwright install chromium   # la primera vez
npm run e2e                       # Playwright: build de producción + online/offline
npm run lint && npm run typecheck
```

## Limitaciones conocidas

- **Sobre-redacción**: cualquier número de 4+ dígitos que no parezca año, o cifras con "mil"/"k"/"millones", se trata como monto. "Atendí 1500 clientes" o "8 millones de usuarios" (en un hecho de Tavily) llegan a Gemini como `[monto]`. Es deliberado: preferimos perder un dato a filtrar un salario. "Q4" (trimestre) también se redacta.
- El redactor no entiende contexto: un salario escrito de forma muy creativa ("quince mil y pico", "uno cinco cero cero cero") puede escapar a la redacción del texto libre. El salario exacto en cifras sí se detecta en cualquier formato, y en los campos estructurados cualquier residuo bloquea el envío.
- El servidor no conoce tu salario ni tu empleador (nunca los recibe), así que su segunda validación es genérica (montos, correos, teléfonos, DPI, NIT).
- Tipo de cambio fijo (7.75 GTQ/USD): suficiente para bandas de 10–30 %, no para contabilidad.
- JSearch tiene pocos datos para algunos puestos en Guatemala; con muestras pequeñas la nota lo advierte. El plan gratuito es de 200 solicitudes al mes: por eso la caché de 7 días se usa también en línea.
- Las rutas `/api/*` son públicas: solo rechazan llamadas desde otro origen del navegador. Para producción real faltaría rate limiting (p. ej. Vercel Firewall).
- Los hechos de Tavily vienen de la web y pueden ser imprecisos; por eso la carta muestra la URL de cada fuente citada para que la verifiques.
- La carta de plantilla es correcta pero genérica.
- El formulario no se guarda (a propósito: no queremos tu salario ni en `localStorage`). Al recargar hay que volver a llenarlo.
