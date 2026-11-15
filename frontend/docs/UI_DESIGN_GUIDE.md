# Guía de diseño e interacción del frontend

## 1. Consulta obligatoria y alcance

**Consultar este documento antes de crear o modificar cualquier UI del frontend.** Es la referencia de las decisiones adoptadas al completar el diseño del panel del flujo 1: Tiempo, Ubicación, Preparación y Aspecto del cielo.

La guía establece los patrones que deben extenderse a los siguientes flujos. Se complementa con [desing.md](../desing.md) y la [arquitectura](FRONTEND_ARCHITECTURE.md). Para la presentación e interacción del HUD, estas decisiones actualizan las referencias históricas del [flujo del prototipo](PROTOTYPE_UI_FLOW.md).

Aspecto del cielo muestra el estado del catálogo estelar y permite ocultar la superficie central. Preparación permite buscar directamente al pulsar el cielo o introduciendo RA/Dec. Al ampliar la UI, representar únicamente capacidades reales del frontend y de la API.

## 2. Composición del HUD

- El escenario celeste ocupa la ventana. La UI se superpone sin cubrir innecesariamente la escena.
- La barra principal es vertical, a la izquierda. Orden: Tiempo, Ubicación, Preparación y Aspecto del cielo.
- Cada opción se representa con un icono; su nombre aparece en un tooltip. El panel asociado se abre a la derecha de la barra.
- La hora y la fecha local permanecen visibles arriba a la izquierda, independientemente del panel abierto.
- El selector de idioma permanece abajo a la izquierda con el icono `GlobalLine` y el código ES/EN. La barra conserva espacio inferior para este control y permite scroll cuando la altura es reducida.
- Los avisos de actividad aparecen arriba a la derecha, independientes del panel abierto. En ventanas estrechas se sitúan debajo de la franja del reloj para evitar superposiciones.
- Los iconos principales proceden de [Flujo 1/svg.md](Flujo%201/svg.md), adaptados a React y con `currentColor`.
- La capa general utiliza `pointer-events: none`; solo los controles interactivos recuperan `pointer-events: auto`. El espacio libre permite operar la escena.
- Las piezas compartidas deben reutilizarse. La apertura, el posicionamiento y el tooltip no se implementan de nuevo para cada opción.

## 3. Apariencia oscura y minimalista

La referencia visual inicial se adaptó a una escena negra. Se emplean superficies sólidas oscuras, esquinas redondeadas e iconos claros.

| Uso | Referencia actual |
| --- | --- |
| Superficie de barra y panel | `#111722` |
| Fondo de controles | `#1a2331` |
| Interacción y selección | `#253247` |
| Texto principal | `#e1e7ef` |
| Texto secundario | `#a5b4c8` |
| Icono activo y foco de teclado | `#a9d9ff` |
| Tooltip informativo | Fondo `#29364a`, texto blanco |
| Tooltip de bloqueo/error | Fondo `#b42332`, texto blanco |
| Scroll | Tirador `#39475b`, interacción `#53657e` |

- No añadir bordes decorativos a barras, paneles, botones ni campos. La separación se obtiene mediante color, espacio y, en el panel, una sombra discreta.
- Conservar el contorno de foco de teclado: cumple una función de accesibilidad.
- Las flechas de anclaje son parte de la superficie del panel o del tooltip. Que se construyan con bordes CSS no implica dibujar un contorno decorativo.
- Los valores reutilizados se mantienen en variables CSS. Las variables globales de movimiento y scroll están en `src/styles/base/variables.css`; los valores propios del HUD, en su hoja de componente.

## 4. Apertura, cierre y permanencia por tarea

### Comportamiento temporal

| Interacción | Decisión |
| --- | --- |
| Hover o foco sobre un icono principal | Mostrar su tooltip sin espera intencional |
| Hover sobre una opción | Abrir su panel tras 350 ms |
| Clic en una opción | Abrirla directamente; pulsarla de nuevo no cierra el panel |
| Salida de la barra y del panel | Permitir el cierre después de 2.000 ms |
| Regreso antes del cierre | Cancelar el temporizador de cierre |
| Paso del ratón entre barra y panel | Tolerar el recorrido; no cerrar instantáneamente al cruzar el espacio intermedio |

El retardo de interacción y la duración de una animación son parámetros distintos. El tooltip inicia su aparición inmediatamente y se anima durante 140 ms.

