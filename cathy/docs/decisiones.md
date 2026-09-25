# Decisiones y errores reales (Cathy)

Registro honesto de lo que se decidió, por qué, y de lo que salió mal en el camino. Sirve de materia prima para el artículo.

## 1. El salario sí viaja al Ollama privado (reinterpretación de la condición 2)

**Enunciado:** "el salario actual nunca sale del dispositivo".
**Decisión:** "el salario nunca sale del **perímetro de confianza** (navegador + servicios de Cloud Run del propio dueño) y nunca llega a un **tercero** (Gemini)".

- **Por qué:** el foco de Cathy es comparar modelos locales pequeños en condiciones iguales. Correrlos en una L4 de Cloud Run da una máquina reproducible; la laptop de cada quien, no. Ollama está desplegado con `--no-allow-unauthenticated`: solo lo invocan identidades con `roles/run.invoker` (la cuenta de servicio de la app, con el rol otorgado **solo sobre ese servicio**, y el dueño). No hay terceros, ni base de datos, ni logs de prompts en la app.
- **Qué se pierde:** el dato sale del equipo por la red (TLS) y la garantía pasa de "física" a "de configuración": depende de IAM y de quién administra el proyecto. Un error de IAM (p. ej. `allUsers` como invoker) rompería la promesa sin que ninguna prueba unitaria lo note.
- **Cómo se hizo explícito en código:** `TIER_ALLOWLIST.private` en `src/lib/router.ts` incluye `currentSalary` a propósito, con un comentario que apunta aquí; la prueba de fuga verifica las dos mitades (sí aparece en `/api/ollama/*`, nunca en `/api/letter`).
- **Salida de emergencia:** `OLLAMA_URL=http://localhost:11434` convierte el tier 1 en el dispositivo sin tocar código. Si alguien exige la versión literal de la condición, esa es la configuración.
- **Pendiente discutible:** agregar una verificación automática de la política IAM del servicio Ollama (que `allUsers` no sea invoker) en el script de despliegue o en CI.

## 2. No hay cuota de GPU: Ollama corre en CPU

El despliegue con GPU falló: el proyecto no tenía cuota de L4 en Cloud Run. Pedimos 1 L4 (sin y con redundancia zonal, en `us-central1` y `europe-west4`) y Google **rechazó las tres solicitudes automáticamente**, en segundos ("Quota request denied"; es común en proyectos sin historial de gasto). Plan B: la misma imagen corre en **modo CPU** (8 vCPU / 32 GiB) con `GPU=0 ./ollama/deploy.sh`. Mediciones del equipo: gemma4:e2b-it-qat ~19.7 tok/s tibio y carga en frío ~115 s (contenedor + modelo); qwen3.5:2b ~15.5 tok/s y ~57 s.

Consecuencias en el diseño:
- El timeout del proxy subió de 120 s a **300 s** (`OLLAMA_TIMEOUT_MS`), el del cliente a 310 s y el `--timeout` del servicio de la app a 600 s.
- La UI dice la verdad: "Despertando la GPU (~30–60 s)… si el servicio corre en modo CPU puede tardar hasta ~2 min". Aparece si no hay respuesta en 3.5 s.
- El modo **no se adivina**: después de cada respuesta, el proxy llama `GET /api/ps` y reporta `size_vram`. `size_vram = 0` ⇒ CPU. El benchmark muestra "CPU · 4.05 GB RAM" o "GPU · x GB VRAM" (la UI ya no muestra métricas del modelo: no le sirven a quien busca trabajo).
- Las heurísticas se muestran primero, así que la espera larga no deja la pantalla vacía: el borrador del modelo es un extra.

## 3. "Carta de interés" confundió a un modelo de 2B

Probando la pregunta "¿por qué conviene no poner el salario actual en una carta de interés?", **qwen3.5:2b entendió "carta de interés" como una carta financiera** (habló de interés compuesto e IVA); gemma4 respondió en tema.

