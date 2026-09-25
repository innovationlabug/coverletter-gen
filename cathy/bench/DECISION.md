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
