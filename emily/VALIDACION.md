# Validación — Emily (aprendizajes)

> Generado automáticamente por `npm run eval` (`eval/report.ts`) el 25/9/2026, 5:27:29 p. m. (hora de Guatemala). Modo: full. Duración: 15 min. Datos crudos: `eval/results/`.

## 1. Método

- **18 perfiles ficticios** (`eval/fixtures/*.json`) con sabor guatemalteco: junior y senior, técnicos y no técnicos, con y sin oferta, ofertas en español e inglés, texto desordenado. Cada perfil lista sus **canarios** (datos sensibles plantados, con tipo y dificultad) y una lista `allowed` de textos no sensibles que deben sobrevivir (para medir falsos positivos).
- **Fugas**: se ejecuta el router real (`buildCloudPayload`: lista blanca → redactor → compuerta final) y se busca cada canario en el texto exacto que saldría a la nube. Si la compuerta bloquea, no sale nada y el canario cuenta como atrapado.
- **Calidad**: para cada perfil se generan tres cartas: (a) **local**, `onnx-community/gemma-4-E2B-it-qat-mobile-ONNX` con transformers.js en Node (mismo id de modelo, dtype, plantilla de chat y constructor de prompt que el navegador); (b) **nube**, `gemini-3.8-flash` con el mismo prompt que arma el router, llamado vía @google/genai (Vertex AI, ADC) (proyecto `ai-experiments-487722`, región `global`) en lugar de Firebase AI Logic (GoogleAIBackend), porque Firebase AI Logic es un SDK de navegador protegido con App Check y no se puede invocar desde un script de Node; el modelo y el prompt son los mismos; (c) **plantilla** determinista como línea base.
- **Calificación**: 6 criterios (ver [`eval/CRITERIOS.md`](eval/CRITERIOS.md)), cada uno con una regla determinista y con un juez `gemini-3.8-flash` a temperatura 0, a ciegas: cartas etiquetadas A/B/C con **posiciones balanceadas** (las 6 permutaciones, 3 casos cada una: cada fuente cae 6 veces en cada posición).
- Cartas reutilizadas de la caché `.cache/eval-letters` (generadas en una corrida anterior con el mismo prompt): local 18/18, nube 17/18. Latencias y tokens son los de la generación original.

## 2. Fugas de datos sensibles (router + redactor + compuerta)

Se corrió el **código real** de `src/lib/router.ts` (`buildCloudPayload`) sobre los 18 perfiles, con 78 canarios plantados. Un canario "se fuga" si aparece en el texto exacto que saldría hacia la nube (comparación sin mayúsculas ni tildes, separadores de miles colapsados, con límites de palabra; para números de 6+ dígitos también se buscan los dígitos seguidos). "Fuga parcial" = sobrevive un apellido o una palabra distintiva del canario.

### 2.1 Recall por tipo

| Tipo | Canarios | Atrapados por el redactor | Fugas | Fugas parciales | Recall final |
|---|---:|---:|---:|---:|---:|
| Salario / montos | 26 | 24 | 2 | 0 | 92 % |
| Empleador actual | 15 | 13 | 2 | 0 | 87 % |
| Nombres de personas | 11 | 6 | 5 | 0 | 55 % |
| Teléfono | 6 | 5 | 1 | 0 | 83 % |
| Correo | 5 | 4 | 1 | 0 | 80 % |
| DPI | 3 | 3 | 0 | 0 | 100 % |
| Dirección | 9 | 8 | 1 | 0 | 89 % |
| NIT | 3 | 3 | 0 | 0 | 100 % |
| **Total** | **78** | **66** | **12** | **0** | **85 %** |

### 2.2 Por dificultad del canario

| Dificultad | Canarios | Atrapados | Recall |
|---|---:|---:|---:|
| fácil | 44 | 44 | 100 % |
| media | 20 | 20 | 100 % |
| difícil | 14 | 2 | 14 % |

### 2.3 Compuerta final y controles estructurales

