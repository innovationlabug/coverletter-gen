# Benchmark: `gemma4:e2b-it-qat` vs `qwen3.5:2b`

Corrida del 2026-09-25 22:40 UTC · Ollama en `ollama-coverletter-611681112050.us-central1.run.app` · modo **CPU** (según `size_vram` de `/api/ps`) · 12 perfiles · 1 corrida(s) tibia(s) por entrada · duró 18.4 min.

## Método

- **Tareas de la app, no benchmarks genéricos**: (a) borrador de la nota de negociación (12 entradas) y (b) extracción de requisitos en JSON (9 entradas con oferta). Los prompts salen de `src/lib/prompts.ts` (versión `2026-09-v1`) y las opciones de `src/lib/tasks.ts`: lo mismo que corre en producción.
- **Mismas condiciones para ambos**: mismos mensajes, `temperature: 0`, `seed: 42`, mismo `num_predict`, `format` = JSON Schema en requisitos, `stream: true`.
- **`think: false` para ambos**: Qwen 3.5 "piensa" por defecto (tokens de razonamiento antes de responder). Eso multiplica la latencia en CPU y, en la extracción, mete texto antes del JSON. Gemma 4 E2B no lo necesita para estas tareas. Apagarlo en los dos compara la respuesta útil, no la cadena de razonamiento; el costo es que Qwen compite sin su modo fuerte (queda anotado como sesgo).
- **Frío vs tibio**: *frío* = el modelo se descarga con `keep_alive: 0` (el contenedor de Cloud Run sigue vivo) y se mide la primera llamada; *tibio* = modelo ya en memoria. El arranque del contenedor (escala a cero) suma aparte y no se mide aquí.
- **Latencia**: TTFT = tiempo hasta el primer token con contenido (stream); total = reloj de pared extremo a extremo (incluye red hasta Cloud Run); tok/s = `eval_count / eval_duration` reportado por Ollama (sin red).
- **Memoria**: `GET /api/ps` justo después de cargar cada modelo: `size` (total) y `size_vram` (en GPU). `size_vram = 0` ⇒ modo CPU.
- **Calidad determinista** (las mismas heurísticas de la app): español, largo 60–220 palabras, cifras consistentes con la brecha calculada (ninguna cifra inventada), en tema (sin "interés compuesto"/IVA), sin markdown y en segunda persona ("tu expectativa", no "mi expectativa"); en requisitos: JSON válido + esquema zod, *grounding* (ítems cuyas palabras están en la oferta) y *recall* (viñetas de la oferta cubiertas).
- **Juez LLM**: `gemini-3.8-flash` con rúbrica 1–5 (utilidad, precisión, tono, fidelidad a los datos). Ciego al nombre del modelo, orden A/B aleatorio con semilla y registrado. Juzga la corrida #1 de cada modelo.

### ¿Son comparables?

| Modelo | Parámetros (Ollama) | Cuantización | Tamaño cargado |
| --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | 4.6B | Q4_0 | 4.05 GB |
| `qwen3.5:2b` | 2.3B | Q8_0 | 2.36 GB |

No son simétricos: Gemma 4 **E2B** son ~2B parámetros *efectivos* por token, pero el archivo trae ~4.6B en total (embeddings por capa) cuantizados a Q4 (QAT); Qwen 3.5 2B son ~2.3B densos a Q8. Los consideramos comparables por **presupuesto de despliegue**, no por conteo de parámetros: ambos son la opción "~2B" que su familia publica para dispositivo/edge, ambos caben con holgura en una L4 (24 GB) o en 32 GB de RAM, y lo que importa para esta app es calidad por segundo y por GB. Por eso reportamos memoria real y velocidad, no solo el nombre.

## Latencia (corridas tibias)

| Modelo | Tarea | n | TTFT p50 | Total p50 | Total p95 | tok/s (media) | Tokens salida | Errores |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | nota | 12 | 5.1 s | 16.9 s | 19.4 s | 18.6 | 222 | 0 |
| `gemma4:e2b-it-qat` | requisitos | 9 | 2.8 s | 6.1 s | 6.7 s | 20.0 | 60 | 0 |
| `qwen3.5:2b` | nota | 12 | 6.1 s | 18.2 s | 25.2 s | 15.9 | 206 | 0 |
| `qwen3.5:2b` | requisitos | 9 | 3.5 s | 9.1 s | 15.3 s | 16.0 | 98 | 0 |

### Frío (modelo descargado → primera respuesta)

| Modelo | Carga del modelo | TTFT | Total | tok/s |
| --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | 10.2 s | 15.4 s | 26.6 s | 19.4 |
| `qwen3.5:2b` | 8.4 s | 14.5 s | 26.8 s | 16.0 |

## Memoria

| Modelo | Modo | size | size_vram |
| --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | CPU | 4.05 GB | 0.00 GB |
| `qwen3.5:2b` | CPU | 2.36 GB | 0.00 GB |

## Calidad determinista

**Nota de negociación**

| Modelo | n | Español | Largo OK | Cifras consistentes | Cifras inventadas (total) | En tema | 2.ª persona | Palabras (media) | Puntaje |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | 12 | 100 % | 100 % | 100 % | 0 | 100 % | 42 % | 158 | 0.90 |
| `qwen3.5:2b` | 12 | 100 % | 100 % | 100 % | 0 | 100 % | 100 % | 150 | 1.00 |

**Requisitos (JSON)**

| Modelo | n | JSON válido | Esquema OK | Grounding | Recall | Mencionó salario | Puntaje |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | 9 | 100 % | 100 % | 77 % | 78 % | 0 | 0.91 |
| `qwen3.5:2b` | 9 | 100 % | 100 % | 95 % | 100 % | 4 | 0.90 |

