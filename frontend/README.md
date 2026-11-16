# Frontend de Astrea

## Antes de crear o modificar UI

Consultar la [Guía de diseño e interacción](docs/UI_DESIGN_GUIDE.md), que reúne las decisiones del flujo 1 y los componentes reutilizables. El [índice de documentación](docs/README.md) enlaza las reglas visuales, la arquitectura y el flujo de referencia.

## Tutorial guiado

El botón de interrogación encima del selector de idioma abre el tutorial, incluso si
ya se completó o se saltó. La primera visita muestra un icono gris animado y revela
una bienvenida con «Ver tutorial» y «Empezar a explorar». El tutorial solo comienza
al elegirlo. La elección guarda `seen` en `astrea.welcome.v1`, evitando repetir la
bienvenida y su transición de entrada en visitas posteriores. Finalizar
guarda `completed` y Saltar todo o Escape guarda `skipped` en `localStorage`, bajo
`astrea.onboarding.v1`; estos estados nunca deshabilitan el botón de ayuda.

El recorrido reutiliza el espacio de trabajo y el inspector reales, incluidos Datos,
Apariencia, Comparar y Espectro. Los FITS originales del campo de Barnard están en `backend/data/onboarding/`,
con su procedencia y SHA-256. Las imágenes son reales y los controles son los de la aplicación. La sesión previa se
mantiene montada y se recupera al salir; el tutorial tiene su propio observador y reloj.

El backend debe estar disponible. La práctica consulta `/api/v1/images/onboarding` y las
rutas normales de carga, procesamiento y proyección, sin descargar imágenes de IRSA.
Solo incluye dos observaciones D3, con recortes de 7 minutos de arco; para Comparar,
seleccionar 2025 y añadir la otra observación. Su separación de 6,6 horas sirve para
enseñar el blink, no para garantizar movimiento visible.

El paso Espectro utiliza un ejemplo D3 precalculado mediante PSF y apertura sobre
una fuente medible del campo local, no sobre Barnard saturada. Su procedencia se
incluye en `src/components/onboarding/data/spectrum.json`; se regenera mediante
`backend/scripts/generate_onboarding_spectrum.py`. No consulta el espectro remoto.

`AppViewport` controla la apertura y conserva la sesión; `AppWorkspace` compone la UI
real en ambas sesiones. `OnboardingTour` utiliza un portal de React DOM y `box-shadow`;
`scrollTo: false` y foco con `preventScroll` evitan desplazar el lienzo. Los textos son
ES/EN y no se añaden dependencias. El aviso de carga de estrellas y las mejoras del
inspector, los detectores y la cámara de los merges se mantienen.

Las instrucciones se distribuyen en una frase de propósito, acciones numeradas y una
nota breve. En Datos, Apariencia, Comparar y Espectro se resalta la pestaña real en el panel
derecho; pulsar otra pestaña actualiza el paso de la guía. El encabezado ofrece
copiar el enlace y descargar el GIF; «Abrir FITS original» permanece dentro de Datos.

## Espacio de trabajo 3D

La vista ocupa toda la ventana y muestra una esfera 3D desde su interior, con un
degradado oscuro, estrellas de Hipparcos y una guía horizontal transparente. El observador permanece
en el centro, representando la perspectiva desde la Tierra.

Arrastra para girar la vista alrededor del observador, con ejes independientes
como en el prototipo: el movimiento horizontal cambia el rumbo alrededor de +Y;
el vertical cambia la elevación. La navegación inicial mantiene el giro lateral en cero
y limita la elevación justo antes de ±90°. Al cargar una imagen, el encuadre frontal
adopta su orientación WCS mediante GSAP y ajusta el zoom al espacio libre de la UI.
El arrastre interrumpe esa animación y conserva el giro alcanzado. La sensibilidad se adapta al tamaño
angular visible con el zoom ortográfico. Usa el desplazamiento de dos dedos del trackpad,
su gesto de pellizco (ctrl+wheel en navegadores compatibles) o la rueda del ratón
para cambiar la escala de una cámara ortográfica, sin FOV ni distorsión de gran
angular. El zoom va de 0.75× a 8192× respecto al encuadre inicial, sin salir de la esfera.
El encuadre se adapta al tamaño de la ventana conservando el nivel de zoom.
La navegación permite explorar ambos hemisferios de la bóveda.