- Los prompts ahora dicen **"carta de presentación (cover letter)"** y la nota se describe como "nota privada de negociación salarial (no es una carta ni un documento financiero)".
- Se agregó un chequeo determinista **en tema** (`src/lib/heuristics/topic.ts`): el texto debe tocar ≥ 2 temas de negociación (salario, expectativa, oferta, entrevista…) y ninguno de finanzas bancarias (interés compuesto, tasa de interés, IVA, préstamo). Si falla, la UI lo marca y el benchmark lo cuenta.
- Lección: en español, términos de dominio ambiguos que un humano desambigua por contexto son trampas para modelos pequeños. El nombre del documento en la UI puede seguir siendo "carta de interés"; el prompt no.

## 4. ¿Gemma 4 E2B y Qwen 3.5 2B son comparables?

No son simétricos. `/api/ps` reporta gemma4:e2b-it-qat con **4.6B parámetros en Q4_0 (4.05 GB)** y qwen3.5:2b con **2.3B en Q8_0 (2.36 GB)**. "E2B" significa ~2B parámetros *efectivos* por token; el resto son embeddings por capa que no se computan igual.

Los consideramos comparables por **presupuesto de despliegue**, no por conteo de parámetros: ambos son la opción "~2B/edge" de su familia y ambos caben con holgura en una L4 (24 GB) o en 32 GB de RAM. Por eso el benchmark reporta memoria real y tokens/s, y no solo el nombre. En CPU, curiosamente, el modelo más grande en disco (gemma, Q4) genera más rápido que el más chico (qwen, Q8): la cuantización pesa más que el conteo nominal.

## 5. Los números nunca vienen del modelo

El LLM redacta; la brecha, las bandas, el rango y la regla de "cuándo mencionarlo" salen de `src/lib/heuristics/`. El prompt pide copiar cifras solo de DATOS, pero no confiamos: `checkNumberConsistency` extrae cada monto y porcentaje del texto del modelo y lo compara con la lista de números calculados (tolerancia 2 % para montos, ±1 punto para porcentajes). Lo que no cuadra se subraya en la UI, con un aviso en lenguaje llano solo cuando ocurre, y cuenta como "cifra inventada" en el benchmark.

## 6. Errores reales que atraparon las pruebas

- **"bono anual" volvía anual un salario mensual.** La oferta de prueba "Rango: 13-16k + bono anual" se leía como Q13,000–16,000 **anuales** (÷14 → Q1,143/mes) y la regla de momento decía "estás por encima del rango". Lo atrapó una prueba de `computeFacts` sobre el perfil 10. Arreglo: quitar frases de bono ("bono anual", "annual bonus", "aguinaldo") antes de detectar el periodo. Quedó una prueba de regresión.
- **El empleador aparecía a medias.** El redactor buscaba "Grupo Pantaleon" completo, pero el logro decía "at Pantaleon"; con "Tigo Guatemala" el logro decía "la app de Tigo". Arreglo: además del nombre completo, se redactan sus **palabras distintivas** (≥ 4 letras, fuera de una lista de palabras genéricas de razón social: grupo, banco, colegio, distribuidora…). Efecto secundario detectado de inmediato: si alguien se apellida como su empresa ("Ana Pantaleón" en "Grupo Pantaleon"), le borrábamos el nombre de la firma; el nombre ya no pasa por el detector de empleador.
- **Números que parecen años.** "Pido 2000" (US$2,000) no se redactaba porque 2000 parece un año. Arreglo: el redactor recibe los **montos conocidos** del perfil y los redacta en cualquier forma, aunque parezcan año.
- **La redacción conservadora borra logros legítimos.** "Gestioné un presupuesto de pauta de Q80,000 mensuales" llega a Gemini como "[MONTO]". Aceptamos el costo: el prompt le pide a Gemini reescribir la frase sin el dato, y la carta pierde una cifra de impacto a cambio de que ningún monto del perfil salga. Alternativa discutible: permitir montos con contexto de negocio ("presupuesto", "ventas"); se descartó porque ese contexto es exactamente lo que un redactor por regex no puede verificar.
- **Residuo "quetzales".** El servidor bloquea (422) si después de redactar queda una palabra de moneda suelta ("gano muchos quetzales"). Al principio eso también bloqueaba a clientes legítimos con "millones de quetzales"; ahora el router del cliente reemplaza esas palabras por `[MONEDA]`, así que el 422 solo lo ve un cliente modificado.
- **Promesa rechazada sin manejador.** El orquestador lanza la nota y los requisitos en paralelo y espera la nota al final; si la nota fallaba mientras se esperaban los requisitos, Node reportaba "unhandled rejection". Se agregó un `.catch` vacío al lanzarla (el error se maneja al hacer `await`).