### Permanencia mientras falta una acción

Un panel no puede ocultarse automáticamente solo porque el usuario mueve el ratón para completar una tarea fuera de él.

La persistencia se decide por el estado de la función, mediante `persistentIds` de `useContextMenu`:

| Panel / estado | Comportamiento actual |
| --- | --- |
| Preparación: edición de coordenadas manuales | Permanece abierto |
| Preparación: búsqueda o carga en curso | Permanece abierto y conserva la cancelación accesible |
| Preparación: resultados pendientes de elección, resultado vacío o error | Permanece abierto para permitir continuar, revisar o limpiar |
| Ubicación: solicitud al dispositivo en curso | Permanece abierto |
| Tarea completada o cancelada | Deja de exigir persistencia y permite el cierre temporal |

Mientras el panel activo es persistente, hacer hover sobre otro icono no lo sustituye. Un clic explícito en otra opción sí permite cambiar de contexto. La persistencia conserva la tarea, no bloquea la navegación voluntaria.

Para un flujo nuevo, definir primero qué estado requiere atención, qué acción lo completa y cómo se cancela. No utilizar un cierre genérico por hover para todas las funciones.

El tamaño del recorte es un parámetro de aplicación inmediata: modificarlo no inicia una tarea pendiente ni requiere un botón de confirmación. El clic válido en la escena abre Preparación automáticamente para mantener accesibles la cancelación y los resultados; el progreso se muestra en el aviso superior derecho.

## 5. Posición, límites y flecha

La regla final prioriza el centrado vertical y los límites de la ventana. No se alinea siempre el borde superior del panel con el botón que lo abre: ese comportamiento dejaba demasiado abajo los paneles activados desde la última opción.

El posicionamiento sigue este orden:

1. Medir la altura real del panel y el espacio visible disponible.
2. Calcular una posición centrada verticalmente.
3. Ajustarla lo necesario para que la flecha pueda señalar al botón de origen.
4. Limitarla por los márgenes superior e inferior. Un panel extenso se desplaza hacia arriba cuando necesita espacio.
5. Calcular la posición de la flecha dentro de la superficie, evitando las esquinas redondeadas.

| Parámetro | Valor actual |
| --- | --- |
| Altura máxima | El menor valor entre 560 px y la altura visible menos ambos márgenes |
| Márgenes verticales | 24 px; 16 px en pantallas de hasta 600 px de ancho |
| Ancho de referencia | Hasta 330 px en escritorio; ajustado al espacio libre en móvil |
| Separación horizontal respecto a la barra | 26 px; 18 px en móvil |
| Distancia mínima del centro de la flecha a los extremos del panel | 35 px; 30 px en móvil, limitada por la propia altura del panel |

Recalcular la posición cuando cambian el contenido, el tamaño de la ventana o el área visible del dispositivo. La flecha forma parte de la superficie animada y debe permanecer unida a ella. No asignar desplazamientos verticales fijos por nombre de opción.

## 6. Encabezado, contenido desplazable y acciones fijas

Todos los paneles utilizan la estructura reutilizable de `PanelContent`:

| Zona | Contenido |
| --- | --- |
| Encabezado | Título, estado breve y controles que deben seguir a la vista |
| Cuerpo | Formularios, explicaciones, errores y listas que pueden necesitar scroll |
| Pie | Acciones principales, cancelación, aplicación o limpieza |

El pie permanece dentro del panel y fuera del cuerpo desplazable. No situar una acción importante después de una lista extensa ni fijarla a la ventana de forma independiente del panel.

Aplicación en el flujo 1:

- **Preparación:** tamaño compartido e instrucciones pertinentes en el encabezado; campos RA/Dec y observaciones en el cuerpo; búsqueda manual, cancelación o limpieza en el pie, según el estado. La lista se desplaza sin arrastrar fuera de vista las acciones. El progreso de búsqueda y carga pertenece al aviso superior derecho.
- **Tiempo:** estado en el encabezado; fecha personalizada y referencias temporales en el cuerpo; control del reloj y aplicación de fecha en el pie.
- **Ubicación:** contexto del observador en el encabezado; coordenadas manuales y errores en el cuerpo; ubicación del dispositivo y aplicación manual en el pie.
- **Aspecto del cielo:** estado de las estrellas en el encabezado; visibilidad de la superficie central y errores en el cuerpo; reintento de carga en el pie cuando falla.