`skyDragRotation`, `skyRotationForDirection` y `dampSkyRotation`, en
`three/core/skyDragUtils.js`, calculan respectivamente el arrastre por ejes,
el encuadre de una dirección y el suavizado sin giro lateral. Utilizan `Euler`
en orden `YXZ` y `MathUtils`, de Three.js. `skyDirectionAtPointer` conserva la
conversión del clic en una dirección local de la esfera. La orientación
astronómica de `EquatorialFrame` se aplica al fondo, no a la cámara ni al suelo.

### Ubicación y direcciones

La ubicación se solicita automáticamente al abrir la vista cuando el navegador lo permite.
Si el permiso se rechaza, la geolocalización falla o pasan **12 segundos sin respuesta**,
se asigna **Greenwich (51,4779°, 0°)** como ubicación predeterminada para visualizar
el cielo. Se abre **Ubicación** con esas coordenadas y aparece un aviso arriba a la
izquierda, debajo del reloj. Se identifica como referencia, no como ubicación real
del usuario. Si la bienvenida o el tutorial ocultan la sesión, el aviso espera a su regreso.

La opción **Ubicación**, en la barra izquierda, permite volver a solicitarla al
navegador (HTTPS o localhost) o introducir latitud y longitud en grados decimales.
Las acciones permanecen en el pie del panel y el formulario no utiliza plegables.
Una selección manual tiene prioridad sobre respuestas automáticas pendientes; las
respuestas tardías no sustituyen una ubicación ya aplicada. Un reintento fallido
conserva el observador existente. El tutorial y los enlaces compartidos mantienen
su observador de referencia sin activar esta solicitud automática.

Las etiquetas Norte, Este, Sur y Oeste son sprites dentro de la escena, anclados
al horizonte geométrico local: +X este, +Y cenit y −Z norte geográfico. No utilizan
el sensor de brújula del dispositivo; señalan la orientación de la cámara virtual.
Sin ubicación no representan una alineación astronómica calculada para un lugar.
Introducir coordenadas no cambia la orientación de la cámara; las etiquetas pueden
quedar fuera del encuadre al apartar la vista del horizonte o ampliar.
Conservan 14 px de texto al ampliar. A partir de 3× pasan suavemente a N, E, S y O;
recuperan sus nombres al bajar a 2.7× para evitar parpadeos cerca del umbral.
No interceptan clics, arrastre ni zoom. El panel **Tiempo** permite pausar el reloj,
volver al tiempo actual o aplicar una fecha y hora UTC.

`EquatorialFrame` convierte la referencia ecuatorial de la esfera al horizonte
local según la ubicación y el reloj del cielo, actualizado cada segundo en modo en vivo
o fijado al instante elegido en modo pausado.
Usa tiempo sidéreo medio y precesión J2000 → fecha aproximada (IAU 1976), sin
refracción, nutación, paralaje ni datos IERS. Es una orientación visual; no sustituye
la transformación Astropy del prototipo para registro preciso de imágenes FITS.

### Estrellas y superficie central

Las estrellas se cargan automáticamente al disponer de ubicación, mediante
`POST /api/v1/sky`, con magnitud aparente máxima de 7. La respuesta JSON incluye
colores, magnitudes y direcciones en el mismo orden; no es necesario descargar
por separado `/star-catalog`. Se muestran ambos hemisferios.

`useStars` solicita el cielo para la ubicación y el contexto de Tiempo vigentes.
Al cambiar cualquiera de ellos, cancela la petición anterior y descarta las
posiciones antiguas. En vivo interpola las muestras de 10 segundos y renueva
la ventana 30 segundos antes de su vencimiento. En pausa mantiene una sola muestra.
Si falla la carga, **Aspecto del cielo** muestra el error y permite reintentar;
las posiciones caducadas dejan de dibujarse.

`Stars` dibuja un único conjunto de puntos con `BufferGeometry` y `ShaderMaterial`
de Three.js. El tamaño y el brillo dependen de la magnitud y conservan su escala
en píxeles al ampliar. `useFrame`, de React Three Fiber, actualiza las posiciones
normalizadas al radio de la esfera. Las direcciones ya son locales (+X este,
+Y arriba, −Z norte), por lo que no pasan por `EquatorialFrame`.