- Casos enviados: **18** · bloqueados por la compuerta: **0** · casos con al menos una fuga: **8**.
- **Salario actual (campo del formulario) en cualquier forma escrita dentro del payload enviado: 0 de 18 casos.** (Se busca 15000, 15,000, 15.000, Q 15 000, 15k, 15 mil, "quince mil", etc.)
- Nombre declarado del empleador actual dentro del payload enviado: 0 de 18 casos.
- Falsos positivos (textos no sensibles de la lista `allowed` que el redactor tachó): **0 de 101**.

### 2.4 Canarios que se fugaron y por qué

| Caso | Tipo | Canario | Dificultad | Resultado | Por qué se escapó |
|---|---|---|---|---|---|
| `01-junior-soporte-tigo` | Empleador actual | "TIGO" | difícil | fuga | marca de 4 letras en mayúsculas; el nombre declarado es "Tigo Guatemala": el redactor solo conoce el nombre declarado (exacto, con typos, acrónimo, sin espacios y palabras distintivas de 5+ letras); apodos o marcas cortas no derivables del nombre se escapan |
| `06-vendedor-texto-desordenado` | Nombres de personas | "don Beto" | difícil | fuga | apodo con "don" en minúscula, sin apellido: solo se reconocen personas presentadas con un cargo (jefe, gerente, compañera…) o un título (Lic., Ing.…) y escritas con mayúscula inicial |
| `07-nombres-minuscula` | Nombres de personas | "Carlos Méndez" | difícil | fuga | nombre sin cargo delante: solo se reconocen personas presentadas con un cargo (jefe, gerente, compañera…) o un título (Lic., Ing.…) y escritas con mayúscula inicial |
| `07-nombres-minuscula` | Nombres de personas | "ana lópez" | difícil | fuga | nombre en minúscula: solo se reconocen personas presentadas con un cargo (jefe, gerente, compañera…) o un título (Lic., Ing.…) y escritas con mayúscula inicial |
| `09-contacto-ofuscado` | Correo | "carla punto ruiz arroba gmail punto com" | difícil | fuga | correo ofuscado: la regla reconoce el formato con @; un correo deletreado ("arroba", "punto") no |
| `09-contacto-ofuscado` | Teléfono | "+502 55 55 12 34" | difícil | fuga | agrupado 2-2-2-2: la regla reconoce 8 dígitos agrupados 4-4 (con o sin +502); otros agrupamientos se escapan |
| `12-salario-formas-dificiles` | Salario / montos | "doce y medio" | difícil | fuga | coloquial, sin "mil": sin moneda, sin "mil"/"k" y sin cifra de 4+ dígitos, el texto no se distingue de otros números sin entender el contexto |
| `12-salario-formas-dificiles` | Salario / montos | "12,5" | difícil | fuga | "12,5" significando 12,500: sin moneda, sin "mil"/"k" y sin cifra de 4+ dígitos, el texto no se distingue de otros números sin entender el contexto |
| `13-personas-variadas` | Nombres de personas | "Luis Fernando Ajú" | difícil | fuga | sin cargo: solo se reconocen personas presentadas con un cargo (jefe, gerente, compañera…) o un título (Lic., Ing.…) y escritas con mayúscula inicial |
| `14-direcciones` | Empleador actual | "Cerve" | difícil | fuga | apodo del empleador: el redactor solo conoce el nombre declarado (exacto, con typos, acrónimo, sin espacios y palabras distintivas de 5+ letras); apodos o marcas cortas no derivables del nombre se escapan |
| `14-direcciones` | Dirección | "Vista Hermosa III" | difícil | fuga | colonia sin palabra clave: sin palabra clave (zona, calle, avenida, colonia, residenciales, km…) un nombre de colonia es indistinguible de otro nombre propio |
| `16-gerente-oferta-ingles-pretension` | Nombres de personas | "Ricardo Arzú" | difícil | fuga | cargo "CEO" no está en la lista de roles: solo se reconocen personas presentadas con un cargo (jefe, gerente, compañera…) o un título (Lic., Ing.…) y escritas con mayúscula inicial |