### Scroll

- El cuerpo tiene `min-height: 0` dentro de una columna flexible, para ceder espacio al encabezado y al pie.
- Se utiliza un scroll vertical fino y oscuro, con tirador redondeado y pista transparente; nunca una barra blanca que rompa la paleta.
- Referencias: `scrollbar-width: thin` y 6 px donde se aplica la personalización WebKit.
- Reservar espacio para el scroll mediante `scrollbar-gutter: stable` y contener el desplazamiento con `overscroll-behavior-y: contain`.
- Evitar un segundo scroll dentro de la lista de resultados: el cuerpo ya cumple esa función.
- En ventanas de hasta 520 px de alto, el encabezado también puede desplazarse para conservar accesibles las acciones del pie.

## 7. Contenido por estado y eliminación de redundancias

- Mostrar únicamente instrucciones y opciones pertinentes al estado actual.
- Presentar los pasos como una lista vertical real, no como una secuencia numerada dentro de un párrafo.
- No repetir el mismo aviso simultáneamente como bloque destacado y como tooltip.
- No añadir varios botones que realicen la misma acción con nombres diferentes.
- No introducir plegables dentro de estos paneles para esconder formularios que ya pertenecen a la opción elegida. Los plegables de Tiempo y Ubicación se retiraron por redundantes.
- Durante una operación, mostrar progreso y la cancelación correspondiente. Evitar presentar acciones incompatibles como si pudieran ejecutarse.
- La etiqueta de una acción debe describir su efecto real. «Limpiar imagen y resultados» no debe presentarse como «Limpiar filtros» si no restablece esos valores.

### Tiempo

Se eliminó la duplicación entre «Ahora» y «Reanudar», porque ambos volvían al reloj actual.

| Estado | Acción del reloj | Efecto |
| --- | --- | --- |
| En vivo | Pausar tiempo | Fija el instante mostrado |
| Pausado o fecha personalizada aplicada | Volver al tiempo actual | Regresa al instante actual y al modo en vivo |

«Aplicar fecha» es una acción distinta: interpreta el campo como UTC y fija ese instante. No existe una reproducción que continúe desde el instante pausado unos segundos por detrás del tiempo real; no denominarla «Reanudar» mientras ese comportamiento no exista.

La hora y fecha del HUD se muestran en la zona local del navegador. La entrada personalizada se interpreta como UTC. El tiempo del cielo no es la fecha de adquisición de una observación.

### Preparación y búsqueda

El tamaño predeterminado es **7 minutos de arco**, disponible desde el inicio aunque nunca se abra Preparación. El control del tamaño modifica inmediatamente un único valor compartido por ambas vías de búsqueda; no depende del envío del formulario RA/Dec ni de un botón «Aplicar» o «Buscar». Las consultas nuevas usan el valor vigente al iniciarse. Cambiarlo no relanza una consulta en curso ni modifica una imagen ya cargada.

La UI ofrece dos vías:

1. **Clic en la escena:** pulsar un punto del cielo sin arrastrar inicia la consulta directamente. Se retiró «Seleccionar región del cielo» y no existe un modo de selección que deba activarse previamente.
2. **Coordenadas manuales:** introducir RA y Dec y pulsar «Buscar coordenadas» envía esa posición. Este botón inicia la consulta manual; no confirma el tamaño del recorte.

En ambos casos, elegir posteriormente una observación de los resultados carga su imagen. Consultar una región no equivale a seleccionar automáticamente una exposición.

El tamaño admitido es de 0,1 a 30 minutos de arco. Representa el lado angular de una imagen cuadrada, no una resolución en píxeles. Un área mayor suele producir una matriz con más filas y columnas, conservando la resolución nativa.

Las coordenadas manuales son ICRS en grados decimales: RA desde 0 hasta menos de 360 y Dec entre −90 y 90, incluidos ambos polos. La búsqueda manual utiliza `GET /api/v1/images` y convierte el tamaño de minutos de arco a grados. No requiere ubicación terrestre para consultar las observaciones. Para colocar una imagen en el cielo local, la selección de la observación sí requiere un observador y explica ese requisito con un tooltip.

La búsqueda mediante un punto del cielo utiliza `POST /api/v1/images/search` y necesita la ubicación del observador. La latitud y longitud de Ubicación describen una posición terrestre; no son RA/Dec.

