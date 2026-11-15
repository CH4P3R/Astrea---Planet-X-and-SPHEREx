# Frontend de Astrea

## Antes de crear o modificar UI

Consultar la [Guía de diseño e interacción](docs/UI_DESIGN_GUIDE.md), que reúne las decisiones del flujo 1 y los componentes reutilizables. El [índice de documentación](docs/README.md) enlaza las reglas visuales, la arquitectura y el flujo de referencia.

## Espacio de trabajo 3D

La vista ocupa toda la ventana y muestra una esfera 3D desde su interior, con un
degradado oscuro, estrellas de Hipparcos y una guía horizontal transparente. El observador permanece
en el centro, representando la perspectiva desde la Tierra.

Arrastra para girar la vista alrededor del observador, con ejes independientes
como en el prototipo: el movimiento horizontal cambia el rumbo alrededor de +Y;
el vertical cambia la elevación. El giro lateral permanece en cero y la elevación
se limita justo antes de ±90° para evitar invertir la vista. Ambos ejes se suavizan
por separado, también al encuadrar una imagen. La sensibilidad se adapta al tamaño
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
Si no se obtiene, se puede seguir navegando o buscar por RA/Dec. La opción
**Ubicación**, en la barra izquierda, permite solicitarla al navegador
(HTTPS o localhost) o introducir latitud y longitud en grados decimales. Las acciones
permanecen en el pie del panel y el formulario no utiliza plegables. Una selección manual tiene prioridad
sobre respuestas automáticas pendientes. Sin ubicación, la esfera y las direcciones
siguen disponibles como referencias de la escena, sin asignar una ubicación ficticia.

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

La referencia utiliza perspectiva; aquí el suelo se adapta a la proyección
ortográfica del cielo. `horizonSurfaceMaterial.js` calcula la intersección de
cada dirección celeste con el plano Y = −1 y dibuja allí el patrón del suelo.
`stroke` y `grid` son funciones GLSL propias que producen líneas suavizadas con
`fwidth`, una función de GLSL. Las direcciones sobre el horizonte se descartan.
La esfera utilizada como soporte comparte radio y proyección con las estrellas;
el plano representado queda separado del observador y el shader utiliza la
profundidad normal. Esto evita el disco superpuesto y los cortes de un plano
que atraviesa el volumen de la cámara ortográfica.

`useFrame`, de React Three Fiber, actualiza la opacidad con `getWorldDirection`,
de la cámara Three.js. La guía se dibuja antes de las etiquetas y del contenido
astronómico, sin escribir profundidad ni interceptar clics.

La integración utiliza React, Three.js, React Three Fiber y las API del navegador
`fetch` y `AbortController`; no incorpora dependencias nuevas.

### Imágenes SPHEREx a resolución nativa

Con ubicación disponible, haz clic sin arrastrar sobre la esfera para consultar
observaciones directamente. También puedes introducir **RA y Dec en grados decimales
ICRS** en Preparación y pulsar **Buscar coordenadas**, incluso sin ubicación terrestre.
Selecciona una observación de la lista para cargarla; su representación en el cielo
local necesita ubicación. La cámara
encuadra automáticamente el recorte; el arrastre y el zoom siguen disponibles.
El tamaño inicial del recorte es de **7 minutos de arco**, con un máximo de 30.
Editar ese valor lo actualiza inmediatamente para ambas vías de búsqueda, sin tener
que confirmar el cambio ni enviar las coordenadas. Si falta ubicación al pulsar la
escena, un tooltip junto al punto pulsado muestra el estado de la solicitud o su error.

En desarrollo, Vite redirige `/api` al backend en `http://127.0.0.1:8000`.
En despliegue, el servidor debe publicar `/api` bajo el mismo origen del frontend.

`services/images.js` encapsula las peticiones con `fetch` y permite cancelarlas
mediante `AbortController`, ambas API del navegador. `useFitsImage` coordina la
búsqueda y la carga de una sola imagen; verifica el límite de textura de la GPU
antes de solicitar los píxeles. No se reduce ni amplía la matriz espacialmente.

`decodePixels`, en `three/core/imageDataUtils.js`, interpreta float32/float64
little-endian mediante `DataView` y prepara una copia float32 normalizada para
visualización. El contraste utiliza percentiles aproximados 1 y 99,5 de una
muestra de hasta 65536 valores; los datos científicos del backend no cambian.

`FitsImage` utiliza `DataTexture`, `BufferGeometry` y `ShaderMaterial` de Three.js
y `useFrame` de React Three Fiber. Aplica una escala asinh en gris, oculta muestras
no finitas y conserva el origen inferior izquierdo. No aplica flags de calidad.
La malla WCS procede del backend, sin pasar por `EquatorialFrame`.
Interpola las muestras temporales y renueva la proyección cada 90 segundos;
si caduca por un fallo de actualización, oculta la imagen para no mostrar una
posición obsoleta. Al cambiar o limpiar la imagen libera texturas, geometría y material.
No se requieren dependencias adicionales. La resolución nativa puede consumir
memoria considerable incluso cuando la GPU admite las dimensiones del recorte.

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
- `src/three/core/`: escena, cámara y transformaciones de coordenadas.
- `src/three/elements/`: esfera celeste, estrellas, superficie central, imágenes, direcciones y cuadrícula RA/Dec (oculta).
- `src/config/`: parámetros de la vista.
- `src/styles/`: estilos base, de distribución y de componentes, importados por `main.css`.

### Ejecución

Desde `frontend/`:

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

## Referencia de la plantilla React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
