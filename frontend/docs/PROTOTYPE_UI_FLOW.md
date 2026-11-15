# Flujo de interfaz del prototipo

## Propósito

Definir los elementos de interfaz del prototipo y cuándo aparecen, para orientar la futura organización de componentes de Astrea.

Este documento describe el comportamiento observado en el código del prototipo, no una implementación nueva ni una garantía de compatibilidad con el backend de Astrea.

Referencia: `C:\Users\YeriZ-Laptop\Documents\GitHub\NSAC-Playground\sandbox\Charlie Kirk\Proyecto_Prototipo\frontend\src`.

## Recorrido principal

1. Configurar el contexto y preparar una búsqueda
2. Consultar una región y revisar sus observaciones
3. Cargar e inspeccionar una imagen A
4. Preparar una comparación y seleccionar B
5. Comparar A y B

Hacer clic en el cielo no equivale a cargar una imagen: primero consulta las observaciones disponibles. La descarga del recorte ocurre al elegir una observación.

Los pasos siguientes agregan elementos a la interfaz. En el prototipo, las herramientas anteriores permanecen dentro del panel lateral; no se sustituyen por pantallas independientes.

## Paso 1. Contexto inicial y preparación

La implementación actual del HUD y las decisiones adoptadas durante el flujo 1 están documentadas en la [Guía de diseño e interacción](UI_DESIGN_GUIDE.md), de consulta obligatoria al crear nueva UI. Los plegables y las acciones de tiempo descritos a continuación pertenecen al prototipo de referencia; para la nueva UI se aplican las decisiones de esa guía.

Condición: aplicación abierta, sin una región consultada ni una imagen cargada.

### 1.1 Escena y navegación

| Elemento | Definición y comportamiento |
| --- | --- |
| Bóveda celeste | Superficie visual sobre la que se representan las estrellas y las imágenes |
| Suelo y horizonte | Referencia del horizonte local del observador |
| Estrellas | Representación del catálogo cuando están disponibles la ubicación y las muestras del cielo |
| Arrastre | Permite cambiar la dirección de la cámara |
| Zoom | Permite acercar o alejar la vista |
| Ayuda de navegación | Texto que indica cómo arrastrar, ampliar y seleccionar una región; menciona el clic cuando la búsqueda por clic está activada y existe ubicación |

### 1.2 Panel de tiempo

Es un panel independiente del explorador FITS y permanece disponible durante el recorrido.

| Elemento | Definición y comportamiento |
| --- | --- |
| Estado del reloj | Indicador de modo en vivo o pausado |
| Hora local | Hora del cielo mostrado, expresada en la zona horaria del navegador |
| Fecha local | Fecha correspondiente al tiempo mostrado |
| Fecha y hora UTC | Referencia temporal explícita para interpretar el cielo |
| Ahora | Vuelve al tiempo actual en modo en vivo |
| Pausar | Detiene el avance del tiempo mostrado |
| Sección de fecha personalizada | Apartado plegable para introducir otro instante |
| Entrada de fecha y hora UTC | Campo para establecer un instante concreto; aunque usa un control de fecha local del navegador, el formulario lo interpreta como UTC |
| Aplicar tiempo | Actualiza el reloj con el instante introducido |
| Error de fecha | Aparece si el valor no puede interpretarse correctamente |

La hora del cielo mostrado no es la fecha de adquisición de una imagen del archivo.

### 1.3 Ubicación del observador

| Elemento | Definición y comportamiento |
| --- | --- |
| Estado de localización | Indica que se está solicitando la ubicación del dispositivo |
| Error de ubicación | Explica por qué no fue posible obtenerla |
| Ubicación activa | Muestra las coordenadas y si proceden del dispositivo o de entrada manual |
| Reintentar ubicación | Solicita nuevamente la ubicación del dispositivo |
| Entrada manual | Sección plegable con latitud, longitud y elevación |
| Latitud | Posición terrestre norte/sur, en grados |
| Longitud | Posición terrestre este/oeste, en grados |
| Elevación | Altura del observador, en metros |
| Aplicar ubicación manual | Valida los campos y establece el observador |
| Error del formulario | Aparece cuando la ubicación introducida no es válida |

Sin ubicación se puede buscar y descargar mediante RA/Dec. La ubicación es necesaria para posicionar la imagen en el cielo local y buscar mediante una dirección local seleccionada con el cursor.

### 1.4 Preparación de la búsqueda

| Elemento | Definición y comportamiento |
| --- | --- |
| Activar búsqueda por clic | Habilita o deshabilita la consulta al pulsar un punto del cielo; en el prototipo comienza activada |
| Ancho del campo | Lado angular del recorte cuadrado solicitado, en minutos de arco; no es una resolución en píxeles |
| Publicación | Selector de QR3 o QR2 presente en el prototipo |
| Detector | Selector de todos los detectores o de uno concreto, del 1 al 6; las opciones incluyen su referencia espectral |
| Error de tamaño | Indica que el tamaño solicitado no cumple los límites del prototipo |