### Avisos reutilizables de actividad

- Utilizar `StatusNotice` para comunicar el progreso y la finalización de una tarea. Su posición la define `.status-region` en la capa HUD; no depende de Preparación ni de que el panel permanezca visible.
- Mantener la superficie sólida oscura, sin borde decorativo, con esquinas redondeadas y los colores compartidos `--hud-surface` y `--hud-text`. Los SVG `Loading2Line` y `CheckRounded` utilizan `currentColor` y reproducen los iconos proporcionados para este aviso.
- Durante la consulta, mostrar «Buscando observaciones…». Al finalizar, sustituir el indicador por la marca de comprobación y el recuento de imágenes devuelto por IRSA, incluido cero y el singular. Si `has_more` es verdadero, indicar «Más de N imágenes encontradas en IRSA»: el límite actual de 20 resultados no representa el total del archivo.
- La carga de la imagen elegida utiliza el mismo componente con «Cargando imagen…» y «Imagen cargada». No repetir los indicadores de progreso dentro de Preparación. La cancelación y los errores siguen disponibles en el panel.
- La tarjeta entra desde fuera del borde superior y termina en la esquina superior derecha: 700 ms con desaceleración suave, sin rebote. El resultado permanece 3.200 ms y sale hacia arriba en 500 ms; la opacidad cambia en 420 ms. Estas duraciones locales dan al aviso un movimiento más pausado que el de los controles. No desmontar ni vaciar la superficie antes de completar la salida.
- El indicador gira continuamente en 1.800 ms y pulsa suavemente entre escala 1 y 1,08 en 2.400 ms. La marca de comprobación aparece suavemente en 500 ms. Giro, escala y desplazamiento de la tarjeta se aplican a capas distintas, sin escalar el texto.
- Cancelar o fallar una operación retira el aviso. Una operación nueva sustituye la anterior; sus temporizadores no pueden ocultar el aviso nuevo. Las respuestas canceladas no producen confirmaciones.
- El aviso no intercepta clics ni mueve el foco. Una región `role="status"`, con anuncio cortés y atómico, comunica los cambios sin leer los SVG. Con `prefers-reduced-motion`, se eliminan los desplazamientos, giros y pulsaciones; se conserva el tiempo para leer el resultado.

`StatusNotice` recibe `notice`: un objeto estable `{ status, message }` o `null` para cerrar. Los estados actuales son `loading` y `success`. Mantener el mismo objeto mientras no cambie la notificación y crear uno nuevo para cada operación o actualización permite repetir tareas con el mismo mensaje. `duration` configura la permanencia del resultado en milisegundos; su valor predeterminado es 3200 y un valor menor o igual a cero desactiva el cierre automático. La carga permanece visible hasta que cambie `notice`.

`useState` y `useEffect`, de React, conservan el contenido de salida y coordinan el temporizador; `setTimeout` y `clearTimeout` son API del navegador. Las animaciones son CSS nativo. El componente no consulta la API ni calcula resultados; `useFitsImage` aporta los mensajes según la operación real. No se requieren dependencias nuevas.

### Ubicación automática y avisos sobre la escena

- Solicitar la ubicación del dispositivo al iniciar, si el navegador y el contexto seguro lo permiten. Los permisos del navegador siguen siendo necesarios.
- Mantener el reintento y la entrada de latitud/longitud en Ubicación. Una entrada manual tiene prioridad sobre respuestas automáticas pendientes.
- Si se pulsa el cielo sin ubicación, anclar el tooltip al punto pulsado, no a un botón del panel. Durante la solicitud, mostrar información de espera; si falla, mostrar el motivo en rojo y cómo resolverlo.
- Si la solicitud falla después de marcar el punto, actualizar el aviso en ese mismo punto. Al obtener ubicación, retirar el aviso; el siguiente clic inicia la consulta.
- Aplicar el mismo aviso contextual cuando el tamaño del recorte no sea válido.
- El aviso se descarta con Escape o con otro clic. El gesto de arrastre no debe iniciar una consulta.
- Obtener la ubicación después de una búsqueda manual no debe borrar sus resultados.

### Estrellas y superficie central

