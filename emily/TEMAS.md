# Tres temas que merecen su propio artículo

Salen de lo que encontré en la [validación](VALIDACION.md) y en la [prueba didáctica](DIDACTICA.md). Están ordenados por prioridad: el primero tiene la evidencia más fuerte y el público más amplio.

## 1. "Mi redactor atrapa el 85 %: por qué eso es una buena noticia"

- **A quién le sirve:** a quien construye apps con LLMs que manejan datos personales (salud, finanzas, RR. HH.) y cree que una lista de expresiones regulares basta.
- **Qué aprende:**
  - cómo diseñar un set de prueba con **datos trampa** de dificultad graduada;
  - por qué un 100 % casi siempre significa que las pruebas son fáciles;
  - cómo separar el *recall* del redactor, el de la compuerta final y los bloqueos falsos.
- **Por qué vale la pena:** casi todos los tutoriales muestran el redactor funcionando. Casi ninguno mide dónde falla ni qué pasa después con lo que se escapa.
- **Evidencia:**
  - 78 datos trampa en 18 perfiles: 100 % en los fáciles y medios, 14 % en los difíciles (apodos como "don Beto", "doce y medio", correos deletreados);
  - **5 de los 12 datos fugados terminaron escritos en la carta** que se envía a un tercero, así que el redactor también protege al destinatario;
  - la primera corrida "mejoró" el recall a 94.9 % **por un bug**: bloqueaba 7 casos por error. La métrica honesta salió más baja y más útil.

## 2. "El juez LLM prefiere su propia letra"

- **A quién le sirve:** a equipos que usan un LLM como evaluador (*LLM-as-a-judge*) para comparar modelos o prompts.
- **Qué aprende:**
  - cómo detectar el sesgo de posición y la auto-preferencia;
  - cómo balancear posiciones con las 6 permutaciones;
  - por qué conviene reportar en paralelo una puntuación **solo determinista**;
  - cómo leer el acuerdo entre la regla y el juez con kappa de Cohen.
- **Por qué vale la pena:** el juez LLM se volvió el estándar para evaluar, y sus sesgos se miden poco.
- **Evidencia:**
  - la diferencia juez − reglas es de **+0.06 para las cartas de Gemini** (mismo modelo que el juez), contra −1.08 para las locales y −0.69 para la plantilla;
  - el juez y las reglas casi no coinciden en ajuste a la oferta, tono y español (κ ≈ 0), y sí coinciden en longitud (κ 0.91);
  - un error real: con un barajado con semilla, la carta de la nube cayó en la posición C 12 de 18 veces, y el sesgo de posición se confundía con calidad.

## 3. "Un README es una interfaz: lo probé con alguien que nunca vio el proyecto"

- **A quién le sirve:** a quien publica repos para un equipo, un curso o una comunidad.
- **Qué aprende:**
  - cómo hacer una prueba didáctica paso a paso y cómo clasificar las fricciones (bloqueante, confusa, menor);
  - por qué los **permisos** y las **salidas esperadas** son parte de las instrucciones.
- **Por qué vale la pena:** es barato, casi nadie lo hace, y cambia la experiencia de la primera persona que llega.
- **Evidencia:**
  - 11 fricciones en la primera ronda: la primera fue una imagen rota;
  - el bloqueo más serio no era técnico: el README no decía quién tenía permiso para seguirlo;
  - una salida correcta (`--leaks-only` reporta 12 fugas esperadas) parecía un error;
  - la tabla de *Solución de problemas* resolvió el único fallo real sin ayuda.
  - Pendiente para reforzarlo: la ronda con una persona real.

---

**Por qué este orden:**

1. El tema 1 tiene la evidencia cuantitativa más sólida y aplica a cualquier app con datos sensibles.
2. El tema 2 es muy valioso, pero su conclusión es más débil: los datos no alcanzan para separar auto-preferencia de reglas demasiado permisivas.
3. El tema 3 es el más fácil de escribir, pero todavía le falta la ronda con una persona real.