### 1.5 Búsqueda alternativa por coordenadas

Sección plegable; se abre inicialmente cuando no existe observador y no hay una solicitud de ubicación pendiente.

| Elemento | Definición y comportamiento |
| --- | --- |
| Ascensión recta, RA | Coordenada ICRS en grados decimales, desde 0 hasta menos de 360 |
| Declinación, Dec | Coordenada ICRS en grados decimales, entre −90 y 90 |
| Buscar coordenadas | Inicia una consulta usando RA/Dec y los filtros de tamaño, publicación y detector |
| Ayuda sin ubicación | Aclara que la búsqueda y descarga funcionan sin ubicación, pero el posicionamiento local requiere un observador |

### 1.6 Preferencias del cielo

Son herramientas generales: no dependen de haber cargado un FITS.

| Elemento | Definición y comportamiento |
| --- | --- |
| Apariencia de estrellas | Sección plegable de ajustes visuales |
| Tamaño de estrellas | Deslizador que cambia su tamaño de representación |
| Resplandor | Deslizador que regula el brillo extendido alrededor de las estrellas |
| Restaurar apariencia | Recupera los valores predeterminados; se deshabilita cuando ya están activos |
| Mostrar bajo el horizonte | Permite representar estrellas e imágenes que quedan por debajo del horizonte |

### 1.7 Estado del catálogo y del cielo

Estos mensajes pueden aparecer también durante los pasos posteriores.

| Elemento | Cuándo aparece |
| --- | --- |
| Cargando cielo | Durante la carga inicial de las muestras del cielo |
| Cargando estrellas débiles | Cuando se solicita mayor profundidad de catálogo |
| Error y reintento | Si falla la obtención del cielo |
| Actualizar cielo | Si existen datos, pero ya no hay muestras temporales vigentes y no se está cargando ni mostrando un error |

## Paso 2. Consulta de una región y resultados

Entrada: clic sobre el cielo con ubicación disponible o envío del formulario RA/Dec.

### 2.1 Mientras se consulta

| Elemento | Definición y comportamiento |
| --- | --- |
| Estado de búsqueda | Indica que se están consultando exposiciones en el archivo |
| Cancelar | Interrumpe la operación pendiente en el cliente; no garantiza detener trabajo que ya esté ejecutándose en el servidor |
| Error de búsqueda | Informa de un fallo de consulta |

El indicador de operación y la cancelación se reutilizan durante la carga de una imagen.

### 2.2 Cuando termina la consulta

| Elemento | Definición y comportamiento |
| --- | --- |
| Posición consultada | RA/Dec ICRS del punto buscado |
| Resumen de detector | Muestra si se consultaron todos los detectores o uno específico |
| Sin coincidencias | Mensaje que aparece cuando no existen observaciones en los resultados |
| Selector de observaciones | Permite elegir una exposición; cada opción muestra detector, fecha y rango espectral cuando está disponible |
| Cantidad de observaciones | Número de resultados recibidos |
| Aviso de resultados limitados | Advierte que la lista puede estar truncada |

### 2.3 Franja de cobertura espectral

Aparece cuando la consulta tiene resultados. Antes de seleccionar una observación, muestra una indicación para cargarla.

| Elemento | Definición y comportamiento |
| --- | --- |
| Eje espectral | Referencia de 0,75 a 5 micrómetros |
| Canales nominales | Franja que representa los 102 canales nominales de SPHEREx |
| Referencias de detector | Etiquetas D1 a D6 sobre sus bandas |
| Cobertura resaltada | Intervalo de la observación seleccionada, cuando sus metadatos permiten calcularlo |
| Descripción de cobertura | Detector e intervalo espectral, o aviso de información no disponible |
| Aclaración científica | La cobertura corresponde a metadatos de la exposición; no describe necesariamente la longitud de onda de cada píxel |

En una búsqueda inicial sin imagen elegida todavía no aparecen los controles de apariencia de imagen ni el reproductor A/B.

## Paso 3. Carga e inspección de una imagen A

Entrada: selección de una observación en los resultados.

### 3.1 Mientras se carga

| Elemento | Definición y comportamiento |
| --- | --- |
| Estado de descarga y preparación | Indica que se está obteniendo y preparando el recorte FITS |
| Cancelar carga | Cancela la operación pendiente del cliente |
| Error de carga | Informa de problemas al descargar o interpretar la imagen |

### 3.2 Información de la imagen cargada