## 7. La prueba de fuga se probó a sí misma

Una prueba de fuga que pasa no demuestra nada si no sabe fallar. Dos controles:
1. **Control positivo:** la misma prueba verifica que el salario **sí** aparece en el cuerpo de `/api/ollama/negotiation`; si el escaneo estuviera roto, esa aserción fallaría.
2. **Mutación:** se desactivó temporalmente el redactor en `router.ts` → **13 pruebas fallaron** (12 perfiles + offline). Se restauró.

Además, el "Ollama" simulado de la prueba es adversarial: devuelve requisitos que repiten el salario y el empleador, para demostrar que lo que sale del tier 1 también se redacta antes del tier 2.

## 8. Autenticación: ID tokens y credenciales de usuario

- En Cloud Run, `GoogleAuth().getIdTokenClient(url)` obtiene el ID token del metadata server con `audience` = origen del servicio. Funciona sin llaves.
- En local con `gcloud auth application-default login`, **google-auth-library no puede emitir ID tokens** con credenciales de usuario. Opciones documentadas: `gcloud run services proxy` (recomendada: `http://localhost:11434`, sin token en archivos) u `OLLAMA_TOKEN=$(gcloud auth print-identity-token)` en la shell (expira en 1 h). El benchmark usa `gcloud auth print-identity-token` y lo renueva cada 45 min.
- Regla del proyecto: ningún token ni llave en archivos versionados; `.env.example` va con valores vacíos.

## 9. El proxy de Ollama no es un "LLM abierto"

El cliente manda datos (`{model, profile}` u `{model, offer}`), nunca un prompt: los prompts se arman en el servidor con `src/lib/prompts.ts`, el modelo debe estar en la lista `MODELS` y zod `.strict()` rechaza campos extra (`prompt: "ignora todo"` → 400). Así una URL pública no se convierte en acceso gratis a la GPU del dueño.

## 10. `think: false` y el parámetro que algunos modelos rechazan

Qwen 3.5 razona por defecto; en CPU eso dispara la latencia y en la extracción mete texto antes del JSON. Se apaga con `think: false` en ambos modelos (en la app y en el benchmark), documentado como sesgo en contra de Qwen. Como un modelo sin soporte de "thinking" podría responder 400 al ver el parámetro, el cliente de Ollama reintenta sin `think` si el error lo menciona (probado).

## 11. Benchmark: lo que salió de la corrida real (CPU)

Corrida modesta contra el Ollama de Cloud Run en **modo CPU**: 12 perfiles × 2 modelos × 1 corrida tibia + 1 fría por modelo, juez `gemini-3.8-flash`. Resultados completos en [`BENCHMARK.md`](../BENCHMARK.md).

