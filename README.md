# Cover letter con split brain — tres implementaciones

> **Nota sobre autoría y entregas del equipo:**  
> Las tres implementaciones contenidas en las carpetas de este repositorio ([`luis/`](luis/), [`cathy/`](cathy/) y [`emily/`](emily/)) corresponden a la **implementación inicial de referencia** desarrollada por **Adrian ([@ykro](https://github.com/ykro))** para explorar y validar las tres áreas del reto.  
> Posteriormente, cada integrante del equipo construyó y entregó su propia implementación en su respectivo repositorio. Abajo encontrarás los enlaces directos al repositorio de cada integrante, junto con el **reporte interactivo de análisis global** y los **reportes detallados de evaluación** de cada entrega.

## Entregas del equipo y reportes de evaluación

- 📊 **[Ver Reporte Global Interactivo (Comparativa + Simulador + Oportunidades de Mejora)](https://htmlpreview.github.io/?https://github.com/innovationlabug/coverletter-gen/blob/main/evaluaciones/reporte_final_interactivo_split_brain.html)** · *([archivo HTML en el repo](evaluaciones/reporte_final_interactivo_split_brain.html))*

| Integrante | Área de profundidad | Repositorio entregado | Demo / Artículo | Reporte de evaluación detallado |
|---|---|---|---|---|
| **Cathy** | **Modelos locales** (Ollama: Gemma 3 vs Qwen 3 + heurísticas) | [CatherineBatres/carta-split-brain](https://github.com/CatherineBatres/carta-split-brain) | [Artículo en el repo](https://github.com/CatherineBatres/carta-split-brain/blob/main/docs/articulo.md) | [Abrir reporte interactivo](https://htmlpreview.github.io/?https://github.com/innovationlabug/coverletter-gen/blob/main/evaluaciones/reporte_evaluacion_cathy.html) · *([HTML](evaluaciones/reporte_evaluacion_cathy.html))* |
| **Luis** | **APIs externas** (Gemini + Serper + Enrich Layer) | [cuprumbot/cover-letter-local](https://github.com/cuprumbot/cover-letter-local) | [Demo en Vercel](https://cover-letter-six-eta.vercel.app/) · [Artículo en Substack](https://cuprumbot.substack.com/p/split-brain-division-de-tareas-para) | [Abrir reporte interactivo](https://htmlpreview.github.io/?https://github.com/innovationlabug/coverletter-gen/blob/main/evaluaciones/reporte_evaluacion_luis.html) · *([HTML](evaluaciones/reporte_evaluacion_luis.html))* |
| **Emily** | **Aprendizajes, validación y didáctica** (15 casos + README) | [EmilyCurin/CoverLetter](https://github.com/EmilyCurin/CoverLetter) | [Artículo en el repo](https://github.com/EmilyCurin/CoverLetter/blob/main/ARTICLE.md) | [Abrir reporte interactivo](https://htmlpreview.github.io/?https://github.com/innovationlabug/coverletter-gen/blob/main/evaluaciones/reporte_evaluacion_emily.html) · *([HTML](evaluaciones/reporte_evaluacion_emily.html))* |

---

## Implementaciones de referencia en este repositorio (`@ykro`)

Tres personas del equipo construyeron, cada una por su cuenta, la misma app: un generador de **carta de interés**
que además entrega una **nota privada de negociación** salarial, con una arquitectura **split brain**
(una parte corre en el dispositivo de la persona y otra en la nube).

Cada carpeta es un proyecto independiente, con su propio README, pruebas, demo y artículo. Las carpetas llevan el nombre de quien la construyó; los productos tienen nombre propio y ninguna interfaz muestra al autor. Las tres
cumplen las mismas condiciones mínimas y cada una profundiza en un área distinta.

| Carpeta | Persona · área | Producto | Qué hace distinto | Demo | Artículo |
|---|---|---|---|---|---|
| [`luis/`](luis/) | Luis · **APIs** | **Carta y copia** | Gemini + **Tavily** (investiga la empresa destino) + **JSearch** (salario de mercado). Documenta autenticación, fallas, costo y datos enviados de cada API. | [carta-y-copia.vercel.app](https://carta-y-copia.vercel.app) | [Tres APIs y tu salario](https://docs.google.com/document/d/1UZEGQl8GFLdBWTVXL1-3dNgW7zBD2fjXyxd5PWXmhUA/edit) |
| [`cathy/`](cathy/) | Cathy · **modelos locales** | **Rango** | **Ollama privado en Cloud Run con GPU L4** + heurísticas. Compara **Gemma 4 E2B vs Qwen 3.5 2B** en calidad, latencia y memoria (CPU y GPU). | [rango…run.app](https://rango-611681112050.us-central1.run.app) | [Gemma o Qwen](https://docs.google.com/document/d/1ZR7J2gqSNL025JrLaMi--NN_nbui1wuwpNvb3y-VlE8/edit) |
| [`emily/`](emily/) | Emily · **aprendizajes** | **Sobre** | **Gemma 4 E2B en el navegador** (transformers.js) + Gemini vía Firebase AI Logic con App Check. **18 casos de validación** de fugas y calidad, prueba didáctica del README y 3 temas de artículo. | [sobre-carta.vercel.app](https://sobre-carta.vercel.app) | [78 datos privados ficticios](https://docs.google.com/document/d/1sAsfRQllg164OX_fE5ogyDlLKuEZYzil4UbPY0OPntA/edit) |

## El reto (resumen)

Enunciado completo: [ENUNCIADO.md](ENUNCIADO.md).

La persona cuenta su situación con franqueza: qué hace hoy, **cuánto gana**, qué quiere hacer, cuánto quiere
ganar y, si quiere, pega la oferta. La app devuelve:

1. **La carta de interés**, lista para enviar con el CV.
2. **Una nota privada de negociación**: qué tan realista es la expectativa y cuándo conviene mencionarla. Nunca sale del dispositivo.

Condiciones mínimas:

1. Al menos un componente local y un modelo en la nube, con el reparto justificado (privacidad, latencia, costo, disponibilidad, calidad).
2. **El salario actual nunca sale del dispositivo** — demostrado con una prueba automatizada. Rango (Cathy) lo reinterpreta a propósito: su Ollama corre en Cloud Run y recibe el salario, que nunca llega a un tercero; con un Ollama en `localhost` se cumple al pie de la letra ([por qué](cathy/README.md#la-decisión-de-la-nube-privada-condición-2-reinterpretada)).
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
luis/          Next.js PWA (Vercel)                      — README, pruebas, docs/diagrams, docs/screenshots
cathy/         Next.js (Cloud Run) + ollama/ (GPU L4)    — README, BENCHMARK, pruebas, bench/
emily/         Vite PWA (Vercel) + eval/                 — README, VALIDACION, DIDACTICA, TEMAS, pruebas
evaluaciones/  Reportes HTML interactivos (global y por integrante)
```

Los artículos viven como Google Docs (enlazados arriba y desde el README de cada carpeta). Todos los diagramas
están hechos con *diagram-design* (`docs/diagrams/*.html` + `.png`).

## Infraestructura

| Pieza | Dónde |
|---|---|
| Carta y copia y Sobre | Vercel: `carta-y-copia.vercel.app` y `sobre-carta.vercel.app` |
| Rango | Cloud Run `rango` (`us-central1`, proyecto `ai-experiments-487722`), cuenta de servicio propia |
| Ollama privado | Cloud Run `ollama-coverletter` con **GPU L4** en `europe-west4` (solo invocable por IAM), modelos horneados en la imagen, escala a cero |
| Gemini | `gemini-3.8-flash`: API key (Luis), Vertex AI (Cathy), Firebase AI Logic + App Check (Emily) |

Ninguna key vive en el repositorio: cada carpeta trae un `.env.example` y su README explica de dónde sale cada valor.