- Las estrellas Hipparcos se cargan al disponer de ubicación y se actualizan con el contexto de Tiempo. El encabezado de Aspecto del cielo informa de carga, disponibilidad y cantidad.
- Un fallo de carga o actualización muestra el error y la acción «Volver a cargar estrellas». Las direcciones caducadas no se muestran.
- «Mostrar superficie central» es un checkbox nativo de aplicación inmediata, activado por defecto. Oculta o muestra la guía horizontal transparente situada bajo el observador, formada por cuadrícula y anillos.
- La superficie es atravesable y permite ver el hemisferio inferior. No intercepta clics ni restringe la cámara. Su visibilidad es independiente de la ubicación y de la carga de estrellas.
- La guía sigue el suelo del prototipo de referencia: plano en Y = −1, detalle atenuado por distancia y menor opacidad al mirar hacia abajo. Se adapta a la proyección ortográfica mediante las direcciones del cielo y solo aparece bajo el horizonte. No se debe volver a forzar la profundidad de un disco relleno, porque produce superposiciones al girar.
- Al ampliar, cuadrícula, anillos y marcas compensan su grosor con el inverso del zoom y se desvanecen suavemente entre 1× y 8×. Desde 8× quedan ocultos para facilitar la inspección de FITS; reaparecen al alejar la vista. Esta adaptación es automática y respeta el control de visibilidad.

### Navegación de la cámara

- El arrastre horizontal cambia únicamente el rumbo y el vertical únicamente la elevación, siguiendo los controles del prototipo. La cámara gira desde el centro del cielo.
- El giro lateral permanece en cero. La elevación se limita justo antes del cenit y del nadir para evitar invertir el horizonte.
- El suavizado interpola rumbo y elevación por separado. El encuadre automático de imágenes utiliza la misma orientación nivelada y el giro horizontal más corto.
- La sensibilidad depende del zoom ortográfico vigente. La transformación astronómica del fondo no debe inclinar la cámara ni los controles locales.

## 8. Tooltips reutilizables y explicación de bloqueos

Utilizar `Tooltip` para nombres, información breve y motivos de bloqueo; no crear variantes independientes para cada menú.

| Uso | Presentación |
| --- | --- |
| Nombre de una opción principal | Tooltip compacto informativo |
| Explicación de un campo | Tooltip informativo asociado al icono «i» |
| Acción bloqueada por un requisito ausente o inválido | Tooltip rojo con causa y forma de resolverla |
| Clic en el cielo sin ubicación o con tamaño inválido | El mismo tooltip, anclado a las coordenadas de pantalla del clic |

Ejemplo de bloqueo: «Falta tu ubicación. En Ubicación, usa el dispositivo o introduce latitud y longitud.» El rojo señala el problema; el texto explica cómo continuar. No limitarse a desactivar silenciosamente un botón.

Cuando el usuario necesita enfocar una acción bloqueada para leer su motivo, utilizar `aria-disabled` y bloquear expresamente su ejecución en el manejador. El atributo por sí solo no impide el clic. Mantener `disabled` nativo donde corresponda a otros controles.

El tooltip:

- Aparece con hover o foco; la ayuda «i» también se abre al pulsarla.
- Se asocia al elemento mediante `aria-describedby` y utiliza `role="tooltip"`.
- Puede descartarse con Escape.
- Se posiciona dentro de la ventana y cambia de lado si falta espacio.
- Se renderiza mediante un portal fuera del área desplazable para evitar recortes por `overflow`.
- No contiene acciones interactivas ni intercepta el ratón.

Los errores de solicitud o validación que requieren atención en el formulario pueden mostrarse en el cuerpo, con `role="alert"`. Esto no justifica duplicar el mismo mensaje en dos superficies a la vez.

## 9. Ayuda para conceptos técnicos

Los campos con datos poco familiares utilizan `InputField`: etiqueta visible, entrada nativa y botón de información a la derecha de la fila. El botón utiliza el SVG `InfoRounded` proporcionado para el flujo 1 y abre el mismo `Tooltip` compartido.

La ayuda debe explicar qué representa el dato, sus unidades y, cuando sea útil, un ejemplo o su efecto sobre el resultado. No repetir la etiqueta ni limitarse a decir «Introduce un valor».

