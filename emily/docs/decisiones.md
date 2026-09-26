# Decisiones y errores reales

Bitácora de lo que decidimos y de lo que salió mal mientras construíamos esta versión. Está escrita
para que sirva de material para el artículo: cada entrada dice **qué pasó**, **qué hicimos** y **qué aprendimos**.

---

## 1. El modelo local: Gemma 4 E2B QAT "mobile" sí funciona con transformers.js

**Qué probamos, en orden:**

1. `onnx-community/gemma-4-E2B-it-qat-mobile-ONNX` (el pedido). La tarjeta del modelo **no trae ejemplo de transformers.js**; solo uno en Python con ONNX Runtime ≥ 1.27 ("hasta que salga, compílalo desde el código fuente"). Revisamos el código de `@huggingface/transformers` 4.3.0 instalado: trae `Gemma4ForConditionalGeneration`, `Gemma4ForCausalLM`, `Gemma4Processor` y el dtype `q2f16`, y empaqueta `onnxruntime-node` 1.30.0 / `onnxruntime-web` 1.31.0-dev, así que el requisito de ORT ≥ 1.27 ya se cumple.
2. **Lo cargamos en Node** con `scripts/probe-local-model.ts`: descarga de 2 324 MB en ~3 min y carga correcta. **No hizo falta ningún respaldo** (`gemma-4-E2B-it-ONNX` q4f16, `Qwen3.5-0.8B-ONNX`, `gemma-3-270m-it-ONNX`); verificamos que los dos primeros existen en Hugging Face por si hacía falta.

**Tamaño real:** el repositorio pesa ~2.6 GB, pero para texto solo se descargan `embed_tokens_q2f16` (1.30 GB) y `decoder_model_merged_q2f16` (0.99 GB). Motivo (leído en el código de transformers.js): `pipeline('text-generation')` resuelve a `Gemma4ForCausalLM`; como la arquitectura nativa es `…ForConditionalGeneration`, `resolveTypeConfig` activa `textOnly` y no carga los codificadores de audio (92 MB) ni visión (187 MB).

**Error 1 — plantilla de chat:** la primera generación falló con
`Cannot use apply_chat_template() because tokenizer.chat_template is not set`. El repositorio ONNX trae la plantilla como archivo aparte (`chat_template.jinja`, 17 KB) y el tokenizador del pipeline no lo lee. `AutoProcessor.from_pretrained()` tampoco sirvió: resolvió a la clase base `Processor` (`uses_chat_template_file = false`) y devolvió la plantilla vacía. **Solución:** `Gemma4Processor.from_pretrained()` sí la carga (y usa la misma caché de transformers.js, así que funciona offline); se la pasamos al pipeline con la opción `chat_template` (`src/lib/local-model.ts`).

**Latencia medida en Node** (Mac Apple Silicon, 68 GB RAM, misma salida con decodificación voraz):

| Dispositivo | 120 tokens | Velocidad |
|---|---:|---:|
| CPU (`onnxruntime-node`) | 84 s | ~1.4 tokens/s |
| WebGPU (Dawn dentro de `onnxruntime-node`) | 5.5 s | ~22 tokens/s |

Una **carta completa** (perfil de ejemplo, `scripts/cpu-latency.ts`): **265 palabras en 234 s en CPU** (~4 min) contra **~13 s en WebGPU** (mediana de las 18 cartas de la evaluación). Por eso la evaluación usa WebGPU en Node por defecto (`--device=cpu` disponible): con CPU, las 18 cartas locales tomarían más de una hora.

**Calidad observada:** el modelo cuantizado a 2 bits produce **palabras rotas** con mezcla de idiomas
("se al aline", "se alAlignment" en el caso 02) y cartas más cortas que lo pedido. Lo mide la evaluación (criterio *Español correcto* y *Longitud*).

## 2. Firebase AI Logic: App Check obligatorio

- La primera llamada real (desde Node y luego **desde Chromium contra `vite dev`**, `scripts/verify-cloud-browser.ts`) devolvió:
  `401 UNAUTHENTICATED — "Firebase App Check token is invalid."` en `https://firebasevertexai.googleapis.com/v1beta/projects/viaticos-spending-mngmt/models/gemini-3.8-flash:generateContent`.