- **Empate técnico en el agregado, ganadores distintos por tarea.** Nota de negociación → qwen3.5:2b (juez 4.05 vs 3.63; 100 % en segunda persona vs 42 %). Extracción de requisitos → gemma4:e2b-it-qat (juez 4.38 vs 3.22; nunca metió el salario como requisito, qwen lo hizo en 4 de 9). Gemma es más rápida en CPU (18.6 vs 15.9 tok/s; nota p50 16.9 s vs 18.2 s) pero ocupa más RAM (4.05 vs 2.36 GB) y carga más lento en frío. Idea que queda abierta: rutear **por tarea** dentro del tier 1 (qwen para la nota, gemma para requisitos) en vez de un modelo por corrida.
- **Gemma escribió 7 de 12 notas en primera persona** ("mi expectativa es…"), como si fuera la candidata, pese a que el prompt pide tuteo. Ningún chequeo lo detectaba: se agregó `secondPerson` a la calidad determinista del benchmark.
- **Gemma tradujo al español los requisitos de las ofertas en inglés** (grounding 0.14 y 0.00 en esas dos entradas; 1.00 en las ofertas en español), aunque el prompt pide "en el idioma de la oferta". Probable causa: el prompt de sistema está en español. Para la carta no es grave (Gemini recibe los requisitos igual), pero sí es infidelidad medible.
- **Qwen metió "pretensión salarial" y el rango de la oferta como requisitos** en 4 de 9 extracciones, pese a la instrucción. No es fuga (el rango es de la oferta, no de la persona) y además el router redacta todo monto antes de mandar los requisitos a Gemini: la defensa en profundidad hizo su trabajo con una salida real de un modelo.
- **El juez veía menos contexto que el modelo.** En la primera pasada, el juez recibió un resumen sin el rango publicado ni los años de experiencia, y castigó como "cifras inventadas" datos que sí estaban en los DATOS del modelo ("ambas respuestas inventan un rango de Q16,000 a Q19,000"). Arreglo: el juez recibe **exactamente** el mensaje que recibió el modelo. Lección: un juez LLM con contexto incompleto produce veredictos seguros y equivocados.
- **Sesgo de posición del juez, medido:** con un solo orden aleatorio, la respuesta mostrada primero ganó **15 de 21** comparaciones (71 %). Ahora cada par se juzga en ambos órdenes (A/B y B/A) y se promedia; aun así la primera gana 24 de 41 juicios no empatados (59 %): el sesgo baja pero no desaparece.
- **Falso positivo del chequeo de cifras:** "entregué 3 torres 4 % bajo presupuesto" (un dato de los logros) se marcaba como cifra inventada. Ahora los números que escribió la persona también cuentan como legítimos (con prueba de regresión).
- **Vertex 429 en el juez:** 3 de 21 veredictos fallaron con `RESOURCE_EXHAUSTED`. Se agregó reintento con espera creciente y un modo `--from resultados.json` que recalcula la calidad y completa veredictos **sin volver a llamar a Ollama** (en CPU, re-generar cuesta ~18 min).
- **Caché de prompt:** la medición en frío usa la entrada 01 y su primera corrida tibia también; Ollama reutiliza el prefijo evaluado y ese TTFT sale en ~0.25 s contra ~5 s del resto. Por eso se reporta p50.
- **Dos "fríos" distintos.** Con el contenedor vivo, descargar y recargar el modelo cuesta 10.2 s (gemma) y 8.4 s (qwen). Con el contenedor escalado a cero (medido en la app real): carga de 108.7 s y nota completa en 142 s con gemma; 60.4 s y 89 s con qwen. En CPU, el cold start de Cloud Run es el costo dominante, no la generación.
- **Juez con datos sensibles:** para juzgar fidelidad, Gemini (juez) recibe el perfil con salario. Solo es aceptable porque los perfiles son ficticios; la app nunca lo hace.

## 12. Prueba de punta a punta con los servicios reales

Con la app corriendo contra el Ollama de Cloud Run y Vertex (sin mocks), la primera corrida tardó 158 s (contenedor en frío) y **Vertex respondió `500 INTERNAL`** en la carta: la app entregó la nota con el borrador del modelo y la carta de **plantilla**, como estaba diseñado. Se agregó un reintento (1.5 s) para errores transitorios 429/500/503 en `/api/letter`. La segunda corrida (qwen, contenedor de nuevo en frío) completó todo: nota en 89 s, carta de Gemini en 9.8 s.

## 13. Herramientas

- El MCP de documentación (context7) no funcionó en esta sesión (API key inválida). Las APIs se verificaron contra los tipos instalados (`@google/genai` 2.24: `vertexai`, `thinkingConfig.thinkingLevel`, `responseJsonSchema`; `google-auth-library` 11: `getIdTokenClient`, `getRequestHeaders()` devuelve `Headers`) y contra la documentación que Next.js 16 trae en `node_modules/next/dist/docs` (route handlers con `params` como Promise, `output: 'standalone'`, PWA).
- TypeScript `latest` ya es la 7 (compilador nativo); se fijó `~6.0` para no arriesgar la verificación de tipos de `next build`.
- `next start` avisa que no es el servidor recomendado con `output: 'standalone'`; funciona y es lo que usa el e2e (lo pide el enunciado). El contenedor usa `node server.js` del build standalone.