### 2.5 ¿Las fugas terminaron escritas en la carta?

Un dato que se escapa del redactor no solo llega a Google: el modelo puede **escribirlo en la carta**, que luego se envía a un tercero. De 12 canarios fugados, **5** aparecen en la carta de la nube:

- `07-nombres-minuscula` Nombres de personas "Carlos Méndez" → en la carta: "urante este tiempo, junto con Carlos Méndez, rediseñamos los turnos de tr"
- `07-nombres-minuscula` Nombres de personas "ana lópez" → en la carta: "esultados motivó que mi jefa, Ana López, me nominara al reconocimient"
- `13-personas-variadas` Nombres de personas "Luis Fernando Ajú" → en la carta: "njunta con profesionales como Luis Fernando Ajú. En este contexto, llevé a ca"
- `14-direcciones` Empleador actual "Cerve" → en la carta: " mi trayectoria laboral en la Cerve, alcancé una reducción del do"
- `16-gerente-oferta-ingles-pretension` Nombres de personas "Ricardo Arzú" → en la carta: "directa al Director Ejecutivo Ricardo Arzú, una responsabilidad que ha f"

### 2.6 Falsos positivos

Ningún texto de la lista `allowed` fue tachado.


Además hubo 10 tachaduras que no corresponden a ningún canario (no cuentan como falso positivo, pero se listan para inspección): `02-analista-datos-bi` salary "Q18,000"; `02-analista-datos-bi` salary "Q22,000"; `04-disenadora-usd-oferta-ingles` salary "USD 4,000"; `04-disenadora-usd-oferta-ingles` salary "4,800"; `08-dev-remoto-oferta-ingles` salary "$3,500"; `08-dev-remoto-oferta-ingles` salary "$4,000"; `11-barista-falsos-positivos` employer "Barista"; `14-direcciones` address "carretera a El Salvador"; `18-mezcla-typos-bam` salary "USD 3,500"; `18-mezcla-typos-bam` salary "4,200". La mayoría son rangos salariales de la oferta: no son del usuario, pero la carta no los necesita.

## 3. Calidad de la carta: local vs nube vs plantilla

Cartas generadas: local 18, nube 18, plantilla 18. Cada celda muestra **% que pasa la regla determinista** / **promedio del juez (1–5)**. Definición de cada criterio en [`eval/CRITERIOS.md`](eval/CRITERIOS.md).

| Criterio | Local (Gemma 4 E2B) | Nube (gemini-3.8-flash) | Plantilla |
|---|---:|---:|---:|
| Ajuste a la oferta | 94 % / 2.39 | 94 % / 4.72 | 89 % / 2.83 |
| Cero datos inventados | 94 % / 4.28 | 83 % / 5.00 | 94 % / 4.61 |
| Tono profesional | 100 % / 2.94 | 100 % / 4.94 | 100 % / 3.61 |
| Longitud 250–400 | 28 % / 3.11 | 94 % / 4.78 | 100 % / 5.00 |
| Español correcto | 100 % / 2.61 | 100 % / 4.78 | 100 % / 4.17 |
| Cierre con llamada a la acción | 83 % / 4.17 | 94 % / 4.78 | 100 % / 5.00 |
| **Global** | **83 % / 3.25** | **94 % / 4.83** | **97 % / 4.20** |

Longitud (palabras): Local (Gemma 4 E2B) media 234 (mín 179, máx 323) · Nube (gemini-3.8-flash) media 273 (mín 188, máx 312) · Plantilla media 279 (mín 254, máx 293).

### 3.1 ¿Coinciden las reglas y el juez?

Acuerdo entre "pasa la regla" y "juez ≥ 4", juntando las tres fuentes. κ = kappa de Cohen (0 = azar, 1 = acuerdo perfecto).

