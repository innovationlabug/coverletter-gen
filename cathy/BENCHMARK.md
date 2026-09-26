# Benchmark: `gemma4:e2b-it-qat` vs `qwen3.5:2b`

Corrida del 2026-09-25 23:31 UTC · Ollama en `ollama-coverletter-611681112050.europe-west4.run.app` · modo **GPU** (según `size_vram` de `/api/ps`) · 12 perfiles · 3 corrida(s) tibia(s) por entrada · duró 4.7 min.

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
| `gemma4:e2b-it-qat` | 4.6B | Q4_0 | 1.80 GB |
| `qwen3.5:2b` | 2.3B | Q8_0 | 2.36 GB |

No son simétricos: Gemma 4 **E2B** son ~2B parámetros *efectivos* por token, pero el archivo trae ~4.6B en total (embeddings por capa) cuantizados a Q4 (QAT); Qwen 3.5 2B son ~2.3B densos a Q8. Los consideramos comparables por **presupuesto de despliegue**, no por conteo de parámetros: ambos son la opción "~2B" que su familia publica para dispositivo/edge, ambos caben con holgura en una L4 (24 GB) o en 32 GB de RAM, y lo que importa para esta app es calidad por segundo y por GB. Por eso reportamos memoria real y velocidad, no solo el nombre.

## Latencia (corridas tibias)

| Modelo | Tarea | n | TTFT p50 | Total p50 | Total p95 | tok/s (media) | Tokens salida | Errores |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | nota | 36 | 240 ms | 2.1 s | 2.3 s | 117.7 | 216 | 0 |
| `gemma4:e2b-it-qat` | requisitos | 27 | 294 ms | 810 ms | 956 ms | 115.7 | 59 | 0 |
| `qwen3.5:2b` | nota | 36 | 241 ms | 3.4 s | 4.2 s | 73.5 | 226 | 0 |
| `qwen3.5:2b` | requisitos | 27 | 239 ms | 1.6 s | 2.4 s | 73.4 | 106 | 0 |

### Frío (modelo descargado → primera respuesta)

| Modelo | Carga del modelo | TTFT | Total | tok/s |
| --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | 3.4 s | 3.8 s | 5.7 s | 112.9 |
| `qwen3.5:2b` | 7.3 s | 7.7 s | 10.5 s | 73.1 |

## Memoria

| Modelo | Modo | size | size_vram |
| --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | GPU | 1.80 GB | 1.80 GB |
| `qwen3.5:2b` | GPU | 2.36 GB | 2.36 GB |

## Calidad determinista

**Nota de negociación**

| Modelo | n | Español | Largo OK | Cifras consistentes | Cifras inventadas (total) | En tema | 2.ª persona | Palabras (media) | Puntaje |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | 36 | 100 % | 100 % | 97 % | 1 | 100 % | 39 % | 153 | 0.89 |
| `qwen3.5:2b` | 36 | 100 % | 100 % | 100 % | 0 | 100 % | 100 % | 166 | 1.00 |

**Requisitos (JSON)**

| Modelo | n | JSON válido | Esquema OK | Grounding | Recall | Mencionó salario | Puntaje |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | 27 | 100 % | 100 % | 77 % | 78 % | 0 | 0.91 |
| `qwen3.5:2b` | 27 | 100 % | 100 % | 97 % | 100 % | 9 | 0.93 |

## Juez LLM

| Modelo | Tarea | utilidad | precision | tono | fidelidad |
| --- | --- | --- | --- | --- | --- |
| `gemma4:e2b-it-qat` | nota | 3.75 | 3.50 | 3.46 | 4.46 |
| `gemma4:e2b-it-qat` | requisitos | 4.06 | 3.78 | 4.94 | 3.94 |
| `qwen3.5:2b` | nota | 3.83 | 3.38 | 4.21 | 3.88 |
| `qwen3.5:2b` | requisitos | 2.83 | 2.61 | 4.94 | 2.89 |

**Sesgos del juez.** Posición: en 42 juicios (cada par juzgado en ambos órdenes A/B y B/A; la tabla promedia ambos), la respuesta mostrada primero ganó 23 veces (0 empates); si el juez fuera neutral, ~50 % de los no empatados. Otros sesgos conocidos que NO controlamos: preferencia por textos largos, y afinidad de familia (Gemini juzgando a Gemma, ambos de Google). Además el juez es el mismo modelo que escribe la carta en la app. Por eso el juez es una señal más, no el veredicto: los chequeos deterministas pesan igual en el compuesto.

## Conclusión


**Empate técnico en el agregado** (`gemma4:e2b-it-qat` 0.846 vs `qwen3.5:2b` 0.843; compuesto = promedio de calidad determinista y juez normalizado a 0–1). La decisión depende de la tarea:

**Mejor modelo por tarea:**
- **nota de negociación** → `qwen3.5:2b` (gemma4:e2b-it-qat 0.83 · qwen3.5:2b 0.88)
- **extracción de requisitos** → `gemma4:e2b-it-qat` (gemma4:e2b-it-qat 0.87 · qwen3.5:2b 0.80)

