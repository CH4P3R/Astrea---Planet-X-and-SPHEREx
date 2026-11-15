# Frontend de Astrea

## Antes de crear o modificar UI

Consultar la [Guía de diseño e interacción](docs/UI_DESIGN_GUIDE.md), que reúne las decisiones del flujo 1 y los componentes reutilizables. El [índice de documentación](docs/README.md) enlaza las reglas visuales, la arquitectura y el flujo de referencia.

## Espacio de trabajo 3D

La vista ocupa toda la ventana y muestra una esfera 3D desde su interior, con un
degradado oscuro y sin líneas de cuadrícula ni estrellas. El observador permanece
en el centro, representando la perspectiva desde la Tierra.

Arrastra para girar la vista tomando como ancla el punto de la esfera donde pulsas.
Ese punto sigue el recorrido del cursor, sin multiplicadores de velocidad angular,
también al ampliar. Se conserva un suavizado temporal que converge a la posición
indicada por el cursor, sin añadir recorrido. Usa el desplazamiento de dos dedos del trackpad,
su gesto de pellizco (ctrl+wheel en navegadores compatibles) o la rueda del ratón
para cambiar la escala de una cámara ortográfica, sin FOV ni distorsión de gran
angular. El zoom va de 0.75× a 8192× respecto al encuadre inicial, sin salir de la esfera.
El encuadre se adapta al tamaño de la ventana conservando el nivel de zoom.
La navegación permite explorar ambos hemisferios de la bóveda.

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

### Integración de futuras imágenes y estrellas

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

`SkyBackdrop` renderiza primero la esfera y las etiquetas en una escena de fondo.
Después limpia la profundidad y dibuja la escena principal. Así, una imagen de
la escena principal puede cubrir las letras incluso si usa un material transparente
o está más lejos que ellas. Las zonas transparentes de la imagen dejan ver el fondo.
No se usan etiquetas HTML por encima del lienzo.

El futuro contenido astronómico debe añadirse en la escena principal, fuera de
`SkyBackdrop`, y envolver geometría RA/Dec con `EquatorialFrame` para compartir
el horizonte local. Su base ecuatorial es dextrógira: +X RA 18 h, +Y polo norte
celeste, −Z RA 0 h. Las estrellas tendrán prioridad visual sobre las letras;
la atenuación por proximidad se conectará cuando exista un catálogo de estrellas.

### Organización

- `src/components/layout/`: contenedor de pantalla completa y capa de escena.
- `src/components/controls/` y `src/hooks/`: ubicación automática/manual.
- `src/three/core/`: escena, cámara y transformaciones de coordenadas.
- `src/three/elements/`: esfera celeste, direcciones y cuadrícula RA/Dec (oculta).
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