| Criterio | n | Acuerdo | κ |
|---|---:|---:|---:|
| Ajuste a la oferta | 54 | 44 % | 0.09 |
| Cero datos inventados | 54 | 81 % | -0.10 |
| Tono profesional | 54 | 52 % | 0.00 |
| Longitud 250–400 | 54 | 96 % | 0.91 |
| Español correcto | 54 | 65 % | 0.00 |
| Cierre con llamada a la acción | 54 | 93 % | 0.46 |

### 3.2 Sesgos del juez

| Fuente | Juez (1–5) | Reglas reescaladas a 1–5 | Diferencia juez − reglas |
|---|---:|---:|---:|
| Local (Gemma 4 E2B) | 3.25 | 4.33 | -1.08 |
| Nube (gemini-3.8-flash) | 4.83 | 4.78 | 0.06 |
| Plantilla | 4.20 | 4.89 | -0.69 |

Posición ciega: promedio del juez por etiqueta A = 4.19, B = 4.13, C = 3.96. Distribución de etiquetas por fuente: local {"A":6,"C":6,"B":6}; nube {"B":6,"A":6,"C":6}; plantilla {"C":6,"B":6,"A":6}.

Riesgo de **auto-preferencia**: el juez es el mismo modelo que escribió la carta de la nube. Mitigaciones aplicadas: cartas etiquetadas A/B/C con posiciones balanceadas, temperatura 0, rúbrica con anclas explícitas, instrucción de no premiar la longitud ni adivinar el origen, y reporte paralelo de la puntuación **solo determinista** (que no puede tener auto-preferencia). Si la diferencia juez − reglas es claramente mayor para la nube que para las otras fuentes, es una señal de sesgo.

### 3.3 Latencia y costo

| Fuente | Latencia media | Mediana | Máxima |
|---|---:|---:|---:|
| Local (Gemma 4 E2B) | 12.9 s | 12.7 s | 16.3 s |
| Nube (gemini-3.8-flash) | 39.0 s | 25.3 s | 130.9 s |
| Plantilla | < 0.01 s | — | — |

- Local: `onnx-community/gemma-4-E2B-it-qat-mobile-ONNX` (q2f16) en transformers.js (Node, onnxruntime-node), dispositivo `webgpu`, máquina: darwin arm64 · Apple M1 Max · 69 GB RAM. Costo marginal: 0 (corre en el dispositivo); costo real: descarga única de ~2.3 GB.
- Nube: 8,793 tokens de entrada, 6,238 de salida y 40,553 de razonamiento en total → **US$0.1821** (≈ US$0.01011 por carta) a US$0.75 / US$3.75 por millón. Precio introductorio hasta el 31-12-2026; desde el 1-1-2027: US$1.50 / US$7.50 por millón (entrada / salida con razonamiento).
- Juez: 39,509 tokens de entrada, 63,662 de salida+razonamiento → US$0.2684.

### 3.4 Detalle por caso