`HorizonSurface` representa un suelo horizontal en **Y = −1**, bajo el observador,
mediante una cuadrícula, anillos y marcas transparentes. Sigue la referencia de
`Proyecto_Prototipo/frontend/src/components/scene/Ground.jsx` y `groundMaterial.js`
del proyecto indicado por el usuario. La opacidad se atenúa con la distancia y
al mirar hacia el nadir, donde queda el 15 % de la opacidad base de 0,28.
El control **Mostrar superficie central**, en **Aspecto del cielo**, permite
ocultar la guía. Está activada inicialmente y permite explorar el cielo inferior.

Al ampliar, el grosor de las líneas se compensa con el inverso del zoom para
evitar barras cada vez más anchas. La guía pierde opacidad suavemente entre 1×
y 8× y queda oculta desde 8×, dejando libre la inspección de recortes FITS.
Al alejar la vista reaparece de forma gradual. `baseOrthographicZoom`, una función
propia, calcula el zoom relativo al encuadre inicial; `MathUtils.smoothstep`, de
Three.js, controla la transición de opacidad. El ajuste se aplica a cuadrícula,
anillos y marcas centrales, y se combina con la atenuación por inclinación.

La referencia utiliza perspectiva; aquí el suelo se adapta a la proyección
ortográfica del cielo. `horizonSurfaceMaterial.js` calcula la intersección de
cada dirección celeste con el plano Y = −1 y dibuja allí el patrón del suelo.
`stroke` y `grid` son funciones GLSL propias que producen líneas suavizadas con
`fwidth`, una función de GLSL. Las direcciones sobre el horizonte se descartan.
La esfera utilizada como soporte comparte radio y proyección con las estrellas;
el plano representado queda separado del observador y el shader utiliza la
profundidad normal. Esto evita el disco superpuesto y los cortes de un plano
que atraviesa el volumen de la cámara ortográfica.

`useFrame`, de React Three Fiber, actualiza el grosor y la opacidad según el zoom
y la orientación obtenida con `getWorldDirection`, de la cámara Three.js.
La guía se dibuja antes de las etiquetas y del contenido
astronómico, sin escribir profundidad ni interceptar clics.

La integración utiliza React, Three.js, React Three Fiber y las API del navegador
`fetch` y `AbortController`; no incorpora dependencias nuevas.

### Imágenes SPHEREx a resolución nativa

Con ubicación disponible, haz clic sin arrastrar sobre la esfera para consultar
observaciones directamente. También puedes introducir **RA y Dec en grados decimales
ICRS** en Preparación y pulsar **Buscar coordenadas**, incluso sin ubicación terrestre.
Cada búsqueda solicita solo la observación más reciente (`limit=1`) y carga su imagen
automáticamente cuando hay ubicación. Si la búsqueda manual se realiza sin ubicación,
conserva la observación encontrada para cargarla después de definir el observador.
La cámara encuadra automáticamente el recorte; el arrastre y el zoom siguen disponibles.
El tamaño inicial del recorte es de **7 minutos de arco**, con un máximo de 30.
Editar ese valor lo actualiza inmediatamente para ambas vías de búsqueda, sin tener
que confirmar el cambio ni enviar las coordenadas. Si falta ubicación al pulsar la
escena, un tooltip junto al punto pulsado muestra el estado de la solicitud o su error.

El selector **Explorar detectores**, en el inspector derecho, permite elegir D1–D6
mediante segmentos pastel o volver a la observación más reciente de cualquier detector.
Cambiarlo consulta las mismas coordenadas ICRS y el mismo tamaño de la región cargada.
La imagen anterior permanece visible hasta que la nueva esté lista, también ante un error
o una consulta vacía. Una nueva región empieza con cualquier detector.
Los rangos mostrados son referencias del detector, no la longitud de onda de cada píxel.
`setDetector`, de `useFitsImage`, coordina ese cambio; `searchImages` y `searchCoordinates`,
de `services/images.js`, envían el filtro y `limit=1` con `fetch`. Utilizan React y las
API del navegador existentes, sin dependencias nuevas.

La búsqueda muestra un aviso animado arriba a la derecha con el indicador de carga
giratorio y un pulso ligero. Si hay observador y un resultado, pasa a «Cargando imagen…»
y termina con «Imagen cargada» durante 3,2 segundos. Sin observador, informa del
resultado encontrado; `has_more` indica que hay observaciones anteriores fuera de
esta consulta limitada, sin representar el total del archivo.
Preparación conserva la cancelación durante la búsqueda y la carga.
El aviso también presenta errores de búsqueda/carga, confirmación de cancelación y
ausencia de observaciones. Error y ausencia de resultados comparten el icono
`NoResultsOutlineBold`, con color de error solo para el fallo; la cancelación usa `Cancel`.
El panel conserva el diagnóstico detallado cuando falla una petición.