| Elemento | Definición y comportamiento |
| --- | --- |
| Encabezado de imagen | Identifica la imagen cargada; pasa a indicar referencia A cuando existe una imagen B |
| Estado WCS | Indica si hay una muestra válida para posicionar la imagen o si está esperando |
| Identificación de origen | Texto que identifica la procedencia de la imagen |
| Detector | Detector asociado a la exposición |
| Píxeles incluidos | Porcentaje de píxeles originales incluidos según cobertura finita o filtro de calidad activo |
| Fecha de observación | Instante de adquisición, distinto del reloj del cielo mostrado |
| Dimensiones | Ancho y alto de la imagen preparada, en píxeles |
| Unidades | Unidad científica de intensidad |
| Huella angular | Ancho y alto reales de la región representada, cuando están disponibles |
| Tamaño solicitado | Referencia del lado angular pedido por el usuario |
| FITS original | Enlace al archivo de origen |

### 3.3 Acciones de imagen

| Elemento | Definición y comportamiento |
| --- | --- |
| Centrar imagen | Orienta y acerca la cámara hacia la imagen; requiere posicionamiento temporal válido |
| Retirar imagen | Quita la imagen cargada de la escena |

### 3.4 Apariencia de imagen

| Elemento | Definición y comportamiento |
| --- | --- |
| Aplicar flags de calidad | Alterna la representación con y sin filtrado por calidad; en el prototipo comienza desactivado |
| Explicación de calidad | Informa del estado del filtro y aclara que las muestras sin datos siguen ocultas |
| Selector de paleta | Alterna entre falso color de intensidad y escala de grises; el prototipo comienza en falso color |
| Leyenda de color | Solo aparece en falso color: negro, azul, cian, ámbar y blanco, de intensidad débil a brillante |
| Opacidad | Deslizador para regular la transparencia de la imagen |
| Brillo | Deslizador de exposición visual, entre −3 y +3 pasos; no cambia las mediciones científicas |

La paleta asigna colores a intensidades. No representa colores visibles captados por una cámara RGB ni permite inferir directamente composición o temperatura.

### 3.5 Avisos de posicionamiento

| Elemento | Cuándo aparece |
| --- | --- |
| Bajo el horizonte | Si el centro está debajo del horizonte y esa visualización está desactivada; ofrece activarla |
| Actualizando direcciones | Durante una solicitud de proyección |
| Error de proyección | Si falla el posicionamiento; incluye reintento |
| Esperando posición | Si no existe una muestra vigente, hay observador y no se está cargando ni mostrando un error |

## Paso 4. Preparación de una comparación

Condición: la imagen A corresponde a una observación de los resultados actuales. En ese caso aparece la sección de comparación, aunque todavía no se haya cargado B.

### 4.1 Referencia y filtros

| Elemento | Definición y comportamiento |
| --- | --- |
| Referencia A | Fecha y detector de la imagen de referencia |
| Etapa de comparación | Selector de comparación por fechas, mismo detector o longitud de onda similar |
| Fecha inicial de B | Límite inferior del filtro de candidatos |
| Fecha final de B | Límite superior del filtro de candidatos |
| Error de fechas | Advierte si el intervalo introducido está invertido |
| Selector de B | Lista de otras observaciones candidatas, con fecha y detector |
| Cantidad de candidatos | Número de observaciones que cumplen los filtros dentro de los resultados ya disponibles |
| Aviso de búsqueda limitada | Recuerda que la consulta original pudo devolver resultados limitados |
| Aviso de detector | Si la búsqueda original ya estaba limitada a un detector, explica cómo ampliar la búsqueda |
| Sin candidatos | Sugiere ampliar fechas, cambiar de criterio o consultar otra región |

Estos filtros seleccionan candidatos de los resultados existentes. No equivalen a consultar automáticamente todo el archivo de nuevo.

### 4.2 Opciones exclusivas de longitud de onda similar

| Elemento | Definición y comportamiento |
| --- | --- |
| Tolerancia espectral | Selector estricto, estándar o amplio, relativo al menor ancho de banda de las dos observaciones |
| Aclaración del cálculo | Explica que la banda se comprueba al cargar B, aproximadamente y en el punto seleccionado, no en toda la imagen |

### 4.3 Mientras se carga B

| Elemento | Definición y comportamiento |
| --- | --- |
| Estado de carga de B | Indica la obtención de la segunda observación |
| Cancelar B | Cancela su carga pendiente |
| Error de comparación | Muestra un problema de carga o preparación de B |

## Paso 5. Comparación A/B

Condición: existe una imagen B cargada. Los controles de reproducción se habilitan cuando las imágenes son elegibles y ambas tienen posicionamiento válido.

### 5.1 Información y compatibilidad

