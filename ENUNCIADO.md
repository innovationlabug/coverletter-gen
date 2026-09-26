# App de cover letter con split brain — enunciado

Cada quien construye, por su cuenta, una app que genera una [carta de interés](https://en.wikipedia.org/wiki/Cover_letter) para acompañar un CV, con una arquitectura split brain. Todos entregan el app funcionando, un repo con link al demo y README detallado y un artículo enfocado en un área, con el app como medio para explicarlo; cada quien profundiza más en un área.

## El reto

La persona usuaria cuenta su situación con total franqueza: qué hace hoy, cuánto gana, qué quiere hacer y cuánto quiere ganar. Si quiere, pega la oferta de trabajo a la que aplica. La app le devuelve dos cosas:

1. La carta de interés, lista para enviar junto con el CV.
2. Una nota privada de negociación, solo para ella. Por ejemplo: qué tan realista es su expectativa frente a lo que gana hoy y cuándo le conviene mencionarla. Esta nota nunca sale del dispositivo.

Plataforma (web, móvil o escritorio), lenguaje, modelos, APIs y diseño quedan a tu elección.

## Split brain

Una parte del trabajo corre en el dispositivo de la persona y otra en la nube. Tú decides qué va dónde, y cada decisión necesita una razón. Estas son válidas:

- **Privacidad**: hay datos que no deben salir del dispositivo.
- **Latencia**: hay respuestas que no pueden esperar un viaje de red.
- **Costo**: no toda petición merece una llamada a una API de pago.
- **Disponibilidad**: sin conexión, la app sigue sirviendo.
- **Calidad**: hay tareas que un modelo pequeño no resuelve bien.

Lo local no tiene que ser un modelo. Una regla, una expresión regular o un cálculo a veces es mejor: más rápido, predecible y fácil de probar. Toda decisión debe justificarse.

## Condiciones mínimas

Fuera de esto, todo queda a tu criterio:

1. Hay al menos un componente local y un modelo en la nube. Justificas el reparto con al menos dos de las razones anteriores.
2. El salario actual nunca sale del dispositivo. Tú decides qué más es sensible, y lo demuestras con al menos una prueba automatizada.
3. La decisión de qué se envía a la nube no la toma un modelo sin verificación: es explícita y se puede probar.
4. Sin conexión, la app sigue entregando algo útil.

## Entregables

| Entregable | Qué debe tener |
|---|---|
| App | Funciona de punta a punta, con y sin conexión, en un repositorio público. |
| README | Qué corre dónde y por qué (con un diagrama), cómo se llama al componente local, cómo se llama a cada API y cómo correr la app y sus pruebas. |
| Artículo | Enseña lo que aprendiste a alguien que nunca ha oído de split brain, con diagramas y capturas. Incluye al menos un error o decisión real de tu proyecto. Puede estar en Medium o Substack. |

## Profundidad por persona

Todos cumplen lo anterior. Además, cada quien va más a fondo en su área.

### Luis: APIs

- Además del modelo en la nube, integra dos APIs adicionales: una de IA (por ejemplo, generación de imágenes con Nano Banana, video con Gemini Omni, voz u otro proveedor de modelos) y una de cualquier otro tipo (por ejemplo, tipo de cambio o una bolsa de empleo).
- Para cada API documenta cómo se autentica y dónde vive la credencial, qué pasa si falla o tarda, cuánto cuesta y qué datos le envías.

### Cathy: modelos locales

- El componente local corre con Ollama. Ollama corre en la computadora: tenlo en cuenta al elegir plataforma.
- Evalúa Gemma y Qwen en las tareas de tu app, con tamaños comparables, las mismas entradas y los mismos prompts. Mide al menos calidad en la tarea, latencia y memoria.
- Concluye cuál es mejor para tu caso y por qué, y en qué pierde el ganador.
- Implementa algunas reglas heurísticas y explica por qué esas partes no necesitan un modelo.

### Emily: aprendizajes

- **Validación.** Construye un set de al menos 15 casos de prueba: perfiles ficticios con datos sensibles plantados, como salario, empleador actual y nombres. Con ese set mide cuántas fugas atrapa tu app y qué tan buenas son las cartas, las locales contra las de la nube, con criterios que tú definas y justifiques.
- **Didáctica.** Pide a alguien que nunca haya visto tu proyecto que lo corra siguiendo solo tu README. Anota dónde se trabó y corrige el README hasta que funcione sin ayuda.
- Además de tu artículo, identifica tres temas de tu proyecto que merezcan un artículo propio. Para cada uno: un título tentativo, a quién le sirve, qué aprende quien lo lea y por qué vale la pena, con la evidencia que lo sostiene. Apóyate en lo que encontraste en la validación y en la prueba didáctica. Ordénalos por prioridad.

## Referencia

[Excusa Legendaria](https://github.com/ykro/generador-excusas) es un ejemplo de split brain en Android: Gemma en el teléfono, Gemini en la nube y código determinista para lo que no admite errores. Úsalo para entender la idea, no como plantilla. También tiene un [artículo asociado](https://ykro1.substack.com/p/split-brain-en-android-gemma-en-el).