## Juez LLM

| Modelo | Tarea | utilidad | precision | tono | fidelidad |
| --- | --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | nota | 3.58 | 3.29 | 3.08 | 4.54 |
| `gemma4:e2b-it-qat` | requisitos | 4.22 | 4.00 | 5.00 | 4.28 |
| `qwen3.5:2b` | nota | 4.17 | 3.71 | 4.42 | 3.92 |
| `qwen3.5:2b` | requisitos | 2.67 | 2.39 | 4.94 | 2.89 |

**Sesgos del juez.** Posición: en 42 juicios (cada par juzgado en ambos órdenes A/B y B/A; la tabla promedia ambos), la respuesta mostrada primero ganó 24 veces (1 empates); si el juez fuera neutral, ~50 % de los no empatados. Otros sesgos conocidos que NO controlamos: preferencia por textos largos, y afinidad de familia (Gemini juzgando a Gemma, ambos de Google). Además el juez es el mismo modelo que escribe la carta en la app. Por eso el juez es una señal más, no el veredicto: los chequeos deterministas pesan igual en el compuesto.

## Conclusión


**Empate técnico en el agregado** (`gemma4:e2b-it-qat` 0.848 vs `qwen3.5:2b` 0.845; compuesto = promedio de calidad determinista y juez normalizado a 0–1). La decisión depende de la tarea:

**Mejor modelo por tarea:**
- **nota de negociación** → `qwen3.5:2b` (gemma4:e2b-it-qat 0.81 · qwen3.5:2b 0.91)
- **extracción de requisitos** → `gemma4:e2b-it-qat` (gemma4:e2b-it-qat 0.89 · qwen3.5:2b 0.77)

**Dónde gana `gemma4:e2b-it-qat`** (hechos medidos):
- promedio del juez (1–5): gemma4:e2b-it-qat 3.95 · qwen3.5:2b 3.70
- juez en requisitos (1–5): gemma4:e2b-it-qat 4.38 · qwen3.5:2b 3.22
- extracciones que metieron el salario como requisito: gemma4:e2b-it-qat 0 · qwen3.5:2b 4
- latencia p50 de la nota: gemma4:e2b-it-qat 16.9 s · qwen3.5:2b 18.2 s
- velocidad de generación (tok/s): gemma4:e2b-it-qat 18.6 · qwen3.5:2b 15.9

**Dónde gana `qwen3.5:2b`:**
- calidad determinista (0–1): gemma4:e2b-it-qat 0.91 · qwen3.5:2b 0.95
- juez en la nota (1–5): gemma4:e2b-it-qat 3.63 · qwen3.5:2b 4.05
- notas en segunda persona: gemma4:e2b-it-qat 42 % · qwen3.5:2b 100 %
- fidelidad de requisitos a la oferta (grounding): gemma4:e2b-it-qat 77 % · qwen3.5:2b 95 %
- carga en frío: gemma4:e2b-it-qat 10.2 s · qwen3.5:2b 8.4 s
- memoria ocupada: gemma4:e2b-it-qat 4.05 GB · qwen3.5:2b 2.36 GB

### Decisión

**Para esta app gana `gemma4:e2b-it-qat`**, y es el modelo por defecto (`OLLAMA_MODEL`).

El agregado es un empate, así que la decisión sale de qué error es más grave en *esta* app:

- **El error de Qwen toca la privacidad.** En 4 de 9 extracciones metió la pretensión salarial o el rango de la oferta como "requisito". Esa lista viaja después hacia Gemini (nivel 2, tercero). El redactor del router quitó los montos antes de salir, así que no hubo fuga, pero la app dependió de su segunda línea de defensa. Gemma lo hizo 0 de 9 veces.
- **El error de Gemma es de tono.** Escribió 7 de 12 notas en primera persona ("mi expectativa…") en vez de hablarle a la persona. Molesta, pero no expone datos, las cifras siguen siendo correctas (100 % consistentes con las heurísticas) y el juez le da la mayor fidelidad a los datos en la nota (4.54 vs 3.92).
- **En CPU, Gemma es un poco más rápido** (18.6 vs 15.9 tok/s; nota p50 16.9 s vs 18.2 s). Una diferencia de ~1 s en una nota de ~150 palabras no cambia la experiencia; el arranque en frío del contenedor (1.5–2.5 min) sí, y afecta igual a los dos.

**En qué pierde el ganador:**

- **La nota**: Qwen la escribe mejor (juez 4.05 vs 3.63, tono 4.42 vs 3.08, segunda persona 100 % vs 42 %).
- **Memoria**: 4.05 GB contra 2.36 GB. En una L4 (24 GB) o en 32 GB de RAM no importa; en una laptop de 8 GB sí.
- **Carga en frío del modelo**: 10.2 s contra 8.4 s.
- **Fidelidad a la oferta en requisitos** (grounding 77 % vs 95 %): Gemma traduce al español los requisitos de ofertas en inglés, y el chequeo por palabras lo cuenta como "no está en la oferta".

**Siguiente paso natural:** enrutar por tarea dentro del nivel 1 (Qwen para la nota, Gemma para los requisitos). No lo implementamos: dos modelos cargados duplican la memoria y el tiempo de arranque en frío, y con el contenedor en CPU eso pesa más que la mejora de tono.

## Reproducir

```bash
export OLLAMA_URL=https://ollama-coverletter-<id>.us-central1.run.app   # o http://localhost:11434
gcloud auth application-default login                                    # para el juez (Vertex AI)
npm run bench                                   # 3 corridas tibias + 1 fría por modelo
npm run bench -- --runs 1 --inputs 6 --no-judge # corrida corta (útil en CPU)
npm run bench -- --dry                          # Ollama simulado, prueba el pipeline
```