- Diagnóstico con la API de App Check: el servicio `firebaseml.googleapis.com` (Firebase AI Logic) está en **`ENFORCED`** desde el 15-09-2026 en el proyecto compartido; la app `coverletter-emily` no tiene clave de reCAPTCHA Enterprise registrada y la API de reCAPTCHA Enterprise **no está habilitada** en el proyecto.
- Intentamos registrar un **token de depuración** de App Check por API para verificar en desarrollo; el agente que construyó la app **no tenía permiso** para escribir secretos en el proyecto, así que ese paso queda para la persona dueña (README, sección 3.2). No habilitamos APIs en el proyecto compartido.
- **Qué quedó implementado:** App Check opcional con dos modos (`VITE_RECAPTCHA_ENTERPRISE_KEY` para producción, `VITE_APPCHECK_DEBUG_TOKEN` solo en `vite dev`). En modo depuración usamos un `CustomProvider` vacío porque `initializeAppCheck` llama a `provider.initialize()` aunque haya token de depuración, y el de reCAPTCHA intentaría cargar un script con una clave inexistente.
- La UI traduce el 401 a una instrucción concreta en lugar de mostrar solo el error crudo.
- **Cómo se resolvió (dueño del proyecto):** se habilitó reCAPTCHA Enterprise en `viaticos-spending-mngmt`, se creó una clave web *score* para `coverletter-emily.vercel.app` y `localhost` y se registró en App Check para la app `coverletter-emily` (API `recaptchaEnterpriseConfig`, TTL 1 h). Con `VITE_RECAPTCHA_ENTERPRISE_KEY` en `.env.local` y en Vercel, la carta de la nube funciona en producción (verificado en Chrome: 16 s con `gemini-3.8-flash`) y en desarrollo sin token de depuración.
- **Aprendizaje:** "sin servidor propio" no significa "sin configuración de seguridad": con la configuración web pública cualquiera podría gastar la cuota de Gemini; App Check es lo que lo impide, y en este proyecto ya estaba forzado.

## 3. Nada de llaves en el repositorio

La configuración web de Firebase es pública por diseño, pero la regla del proyecto es **ninguna llave en archivos versionados**. `src/firebase-config.ts` lee `VITE_FIREBASE_*`; los valores viven en `.env.local` (ignorado por `.gitignore`) y en Vercel; `.env.example` va vacío. Las pruebas e2e inyectan valores ficticios y no dependen de `.env.local`.

## 4. Lo que encontró la evaluación en su primera corrida (y corregimos)

La primera corrida de `npm run eval -- --leaks-only` (salida guardada en `docs/.run0-leaks-baseline.txt`) encontró errores **del redactor, no de los datos trampa**:

| Hallazgo | Causa | Arreglo |
|---|---|---|
| **7 de 18 casos bloqueados** sin motivo real | La compuerta revisa el prompt completo, y el patrón de personas usaba `\s+`, que cruza saltos de línea: "Puesto al que aplica: Coordinadora de enfermería⏎**Empresa** destino" se leía como *cargo + nombre*. El error estaba en **nuestra propia plantilla de prompt**. | Los patrones de personas y direcciones usan `[ \t]` (no cruzan líneas). Prueba de regresión. |
| "Lead Product Designer" tachado como persona | "lead" estaba en la lista de cargos | Se quitó; prueba de regresión |
| "Residenciales Los Álamos" (dato trampa **fácil**) se fugó | Palabras clave de zona en minúscula y sin bandera `i` | Palabra clave insensible a mayúsculas; prueba de regresión |
| La empresa destino "Café Calle Real" tachada como dirección | Nada distinguía una empresa de una calle | **Textos públicos declarados** (empresa destino y puesto deseado) quedan protegidos: una detección que cae entera dentro de ellos se descarta. Prueba de regresión. |

Resultado, antes → después:

| | Corrida 0 | Después de los arreglos |
|---|---:|---:|
| Recall del redactor | 83.3 % (65/78) | 84.6 % (66/78) |
| Recall "final" (bloqueado = atrapado) | **94.9 %** (74/78) | 84.6 % (66/78) |
| Casos bloqueados | 7 (todos falsos) | 0 |
| Falsos positivos (`allowed` tachados) | 2 / 101 | 0 / 101 |