| Caso | Nube | Palabras L / N / P | Reglas L / N / P (de 6) | Juez L / N / P |
|---|---|---|---|---|
| `01-junior-soporte-tigo` | enviada | 179 / 267 / 291 | 5 / 6 / 6 | 3.33 / 5.00 / 4.33 |
| `02-analista-datos-bi` | enviada | 210 / 290 / 285 | 4 / 6 / 6 | 2.83 / 5.00 / 4.00 |
| `03-contador-xela` | enviada | 284 / 259 / 278 | 6 / 6 / 6 | 4.00 / 5.00 / 4.67 |
| `04-disenadora-usd-oferta-ingles` | enviada | 199 / 280 / 287 | 5 / 6 / 6 | 3.83 / 4.83 / 4.50 |
| `05-enfermera-no-tech` | enviada | 231 / 294 / 286 | 4 / 6 / 6 | 2.83 / 5.00 / 3.83 |
| `06-vendedor-texto-desordenado` | enviada | 238 / 277 / 266 | 5 / 6 / 6 | 3.00 / 5.00 / 4.50 |
| `07-nombres-minuscula` | enviada | 323 / 272 / 288 | 6 / 5 / 6 | 3.67 / 5.00 / 4.17 |
| `08-dev-remoto-oferta-ingles` | enviada | 239 / 285 / 293 | 4 / 6 / 6 | 3.17 / 5.00 / 3.83 |
| `09-contacto-ofuscado` | enviada | 220 / 266 / 254 | 5 / 6 / 6 | 2.83 / 5.00 / 4.00 |
| `10-maestra-colegio` | enviada | 218 / 312 / 278 | 5 / 6 / 5 | 3.50 / 5.00 / 4.50 |
| `11-barista-falsos-positivos` | enviada | 251 / 271 / 283 | 5 / 5 / 5 | 3.67 / 4.83 / 4.33 |
| `12-salario-formas-dificiles` | enviada | 213 / 264 / 279 | 5 / 6 / 6 | 2.67 / 5.00 / 3.50 |
| `13-personas-variadas` | enviada | 234 / 271 / 279 | 5 / 6 / 6 | 3.33 / 4.67 / 4.33 |
| `14-direcciones` | enviada | 249 / 283 / 283 | 5 / 6 / 6 | 3.83 / 5.00 / 4.33 |
| `15-dpi-nit-variantes` | enviada | 267 / 285 / 267 | 6 / 5 / 5 | 2.83 / 4.67 / 4.67 |
| `16-gerente-oferta-ingles-pretension` | enviada | 255 / 188 / 275 | 5 / 3 / 6 | 3.00 / 3.00 / 4.33 |
| `17-recien-graduado-minimo` | enviada | 229 / 276 / 287 | 5 / 6 / 6 | 3.00 / 5.00 / 4.17 |
| `18-mezcla-typos-bam` | enviada | 179 / 267 / 269 | 5 / 6 / 6 | 3.17 / 5.00 / 3.67 |

## 4. Hallazgos

- **El salario actual nunca salió** como campo ni en ninguna de sus formas numéricas conocidas (0 de 18 casos enviados). Lo que sí se escapó fueron **formas coloquiales** escritas en texto libre: el redactor determinista no entiende el contexto.
- Recall final 85 % sobre 78 canarios; los tipos más débiles: Nombres de personas (55 %), Correo (80 %), Teléfono (83 %). Por dificultad: fácil 100 %, media 100 %, difícil 14 %. Las fugas se concentran en canarios diseñados como difíciles: el resultado es honesto, no un 100 % de vitrina.
- Falsos positivos: 0 de 101 textos permitidos. La primera corrida de esta evaluación encontró 7 casos bloqueados por error y 2 falsos positivos causados por el propio redactor (ver `docs/decisiones.md`); se corrigieron y quedaron como pruebas de regresión.
- **5 de los canarios fugados terminaron escritos en la carta de la nube** ("Carlos Méndez", "ana lópez", "Luis Fernando Ajú", "Cerve", "Ricardo Arzú"): el modelo no solo los recibió, los usó. El redactor protege a Google y también al destinatario de la carta.
- Calidad (juez 1–5): Local (Gemma 4 E2B) 3.25, Nube (gemini-3.8-flash) 4.83, Plantilla 4.20. Reglas deterministas (proporción de criterios cumplidos): local 83 %, nube 94 %, plantilla 97 %. Mejor según el juez: **Nube (gemini-3.8-flash)**.
- Juez − reglas (escala 1–5): local -1.08, nube 0.06, plantilla -0.69. El juez es **más severo que las reglas con las cartas que no escribió** y coincide con ellas en la suya. Hay dos lecturas y los datos no alcanzan para separarlas: auto-preferencia, o reglas demasiado permisivas (no ven palabras rotas, relleno genérico ni frases copiadas; ver los comentarios del juez en `eval/results/`). Lo prudente: tratar la ventaja de la nube en *tono* y *español* como probable pero inflada, y la de *ajuste a la oferta* como real (las cartas locales casi no usan los logros concretos).
- Reglas vs juez: el acuerdo es bajo en Ajuste a la oferta (44 %), Tono profesional (52 %), Español correcto (65 %); en esos criterios la regla y el juez miden cosas distintas o uno de los dos se equivoca (ver 3.1).
- Latencia: local 12.7 s por carta (mediana, webgpu en esta máquina) vs nube 25.3 s. El borrador local es viable en una laptop con GPU; en CPU pura es de minutos (ver `docs/decisiones.md`).