| Elemento | Definición y comportamiento |
| --- | --- |
| Identificación de B | Fecha y detector de la segunda observación |
| Banda de A y B | Longitud de onda central y ancho de banda en el punto consultado, cuando están disponibles |
| Resultado espectral | En el criterio de longitud de onda, informa si las bandas cumplen la tolerancia |
| B excluida | Advierte si un cambio de filtros deja fuera a la imagen B ya cargada |
| Unidades incompatibles | Advierte que no puede establecerse la escala compartida esperada |
| Posicionando ambas imágenes | Indica que todavía no están listas para comparar |
| Error de proyección de B | Muestra el fallo y permite reintentar |

### 5.2 Reproducción y acciones

| Elemento | Definición y comportamiento |
| --- | --- |
| Mostrar A | Hace visible la imagen de referencia |
| Mostrar B | Hace visible la segunda observación |
| Blink / Pausar | Inicia o detiene la alternancia entre A y B |
| Intervalo de blink | Deslizador entre 0,5 y 3 segundos, con pasos de 0,5 segundos |
| Imagen visible | Indica si se muestra A o B y su fecha de observación |
| Limpiar comparación | Retira B y finaliza la comparación |

### 5.3 Aclaraciones científicas

- Las dos imágenes usan una escala de color compartida cuando la comparación lo permite.
- La alineación se hace por coordenadas del cielo.
- Debe compararse la zona de solapamiento: bordes y píxeles sin datos pueden diferir.
- La alternancia es una comparación visual, no una confirmación automática de variabilidad o movimiento.

## Resumen de aparición progresiva

| Estado | Elementos que se agregan |
| --- | --- |
| Inicio | Escena, tiempo, ubicación, preparación de búsqueda, RA/Dec y preferencias del cielo |
| Consulta en curso | Estado de búsqueda y cancelación |
| Resultados disponibles | Posición consultada, selector de observaciones, contador y referencia de cobertura espectral |
| A cargada | Información, acciones, apariencia, estado de proyección y cobertura de A |
| A pertenece a los resultados actuales | Preparación de comparación, filtros y selector de B |
| Criterio espectral seleccionado | Tolerancia de longitud de onda |
| B cargada | Información de B, compatibilidad, controles A/B e intervalo de blink |
| Ambas imágenes listas | Se habilitan las acciones de reproducción |

## Separación funcional para orientar la futura UI

Esta agrupación no define todavía posiciones, estilos ni archivos de componentes.

| Grupo | Contenido |
| --- | --- |
| Contexto del observador | Ubicación y reloj del cielo |
| Búsqueda | Selección por clic, tamaño angular, filtros y RA/Dec |
| Resultados | Posición consultada y observaciones disponibles |
| Inspección de A | Metadatos, cobertura, centrado y retirada |
| Apariencia de imagen | Paleta, leyenda, brillo, opacidad y calidad |
| Preparación de comparación | Referencia, filtros y elección de B |
| Reproductor de comparación | Mostrar A/B, blink, intervalo y estado visible |
| Preferencias del cielo | Apariencia estelar y contenido bajo el horizonte |
| Estados contextuales | Carga, cancelación, errores, reintentos y avisos junto a la operación correspondiente |

## Diferencias que deben respetarse al trasladarlo a Astrea

| Función del prototipo | Situación en Astrea |
| --- | --- |
| Selector de publicación QR2/QR3 | La API actual busca DR1 y QR3 juntas; no ofrece ese selector |
| Tamaño angular del recorte | La API actual admite hasta 30 minutos de arco |
| Resolución de imagen | Astrea conserva la resolución nativa del recorte; no hereda el límite de previsualización de 1024 píxeles |
| Flags y porcentaje filtrado | La API actual no proporciona máscaras de calidad |
| Información espectral detallada | Debe comprobarse su disponibilidad o ampliarse el contrato; no deben inventarse bandas por píxel |
| Búsqueda RA/Dec | Disponible mediante `GET /api/v1/images` |
| Búsqueda por clic | Disponible mediante `POST /api/v1/images/search` |
| Tiempo y proyección | La API admite modos en vivo y pausado, sujetos a cobertura temporal de orientación terrestre |
| Paleta, brillo y opacidad | Son responsabilidades del renderizador del frontend |
| Comparación A/B | Requiere gestionar dos imágenes en el frontend; no debe asumir que existen extensiones espectrales o máscaras no expuestas por la API |

## Archivos de referencia del prototipo

- `src/App.jsx`: composición general y estado compartido
- `src/components/PrincipalCanvas.jsx`: escena y capas de imágenes
- `src/components/SkyTimePanel.jsx`: reloj y fecha personalizada
- `src/components/LocationControls.jsx`: ubicación automática y manual
- `src/components/CoordinateSearch.jsx`: búsqueda RA/Dec
- `src/components/FitsPanel.jsx`: búsqueda, resultados, imagen, apariencia y avisos
- `src/components/SpectralCoverage.jsx`: franja espectral
- `src/components/FitsComparisonPanel.jsx`: selección de B y controles de comparación
- `src/components/StarAppearanceControls.jsx`: aspecto de las estrellas