Ojo con la segunda fila: **la corrida con el error se veía mejor**. Una compuerta que bloquea de más infla el recall final, porque lo que no se envía no se fuga, pero deja sin carta de la nube a 7 de 18 personas. Por eso el reporte muestra el recall del redactor, el final y los bloqueos por separado. Los 12 canarios que se escapan después de los arreglos son todos de dificultad "difícil". **No** ajustamos el redactor a los canarios difíciles (nombres en minúscula, correos deletreados, "doce y medio", apodos del empleador): hacerlo sería sobreajustar al conjunto de evaluación y el número dejaría de decir algo.

También encontró (en la parte de calidad):

- **El juez devolvía "Carta A"** en lugar de "A"; nuestro código limpiaba con `/[^A-C]/gi` y producía "CAAA". Arreglado con una búsqueda de letra aislada.
- **La plantilla ponía en minúscula "python" y "airflow"** (el juez lo señaló). `lowerFirst` ahora solo baja la inicial de palabras comunes en español.

### Segunda corrida (la completa, con cartas y juez)

- **Las fugas se escriben en la carta.** El dato trampa difícil "ana lópez" (en minúscula) se escapó del redactor, y Gemini lo devolvió **capitalizado dentro de la carta**: "Ana López". Lo mismo con "Ricardo Arzú" (el cargo "CEO" no está en la lista de cargos): la carta dice "Ejecutivo Ricardo Arzú". Un nombre de tercero que se escapa no solo llega a Google, **termina en un documento que se envía a otra empresa**. El reporte ahora cuenta cuántas fugas llegan a la carta (sección 2.5 de `VALIDACION.md`).
- **Confusión entre posición y calidad en el juez.** El orden "aleatorio" con semilla dejó la carta de la nube en la posición C en 12 de 18 casos, y C tuvo el promedio más alto (4.56 vs 3.73–3.94). Con eso no se puede separar el sesgo de posición de la calidad. Se cambió a una asignación **balanceada**: las 6 permutaciones, 3 casos cada una, así cada fuente cae 6 veces en A, 6 en B y 6 en C.
- **Falsos positivos de las reglas de carta** (no del router): "cien mil descargas" contado como salario; "Café Calle Real" (la empresa destino) como dirección; "Ingeniero React Native Senior" como persona. Y uno del redactor: "un **mil**lón" coincidía con "un mil". Arreglados y con pruebas de regresión.
- La plantilla escribía "; y Hice …" e "y implementé" (el juez lo señaló): ahora baja la inicial de más verbos comunes y usa "e" antes de sonido /i/.

## 5. La prueba de fugas y los módulos ES

`vi.spyOn(modulo, 'buildCloudPayload')` no intercepta llamadas internas entre módulos ES (el orquestador importa la función directamente). Por eso el límite de la nube se exporta como **objeto** (`cloud.generateLetter`), que sí se puede espiar, y la prueba de "la compuerta bloquea" usa un caso realista en vez de un mock: *"Mi app llegó a 15,000 usuarios"* con salario de 15 000. El redactor deja pasar el conteo ("usuarios"), pero la compuerta conoce el salario del usuario y bloquea: mejor un bloqueo de más que una fuga.

## 6. Recarga en caliente de Vite mata la descarga del modelo

Al verificar el modelo en el navegador contra `vite dev`, la descarga se quedó en 0.39 GB: cada vez que guardábamos un archivo, Vite recargaba la página y el Web Worker moría a media descarga. Las verificaciones largas se hacen contra `vite build && vite preview`.

## 7. Detalles de interfaz que solo aparecieron en pantalla

