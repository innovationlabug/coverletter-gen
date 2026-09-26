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