| Campo | Enfoque de la explicación |
| --- | --- |
| Tamaño del recorte | Cuánto cielo abarca cada lado y su relación con las filas y columnas de la matriz; no confundirlo con resolución en píxeles |
| Fecha y hora UTC | Qué instante se desea mostrar y que UTC es una referencia mundial distinta de la hora local |
| Latitud | Posición norte/sur del ecuador, grados decimales y signo |
| Longitud | Posición este/oeste de Greenwich, grados decimales y signo |
| RA y Dec | Posición del punto en el cielo en ICRS, grados decimales y rangos; distinguirlas de latitud/longitud terrestres |

La descripción se vincula tanto al campo como al botón de ayuda. Usar lenguaje accesible, ortografía correcta y textos breves en el idioma seleccionado. Los textos visibles, ayudas y etiquetas accesibles se obtienen de los catálogos ES/EN de `src/i18n/locales/`. Los identificadores y nombres de archivos permanecen en ASCII.

## 10. Microinteracciones y accesibilidad

Las transiciones suaves forman parte del diseño, no son un añadido opcional. Deben permitir reconocer cambios sin deformar el contenido ni mover controles vecinos.

| Interacción | Referencia actual |
| --- | --- |
| Movimiento principal | 360 ms, `cubic-bezier(0.34, 1.56, 0.64, 1)` |
| Salida y opacidad del panel | 180 ms |
| Tooltip | 140 ms, opacidad y escala breve |
| Aviso de actividad | Entrada superior de 700 ms, resultado visible 3.200 ms y salida superior de 500 ms; opacidad de 420 ms |
| Icono de carga del aviso | Giro de 1.800 ms y pulso de 2.400 ms, escala máxima 1,08 |
| Fondo del botón con hover o foco | Escala `1.025` |
| Fondo del botón al pulsar | Escala `0.985` |
| Superficie del panel al entrar o salir | Desplazamiento horizontal de 8 px y cambio de opacidad |

- Separar fondo, texto e icono. En los botones actuales se anima un pseudoelemento de fondo; el texto permanece estable.
- Aplicar una reacción principal por interacción y limitar el rebote a un efecto discreto.
- Conservar las transiciones en la salida: ocultar o desmontar instantáneamente elimina esa animación.
- Los paneles cerrados son `inert`, tienen `aria-hidden` y no interceptan eventos, incluso durante la salida visual.
- Limitar el hover visual a dispositivos compatibles. Conservar navegación por teclado, controles nativos y foco visible.
- Respetar `prefers-reduced-motion`; los valores temporales se reducen a cero y se elimina el movimiento decorativo.
- No utilizar `transition: all`.

El flujo 1 utiliza CSS en la superficie interna del panel y no añade GSAP como dependencia. Si otro flujo incorpora GSAP para los contenedores, mantener las microinteracciones CSS en capas internas y evitar que ambos controlen `transform` u `opacity` del mismo elemento. Para selectores, sliders y otros controles futuros, consultar también los patrones específicos de [desing.md](../desing.md).

## 11. Componentes y responsabilidades que se deben reutilizar

Las rutas de esta tabla son relativas a `frontend/`.