- En móvil la página medía 564 px en un viewport de 390: la tabla de tachaduras forzaba el ancho mínimo de las columnas del grid. Solución: `grid-template-columns: minmax(0, 1fr)`.
- `.progress { display: flex }` anulaba el atributo `hidden`; se añadió `[hidden] { display: none !important }`.
- El formulario *sticky* con scroll propio cortaba contenido y era incómodo en páginas largas; se quitó.
- **Interfaz mínima.** La revisión de la dueña del proyecto fue "las interfaces se ven algo llenas". Quedó una sola columna centrada; el formulario muestra solo lo que la carta y la nota necesitan (puesto al que aplicas, empresa, los dos salarios y años de experiencia), y nombre, puesto y empleador actuales, logros, oferta y la opción sin internet pasaron a **Más detalles (opcional)**, así que ya no son obligatorios (el router, la plantilla y el prompt ya aceptaban campos vacíos). Se quitó la hoja rayada decorativa del formulario; la nota muestra veredicto, una frase, el rango para pedir y dos consejos, con el resto bajo *Ver más*; la tarjeta "Usar sin internet" es ahora una sola línea que se convierte en barra de progreso.
- **Tuteo, no voseo.** La interfaz y los textos de la nota decían "Contanos de vos", "ganás", "Preparate"; se pasó todo a tú ("ganas", "Prepárate"), también en README y en el reporte de la evaluación.

## 8. Otras decisiones

- **Tu nombre viaja como `{{NOMBRE}}`** y se restituye en el dispositivo: la nube escribe la firma sin saber quién eres.
- **El salario deseado tampoco sale**: la carta no debe mencionar cifras; solo lo usa la nota.
- **Constante de cambio** `USD_TO_GTQ = 7.70` (redondeada; las bandas de la nota tienen 10–15 puntos de ancho, así que ±2 % no cambia el consejo).
- **No se guarda nada en `localStorage`**: sería guardar el salario en claro en el navegador.
- **El runtime de ONNX (wasm, ~27 MB) se baja de jsDelivr**, que es lo que configura transformers.js por defecto, y queda en Cache Storage. Vite igual copia una copia no usada a `dist/assets`; alojarlo nosotros exige configurar `env.backends.onnx.wasm.wasmPaths` con el `.mjs` y el `.wasm`, y lo dejamos como mejora.
- **npm 12 bloquea scripts de instalación** por defecto (`onnxruntime-node`, `esbuild`, `protobufjs`…). No hizo falta aprobarlos: los binarios ya vienen en los paquetes. Con otros agentes instalando a la vez hubo un `EACCES` en `~/.npm/_cacache`; se resolvió con una caché privada.
- **Context7 (documentación de librerías) no estaba disponible** (API key inválida); verificamos las APIs leyendo los `.d.ts` y el código compilado de los paquetes instalados y las tarjetas de modelo de Hugging Face.
- **Vertex AI con cuota compartida** devolvió `429 RESOURCE_EXHAUSTED` al juez: se agregó reintento con espera exponencial y caché de cartas para que una falla no obligue a regenerar todo.

## 9. Modelo local en el navegador

Verificado con `scripts/verify-local-browser.ts` (Chromium 1243 de Playwright, *new headless*, WebGPU disponible, contra `vite preview`), usando la app real con el Web Worker:

| Paso | Resultado |
|---|---|
| Dispositivo elegido por el worker | **WebGPU** |
| Descarga (2.32 GB) + carga, primera vez | **196 s** en total (~12 MB/s) |
| Borrador local del perfil de ejemplo | **253 palabras en 16 s** |
| Página recargada con `context.setOffline(true)` → "Cargar modelo" | **el modelo carga desde Cache Storage sin red** |

Tropiezos en el camino:

- El primer intento murió a 0.39 GB por la recarga en caliente de Vite (sección 6).
- El segundo, con `chromium-headless-shell` (el headless "viejo" que Playwright usa por defecto), se quedó congelado en 0.80 GB: proceso vivo, 0 % de CPU, conexiones abiertas. En ese momento Hugging Face servía el mismo archivo a ~10 MB/s con `curl`. No lo diagnosticamos a fondo; con Chromium completo (`channel: 'chromium'`) la descarga terminó sin problemas. Queda como advertencia: **una descarga de 2.3 GB en el navegador es frágil** y la UI debe permitir reintentar (lo hace: los archivos completos quedan en caché).
- El borrador sale con el mismo tipo de palabra rota que en Node ("se al Alinea") y en masculino ("Estoy convencido") aunque el ejemplo es María José: el modelo no conoce el género y el prompt no lo dice.
- Memoria: el pestaña del worker llegó a ~1.5 GB de RSS durante la descarga; transformers.js lee cada archivo completo en memoria antes de guardarlo en Cache Storage.
