# Frontend de Astrea

## Espacio de trabajo 3D

La vista ocupa toda la ventana y muestra una esfera 3D desde su interior, con un
degradado oscuro y sin líneas de cuadrícula ni estrellas. El observador permanece
en el centro, representando la perspectiva desde la Tierra.

Arrastra para girar la vista. Usa el desplazamiento de dos dedos del trackpad,
su gesto de pellizco (ctrl+wheel en navegadores compatibles) o la rueda del ratón
para cambiar la escala de una cámara ortográfica, sin FOV ni distorsión de gran
angular. El zoom va de 0.75× a 8× respecto al encuadre inicial, sin salir de la esfera.
El encuadre se adapta al tamaño de la ventana conservando el nivel de zoom.
La navegación permite explorar ambos hemisferios de la bóveda.

### Ubicación y direcciones

Al abrir la vista se solicita la ubicación del navegador (HTTPS o localhost).
El control **Ubicación**, en la esquina superior derecha, permite reintentar o
introducir latitud y longitud en grados decimales. Se pliega cuando se obtiene
la primera ubicación. Una selección manual tiene prioridad sobre respuestas
automáticas pendientes. Sin ubicación, la esfera sigue disponible, pero no se
muestran direcciones ni se asigna una ubicación ficticia.

Las etiquetas Norte, Este, Sur y Oeste son sprites dentro de la escena, anclados
al horizonte geométrico local: +X este, +Y cenit y −Z norte geográfico. No utilizan
el sensor de brújula del dispositivo; señalan la orientación de la cámara virtual.
Conservan 14 px de texto al ampliar. A partir de 3× pasan suavemente a N, E, S y O;
recuperan sus nombres al bajar a 2.7× para evitar parpadeos cerca del umbral.
No interceptan clics, arrastre ni zoom. No hay controles de fecha ni hora.

`EquatorialFrame` convierte la referencia ecuatorial de la esfera al horizonte
local según la ubicación y la hora actual del dispositivo, actualizada cada segundo.
Usa tiempo sidéreo medio y precesión J2000 → fecha aproximada (IAU 1976), sin
refracción, nutación, paralaje ni datos IERS. Es una orientación visual; no sustituye
la transformación Astropy del prototipo para registro preciso de imágenes FITS.

### Integración de futuras imágenes y estrellas

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