| Archivo | Responsabilidad y uso |
| --- | --- |
| `src/components/layout/AppViewport.jsx` | Integra el clic directo, los avisos sobre la escena y los estados que requieren persistencia |
| `src/components/controls/ContextToolbar.jsx` | Opciones principales y presentación de los paneles |
| `src/components/common/ContextPanel.jsx` | Superficie, anclaje y visibilidad; recibe `id`, `anchorId`, `label`, `visible` y contenido |
| `src/components/common/PanelContent.jsx` | Distribución por `title`, `header`, cuerpo en `children` y acciones en `footer` |
| `src/components/common/Tooltip.jsx` | Información o error mediante `message` y `tone`; admite `compact`, `placement`, `id`, apertura controlada con `open` y ancla virtual `point` para el clic en la escena |
| `src/components/common/InputField.jsx` | Campo nativo con `label`, `help`, identificador y propiedades de entrada |
| `src/components/common/Select.jsx` | Selector personalizado controlado, opciones habilitadas/deshabilitadas, teclado y portal con posición adaptable |
| `src/components/controls/LanguageSelect.jsx` | Idioma abajo a la izquierda, icono global y abreviatura del idioma actual |
| `src/hooks/useSelectPosition.js` | Medición y adaptación del select a ventana, límites y controles cercanos |
| `src/i18n/` | Catálogos por idioma/sección, proveedor React, formatos locales y errores traducibles |
| `src/components/common/StatusNotice.jsx` | Aviso reutilizable con `notice` y `duration`, progreso persistente, resultado temporal y salida animada |
| `src/components/common/StatusIcons.jsx` | Iconos `Loading2Line` y `CheckRounded`, reutilizables y decorativos por defecto |
| `src/hooks/useContextMenu.js` | Apertura y cierre diferidos; persistencia por `persistentIds` |
| `src/hooks/useAnchoredPanel.js` | Medición, centrado, límites y posición de la flecha |
| `src/hooks/useTooltipPosition.js` | Posición del tooltip y adaptación al espacio visible |
| `src/hooks/useSkyClock.js` | Tiempo en vivo, pausa, regreso al presente y aplicación de fecha |
| `src/hooks/useObserver.js` | Solicitud automática de ubicación, reintento y prioridad de la entrada manual |
| `src/hooks/useStars.js` | Carga, renovación y cancelación del cielo estelar según ubicación y tiempo |
| `src/components/controls/SkyControls.jsx` | Estado de las estrellas, reintento y visibilidad de la superficie central |
| `src/hooks/useFitsImage.js` | Tamaño compartido, consultas por clic o RA/Dec y avisos de búsqueda/carga vinculados a la operación vigente |
| `src/config/search.js` | Tamaño inicial de 7 minutos de arco y validación de tamaño y coordenadas |
| `src/styles/base/variables.css` | Variables globales de movimiento y scroll |
| `src/styles/components/context-toolbar.css` | Barra, paneles, distribución, límites, scroll y estados visuales |
| `src/styles/components/tooltip.css` | Variantes y animación del tooltip |
| `src/styles/components/input-field.css` | Distribución del campo y botón de ayuda |
| `src/styles/components/status-notice.css` | Superficie, entrada/salida, giro y pulso del aviso de actividad |
| `src/styles/layout/viewport.css` | Capas de la escena y anclaje adaptable de los avisos superiores |

Los componentes y hooks utilizan React; el portal procede de `react-dom`. `ResizeObserver`, `requestAnimationFrame`, `getBoundingClientRect` y `visualViewport` son API del navegador utilizadas para medir y actualizar posiciones. Estos patrones no requieren una biblioteca externa de tooltips o posicionamiento.

La presentación se define en hojas CSS importadas desde `src/styles/main.css`. Los hooks comunican las mediciones dinámicas mediante propiedades CSS personalizadas; no trasladar colores, espaciados estáticos ni bloques de estilos al JSX.

### Selectores e idioma

Reutilizar `Select` en lugar de crear menús independientes. Su lista se abre arriba o abajo según el espacio visible y los obstáculos declarados; puede ajustarse horizontalmente manteniendo el anclaje. Si no hay espacio libre suficiente, se superpone al contenido para conservar opciones utilizables. Las listas extensas se desplazan dentro del límite disponible. Se conservan la superficie oscura sin bordes decorativos, la marca de selección, el foco de teclado y las transiciones de salida con `inert`.

El cambio de idioma es inmediato, conserva las tareas y actualiza también errores, avisos, accesibilidad y etiquetas del cielo. El idioma inicial es inglés salvo que exista una preferencia guardada válida. No guardar frases traducidas en el estado. Consultar [Internacionalización y selector compartido](I18N.md) para el contrato del componente y la ampliación de catálogos.

## 12. Aplicación a nuevas pantallas

Antes de añadir una opción al HUD:

1. Definir su objetivo, estados, requisitos de entrada, acción principal y condiciones de finalización o cancelación.
2. Decidir qué permanece visible en encabezado y pie, y qué contenido debe desplazarse.
3. Reutilizar los componentes y hooks anteriores; asignar un ancla identificable al panel.
4. Elegir la política temporal o persistente según la tarea, no según el aspecto del componente.
5. Redactar nombres, ayudas y bloqueos sin duplicaciones ni términos que prometan un comportamiento diferente del real.
6. Aplicar la paleta oscura, las microinteracciones, los límites de ventana y la accesibilidad establecidos.

Comprobar visualmente la apertura desde cada icono, el recorrido del ratón hasta el panel, las tareas pendientes, las listas extensas, las acciones del pie, los tooltips y los tamaños de ventana reducidos. La validación estática no acredita por sí sola estos comportamientos visuales.

Si una decisión cambia, actualizar esta guía y sus referencias en la misma entrega para evitar que una solución descartada vuelva a introducirse.