**Dónde gana `gemma4:e2b-it-qat`** (hechos medidos):
- promedio del juez (1–5): gemma4:e2b-it-qat 3.96 · qwen3.5:2b 3.61
- juez en requisitos (1–5): gemma4:e2b-it-qat 4.18 · qwen3.5:2b 3.32
- extracciones que metieron el salario como requisito: gemma4:e2b-it-qat 0 · qwen3.5:2b 9
- latencia p50 de la nota: gemma4:e2b-it-qat 2.1 s · qwen3.5:2b 3.4 s
- velocidad de generación (tok/s): gemma4:e2b-it-qat 117.7 · qwen3.5:2b 73.5
- carga en frío: gemma4:e2b-it-qat 3.4 s · qwen3.5:2b 7.3 s
- memoria ocupada: gemma4:e2b-it-qat 1.80 GB · qwen3.5:2b 2.36 GB

**Dónde gana `qwen3.5:2b`:**
- calidad determinista (0–1): gemma4:e2b-it-qat 0.90 · qwen3.5:2b 0.96
- juez en la nota (1–5): gemma4:e2b-it-qat 3.79 · qwen3.5:2b 3.82
- notas con cifras consistentes: gemma4:e2b-it-qat 97 % · qwen3.5:2b 100 %
- notas en segunda persona: gemma4:e2b-it-qat 39 % · qwen3.5:2b 100 %
- fidelidad de requisitos a la oferta (grounding): gemma4:e2b-it-qat 77 % · qwen3.5:2b 97 %

### Decisión

**Para esta app gana `gemma4:e2b-it-qat`**, y es el modelo por defecto (`OLLAMA_MODEL`).

El agregado es un empate (0.846 vs 0.843), así que la decisión sale de qué error es más grave en *esta* app y de cómo se comporta cada modelo en el hardware donde corre:

- **El error de Qwen toca la privacidad.** En 9 de 27 extracciones metió la pretensión salarial o el rango de la oferta como "requisito". Esa lista viaja después hacia Gemini (nivel 2, tercero). El redactor del router quitó los montos antes de salir, así que no hubo fuga, pero la app dependió de su segunda línea de defensa. Gemma lo hizo 0 de 27 veces.
- **El error de Gemma es de tono.** Escribió en primera persona ("mi expectativa…") en 61 % de las notas en vez de hablarle a la persona. Molesta, pero no expone datos, y el juez le da la mayor fidelidad a los datos en la nota (4.46 vs 3.88).
- **En GPU, Gemma gana también en costo de operación:** genera 1.6× más rápido (118 vs 74 tok/s; nota p50 2.1 s vs 3.4 s), carga en frío en la mitad del tiempo (3.4 s vs 7.3 s) y ocupa menos VRAM (1.80 GB vs 2.36 GB).

**En qué pierde el ganador:**

- **La nota**: Qwen la escribe con mejor tono (4.21 vs 3.46) y siempre en segunda persona (100 % vs 39 %); el juez las deja casi empatadas en utilidad.
- **Una cifra inconsistente** en 36 notas (97 % vs 100 %). La app la marca en pantalla porque los números oficiales salen de las heurísticas, nunca del modelo.
- **Fidelidad a la oferta en requisitos** (grounding 77 % vs 97 %): Gemma traduce al español los requisitos de ofertas en inglés, y el chequeo por palabras lo cuenta como "no está en la oferta".

**CPU vs GPU (mismos modelos, misma imagen, 8 vCPU / 32 GiB vs L4):**

| | Gemma 4 E2B CPU | Gemma 4 E2B GPU | Qwen 3.5 2B CPU | Qwen 3.5 2B GPU |
|---|---:|---:|---:|---:|
| tok/s | 18.6 | 117.7 | 15.9 | 73.5 |
| Nota p50 | 16.9 s | 2.1 s | 18.2 s | 3.4 s |
| Carga en frío del modelo | 10.2 s | 3.4 s | 8.4 s | 7.3 s |
| Memoria | 4.05 GB RAM | 1.80 GB VRAM | 2.36 GB RAM | 2.36 GB VRAM |

Dos cosas que no esperábamos: en CPU Qwen ocupaba **menos** memoria y cargaba más rápido, y en GPU la ventaja se invierte (Ollama solo sube a la GPU las capas que Gemma usa para texto). **El ranking de "cuál es más liviano" depende del hardware**: por eso se mide en el hardware de producción. La calidad, en cambio, casi no cambió entre corridas (mismo modelo, misma cuantización). El reporte completo de CPU está en [`bench/BENCHMARK-cpu.md`](BENCHMARK-cpu.md).

**Siguiente paso natural:** enrutar por tarea dentro del nivel 1 (Qwen para la nota, Gemma para los requisitos). Con una L4 hay memoria de sobra para los dos modelos, así que ya no es un problema de recursos sino de complejidad; lo dejamos como mejora.

## Reproducir

```bash
export OLLAMA_URL=https://ollama-coverletter-<id>.us-central1.run.app   # o http://localhost:11434
gcloud auth application-default login                                    # para el juez (Vertex AI)
npm run bench                                   # 3 corridas tibias + 1 fría por modelo
npm run bench -- --runs 1 --inputs 6 --no-judge # corrida corta (útil en CPU)
npm run bench -- --dry                          # Ollama simulado, prueba el pipeline
```