## 5. Ejemplo de lo que sale a la nube

Prompt de usuario enviado para el primer caso (el system prompt es fijo y está en `src/lib/prompt.ts`):

```text
Escribe la carta de interés con estos datos del candidato.

Nombre para la firma: {{NOMBRE}}
Puesto actual: Agente de soporte técnico
Empleador actual: no se menciona en la carta
Años de experiencia: 1
Puesto al que aplica: Desarrollador web junior
Empresa destino: Nearsure

Logros y experiencia (texto del candidato):
<<<
En TIGO atiendo unos 60 tickets diarios y armé una base de conocimiento en Notion.
Hice un curso de JavaScript y React y publiqué 2 proyectos en GitHub.
Hoy gano [SALARIO], o sea [SALARIO], y quiero dar el salto.
Mi jefe [PERSONA] me recomienda para el puesto. Mi cel es [TELÉFONO].
>>>

No se proporcionó oferta: enfoca la carta en el puesto y la empresa destino.
```

## 6. Ejemplo de cartas (caso `02-analista-datos-bi`)

### Local (Gemma 4 E2B)

> Estimado equipo de Telus International,
> 
> Me dirijo a ustedes con gran entusiasmo para expresar mi profundo interés en la posición de Data Engineer. Mi trayectoria profesional me ha preparado para aportar valor a su organización, y estoy convencida de que mi experiencia se al aline con sus requerimientos.
> 
> Mi experiencia previa me ha permitido desarrollar habilidades sólidas en análisis de datos y gestión de procesos. He desarrollado la habilidad de automatizar reportes complejos, logrando reducir errores significativos y optimizar procesos internos. Además, he gestionado proyectos de migración de datos y he trabajado en la implementación de soluciones basadas en BigQuery, demostrando mi capacidad para adaptarme a entornos tecnológicos modernos.
> 
> He demostrado mi capacidad para transformar datos en información tangible, logrando mejoras significativas en la eficiencia operativa y la precisión de los resultados. Mi enfoque siempre ha sido maximizar la eficiencia y la calidad de la información, lo cual se alAlignment perfectamente con los desafíos que requiere este rol.
> 
> Estoy muy interesada en aplicar mis habilidades técnicas en un entorno desafiante como el que ofrecen, y estoy lista para contribuir activamente al éxito de Telus International. Estoy muy entusiasmada por la oportunidad de discutir cómo mi experiencia puede beneficiar a su equipo. Agradezco su tiempo y consideración.
> 
> Atentamente,
> 
> Ana Lucía Pérez

Juez: ajuste_oferta 2, cero_inventados 4, tono 3, longitud 3, espanol 2, cta 3. _Presenta errores notorios de redacción y edición (como 'se al aline' y 'se alAlignment'). Es vaga al diluir las métricas reales ('reportes complejos', 'mejoras significativas' en lugar de 20 horas o 30%). Además, su longitud queda corta respecto al rango óptimo y el cierre es genérico._

### Nube (gemini-3.8-flash)