`components/common/StatusNotice.jsx` recibe un objeto estable `notice` con `status`
(`loading`, `success`, `error`, `cancelled`, `empty` o `warning`) y `message`; `null` inicia la salida.
Los mensajes son claves o descriptores de los catálogos ES/EN. La propiedad `duration`
permite ajustar la permanencia del resultado. `useFitsImage` actualiza el aviso junto
con el estado de cada petición y descarta respuestas canceladas. Su función `cancel`
aborta una operación y muestra la confirmación; `reset` limpia sin ese aviso. Utiliza React,
temporizadores del navegador y CSS nativo, con soporte para movimiento reducido.

En desarrollo, Vite redirige `/api` al backend en `http://127.0.0.1:8000`.
En despliegue, el servidor debe publicar `/api` bajo el mismo origen del frontend.

`services/images.js` encapsula las peticiones con `fetch` y permite cancelarlas
mediante `AbortController`, ambas API del navegador. `useFitsImage` coordina la
búsqueda y la carga de una sola imagen; verifica el límite de textura de la GPU
antes de solicitar los píxeles. No se reduce ni amplía la matriz espacialmente.

`decodePixels`, en `three/core/imageDataUtils.js`, interpreta float32/float64
little-endian mediante `DataView`, conserva los valores nativos y prepara una copia
float32 normalizada. `displayRange` y `normalizePixels` calculan y aplican percentiles
1 y 99,5 sobre hasta 65536 muestras. Las observaciones seleccionadas usan un intervalo compartido, conservando
los valores originales para recalcularlo al cambiar la selección.

`FitsImage` utiliza `DataTexture`, `BufferGeometry` y `ShaderMaterial` de Three.js
y `useFrame` de React Three Fiber. Aplica una escala asinh con paleta, brillo y opacidad,
oculta muestras no finitas y conserva el origen inferior izquierdo. El procesamiento
opcional de Apariencia solicita flags, fondo zodiacal o señal/ruido a la API.
La malla WCS procede del backend, sin pasar por `EquatorialFrame`. `useProjectedImage`
renueva la proyección cada 90 segundos y permite reintentar; las muestras caducadas
no se dibujan ni habilitan reproducción. Al cambiar o limpiar la imagen se liberan
texturas, geometría y material. La resolución nativa puede consumir
memoria considerable incluso cuando la GPU admite las dimensiones del recorte.

### Inspector derecho

La primera imagen cargada abre el inspector y cierra Preparación. Su encabezado
concentra la fecha UTC, el detector y la publicación de la observación visible.
Cerrar pausa la reproducción y limpia la sesión de imagen. Pulsar otra región
durante una inspección pide confirmación antes de iniciar la nueva búsqueda.

- **Datos:** datos básicos (dimensiones, tamaño solicitado y píxeles finitos) y datos
  técnicos (RA/Dec, centro real, unidad, precisión, extremos e identificador). La cabecera
  WCS tiene una vista interna; el FITS original se abre desde su enlace de procedencia.
- **Apariencia:** paleta, brillo, opacidad y restauración visual; procesamiento opcional
  consistente para la secuencia seleccionada. Los originales se conservan si falla el procesamiento.
- **Comparar:** consulta anual desde 2025 hasta el año UTC actual, con el mismo
  detector o cualquiera y hasta 100 candidatas. Permite añadir varias observaciones,
  recorrerlas en una línea temporal cronológica, quitar observaciones y reproducir
  la secuencia con intervalos de 0,1 a 3 segundos. Las flechas SVG anterior/siguiente
  cambian la imagen visible. La reproducción requiere unidades compatibles,
  procesamiento listo y proyecciones vigentes. `has_more` avisa de observaciones
  fuera de la lista; no hay paginación.
- **Espectro:** mide la posición ICRS de la imagen por detector, mediante ajuste PSF
  o fotometría de apertura, usando `GET /api/v1/spectrum`. Muestra flujo frente a
  longitud de onda, incertidumbres y calidad; permite ocultar series y reintentar
  errores o resultados incompletos. La cobertura depende de las exposiciones
  disponibles: no garantiza 102 bandas ni una observación simultánea.

