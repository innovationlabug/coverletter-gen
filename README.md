# Cover letter con split brain — tres implementaciones

Tres personas del equipo construyeron, cada una por su cuenta, la misma app: un generador de **carta de interés**
que además entrega una **nota privada de negociación** salarial, con una arquitectura **split brain**
(una parte corre en el dispositivo de la persona y otra en la nube).

Cada carpeta es un proyecto independiente, con su propio README, pruebas, demo y artículo. Las tres
cumplen las mismas condiciones mínimas y cada una profundiza en un área distinta.

| Carpeta | Persona · área | Qué hace distinto | Demo | Artículo |
|---|---|---|---|---|
| [`luis/`](luis/) | Luis · **APIs** | Gemini + **Tavily** (investiga la empresa destino) + **JSearch** (salario de mercado). Documenta autenticación, fallas, costo y datos enviados de cada API. | [coverletter-luis.vercel.app](https://coverletter-luis.vercel.app) | [Tres APIs y un secreto](https://docs.google.com/document/d/1UZEGQl8GFLdBWTVXL1-3dNgW7zBD2fjXyxd5PWXmhUA/edit) |
| [`cathy/`](cathy/) | Cathy · **modelos locales** | **Ollama privado en Cloud Run con GPU L4** + heurísticas. Compara **Gemma 4 E2B vs Qwen 3.5 2B** en calidad, latencia y memoria (CPU y GPU). | [cathy-coverletter…run.app](https://cathy-coverletter-611681112050.us-central1.run.app) | [¿Un Ollama en la nube sigue siendo local?](https://docs.google.com/document/d/1ZR7J2gqSNL025JrLaMi--NN_nbui1wuwpNvb3y-VlE8/edit) |
| [`emily/`](emily/) | Emily · **aprendizajes** | **Gemma 4 E2B en el navegador** (transformers.js) + Gemini vía Firebase AI Logic con App Check. **18 casos de validación** de fugas y calidad, prueba didáctica del README y 3 temas de artículo. | [coverletter-emily.vercel.app](https://coverletter-emily.vercel.app) | [¿Cómo sé que mi app no filtra tu salario?](https://docs.google.com/document/d/1sAsfRQllg164OX_fE5ogyDlLKuEZYzil4UbPY0OPntA/edit) |

## El reto (resumen)

La persona cuenta su situación con franqueza: qué hace hoy, **cuánto gana**, qué quiere hacer, cuánto quiere
ganar y, si quiere, pega la oferta. La app devuelve:

1. **La carta de interés**, lista para enviar con el CV.
2. **Una nota privada de negociación**: qué tan realista es la expectativa y cuándo conviene mencionarla. Nunca sale del dispositivo.

Condiciones mínimas que cumplen las tres:

1. Al menos un componente local y un modelo en la nube, con el reparto justificado (privacidad, latencia, costo, disponibilidad, calidad).
2. **El salario actual nunca sale del dispositivo** — demostrado con una prueba automatizada.
3. Qué se envía a la nube lo decide **código explícito y testeable**, no un modelo.
4. **Sin conexión**, la app sigue entregando algo útil.

## Tres formas de hablar con Gemini

Además de su área, cada implementación usa un patrón de autenticación distinto hacia el mismo modelo
(`gemini-3.8-flash`), lo que sirve para comparar:

| | Dónde vive la credencial | Ventaja | Costo de la ventaja |
|---|---|---|---|
| Luis | API key en variables de entorno del servidor (Vercel) | Simple, cualquier backend | Hay que custodiar una key |
| Cathy | Service account de Cloud Run → Vertex AI (sin key) | Nada que filtrar; permisos por IAM | Atado a Google Cloud |
| Emily | Firebase AI Logic desde el navegador (sin servidor propio) | Cero backend | La config de Firebase es pública; se protege con App Check |

## Estructura

```
luis/    Next.js PWA (Vercel)                      — README, pruebas, docs/diagrams, docs/screenshots
cathy/   Next.js (Cloud Run) + ollama/ (GPU L4)    — README, BENCHMARK, pruebas, bench/
emily/   Vite PWA (Vercel) + eval/                 — README, VALIDACION, DIDACTICA, TEMAS, pruebas
```

Los artículos viven como Google Docs (enlazados arriba y desde el README de cada carpeta). Todos los diagramas
están hechos con *diagram-design* (`docs/diagrams/*.html` + `.png`).

## Infraestructura

| Pieza | Dónde |
|---|---|
| Luis y Emily | Vercel (`coverletter-luis`, `coverletter-emily`) |
| App de Cathy | Cloud Run `cathy-coverletter` (`us-central1`, proyecto `ai-experiments-487722`), cuenta de servicio propia |
| Ollama privado | Cloud Run `ollama-coverletter` con **GPU L4** en `europe-west4` (solo invocable por IAM), modelos horneados en la imagen, escala a cero |
| Gemini | `gemini-3.8-flash`: API key (Luis), Vertex AI (Cathy), Firebase AI Logic + App Check (Emily) |

Ninguna key vive en el repositorio: cada carpeta trae un `.env.example` y su README explica de dónde sale cada valor.