> Estimado equipo de selección de Telus International:
> 
> Me dirijo a ustedes con el propósito de presentar formalmente mi postulación a la posición de Data Engineer en Telus International. Cuento con cinco años de experiencia en el área de análisis de datos, tiempo durante el cual me he dedicado a optimizar procesos, construir soluciones tecnológicas confiables y asegurar la calidad de la información para la toma de decisiones. Mi interés principal radica en continuar mi crecimiento profesional integrándome a un equipo de alto rendimiento como el de ustedes.
> 
> A lo largo de mi trayectoria, he liderado iniciativas enfocadas en la eficiencia operativa mediante la programación. Entre mis principales logros, destaca la automatización de los reportes de cartera utilizando Python, una medida que permitió ahorrar 20 horas al mes de trabajo operativo. De igual manera, gracias a la revisión meticulosa y al perfeccionamiento de los procesos de verificación de datos, logré reducir en un 30% los errores de conciliación, fortaleciendo la precisión y fiabilidad de los resultados obtenidos.
> 
> Asimismo, en sintonía con las necesidades del puesto de Data Engineer que ustedes solicitan, cuento con experiencia práctica en arquitecturas modernas de almacenamiento en la nube, habiendo participado con éxito en la migración de tres bases de datos hacia BigQuery. Considero que mi experiencia práctica con Python y BigQuery, aunada a mi compromiso con la mejora continua, me permitirá adaptarme con rapidez a sus flujos de trabajo y aportar soluciones sólidas a su infraestructura.
> 
> Agradezco sinceramente el tiempo y la consideración brindados a mi candidatura. Me gustaría mucho tener la oportunidad de coordinar una entrevista con ustedes para conversar en detalle sobre mi perfil y explicar cómo mis competencias técnicas y logros alcanzados pueden sumar al éxito de Telus International.
> 
> Atentamente,
> 
> Ana Lucía Pérez

Juez: ajuste_oferta 5, cero_inventados 5, tono 5, longitud 5, espanol 5, cta 5. _Excelente carta. Integra de manera fluida y convincente los logros del candidato (automatización en Python, reducción de errores del 30% y migración a BigQuery) con los requisitos del puesto. Tono profesional impecable, sin inventar información ni mencionar el salario, dentro del rango de extensión adecuado y con un cierre claro que invita a coordinar una entrevista._

### Plantilla

> Estimado equipo de Telus International:
> 
> Me dirijo a ustedes para expresar mi interés en el puesto de Data Engineer. Cuento con 5 años de experiencia. Durante este tiempo he desarrollado una forma de trabajar ordenada, orientada a resultados y con atención al detalle, que me gustaría poner al servicio de Telus International.
> 
> Entre los logros que mejor describen mi trabajo destaco los siguientes: automaticé en Python los reportes de cartera: ahorro de 20 horas al mes; y reduje en 30% los errores de conciliación. Estas experiencias me enseñaron a priorizar, a coordinarme con personas de distintas áreas y a sostener la calidad aun con plazos exigentes.
> 
> Al revisar la oferta noté que buscan a alguien con Python y SQL avanzado; BigQuery o Snowflake; y Airflow. Considero que mi trayectoria se alinea con estas necesidades y que puedo aportar desde el primer día como Data Engineer.
> 
> Me caracterizo por comunicarme con claridad, documentar lo que hago y pedir retroalimentación de forma constante. Disfruto trabajar en equipo y creo que los mejores resultados aparecen cuando se comparten el conocimiento y los objetivos.
> 
> También valoro los entornos donde se aprende de forma continua; por eso dedico tiempo a actualizarme y a compartir con mis compañeros lo que voy aprendiendo.
> 
> Busco un lugar donde pueda asumir retos nuevos, recibir retroalimentación honesta y crecer junto a un equipo comprometido con hacer bien las cosas. Tengo la convicción de que puedo sumar tanto por lo que ya sé hacer como por mi disposición a seguir aprendiendo.
> 
> Me encantaría conversar con ustedes en una entrevista para ampliar cómo puedo contribuir a los objetivos de Telus International. Quedo a su disposición y agradezco de antemano su tiempo y consideración.
> 
> Atentamente,
> 
> Ana Lucía Pérez

Juez: ajuste_oferta 3, cero_inventados 4, tono 3, longitud 5, espanol 4, cta 5. _La carta tiene una estructura un tanto fragmentada y copia textualmente viñetas de los logros y requisitos de la oferta sin integrarlos narrativamente. Además, omite el logro clave de BigQuery y llena espacio con lugares comunes sobre trabajo en equipo y aprendizaje. El llamado a la acción y la extensión son correctos._

---
Entorno: Node v24.21.0 · darwin arm64 · Apple M1 Max · 69 GB RAM.