El encabezado permite **Copiar enlace** con RA, Dec, tamaño del recorte y detector,
sin compartir la ubicación terrestre ni el reloj del observador. Abrir un enlace
válido utiliza Greenwich como referencia y restaura la búsqueda.

A su izquierda, **Descargar GIF** se habilita en Comparar cuando la secuencia está
preparada. Exporta hasta 20 observaciones cargadas, en orden cronológico, con el
intervalo vigente y repetición continua. Utiliza las mallas WCS para mantener la
alineación y toma el zoom, orientación y densidad física de píxeles del renderizado:
no limita la resolución a 320 px. Conserva la normalización compartida, el
procesamiento, brillo y paleta; usa 64 colores y compresión LZW. No captura el HUD,
fondo ni mezcla de opacidad. El archivo puede ser grande al ampliar o utilizar
pantallas de alta densidad. Consulte [Comparación y exportación](docs/COMPARISON.md).

`ImageInspector` compone las vistas mediante `PanelContent`, `Tabs`, `MetadataList`,
`Select`, `RangeField`, `HelpButton` y `Tooltip`. Los hooks de búsqueda, proyección,
apariencia, comparación y reproducción mantienen responsabilidades independientes.
Los textos y ayudas proceden de los catálogos ES/EN, incluidos `inspector.json`,
`spectrum.json`, `share.json` y `location.json`.

`useImageViewport` mide los obstáculos del HUD con `ResizeObserver` y obtiene el área
libre mediante `availableImageRect`. `imageFrame` calcula orientación y límites a partir
de los vértices WCS de las imágenes, usando vectores, matrices y cuaterniones de Three.js.
`SkyCameraRig` interpola orientación, zoom y desplazamiento de proyección con `gsap.to`,
de **GSAP**, durante 1,8 segundos. Conserva la imagen completa y su proporción original,
incluidos recortes rectangulares, y sigue su orientación en vivo hasta una interacción manual.
El encuadre se recalcula al cambiar el espacio disponible o pulsar **Centrar imagen**.
En pantallas estrechas el inspector pasa a la zona inferior; movimiento reducido elimina
la transición de cámara. La dependencia nueva es `gsap`; no se añade un gestor de estado.

### Capas de renderizado

`SkyBackdrop` renderiza primero la esfera, la superficie central y las etiquetas en una escena de fondo.
Después limpia la profundidad y dibuja la escena principal. Así, una imagen de
la escena principal puede cubrir las letras incluso si usa un material transparente
o está más lejos que ellas. Las zonas transparentes de la imagen dejan ver el fondo.
No se usan etiquetas HTML por encima del lienzo.

Las estrellas y las imágenes se añaden a la escena principal, fuera de
`SkyBackdrop`, usando directamente las direcciones locales de la API. Las
estrellas se dibujan sobre las etiquetas y antes de las imágenes FITS.
Solo la geometría definida en RA/Dec debe envolverse con `EquatorialFrame`.
Su base ecuatorial es dextrógira: +X RA 18 h, +Y polo norte celeste, −Z RA 0 h.

### Organización

- `src/components/layout/`: contenedor de pantalla completa y capa de escena.
- `src/components/controls/` y `src/hooks/`: ubicación automática/manual.
- `src/components/spectrum/`: gráfico y controles de espectro.
- `src/export/`: generación del GIF alineado y control de descarga.
- `src/share/`: lectura, actualización y copia de enlaces de búsqueda.
- `src/three/core/`: escena, cámara y transformaciones de coordenadas.
- `src/three/elements/`: esfera celeste, estrellas, superficie central, imágenes, direcciones y cuadrícula RA/Dec (oculta).
- `src/config/`: parámetros de la vista.
- `src/styles/`: estilos base, de distribución y de componentes, importados por `main.css`.

### Ejecución

Desde `frontend/`:

Se recomienda Node.js 24 LTS. La API debe ejecutarse en otra terminal con
`python -m uvicorn app.main:app --reload` desde `backend/`, tras instalar sus
dependencias; véase [la preparación del backend](../backend/environment.md).

```powershell
npm ci
npm run dev
```

### Verificación

```powershell
npm run lint
npm run build
npm test
```
