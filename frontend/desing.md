---
name: frontend-minimalista
description: Crear componentes minimalistas con microinteracciones suaves y CSS organizado conforme a la arquitectura del frontend de Astrea
---

# Consulta obligatoria antes de crear UI

Consultar la [Guía de diseño e interacción](docs/UI_DESIGN_GUIDE.md) antes de crear o modificar UI del frontend. Documenta las decisiones del flujo 1 sobre paneles persistentes, centrado, acciones fijas, scroll, tooltips, ayuda contextual y eliminación de redundancias. El [índice de documentación](docs/README.md) reúne las referencias complementarias.

# Arquitectura y organización

- Respetar `FRONTEND_ARCHITECTURE.md` y las convenciones existentes
- Implementar componentes con React y CSS nativo tradicional
- Centralizar las hojas de estilo en `src/styles/`, no junto a los archivos JSX
- Agrupar el CSS por responsabilidad:
  - `styles/base/`: variables compartidas, colores, tipografía, normalización y niveles de apilamiento
  - `styles/layout/`: estructura del viewport, capas, anclajes del HUD y `pointer-events`
  - `styles/components/`: hojas individuales para los componentes visuales y sus variantes
- Reutilizar las hojas existentes antes de crear otras
- Mantener los estilos de cada componente agrupados en su hoja, incluidos estados, microinteracciones y ajustes responsivos
- Importar las hojas desde `styles/main.css`, respetando el orden base, layout y componentes
- Evitar estilos inline, bloques de estilos en JSX y reglas específicas de componentes dentro de archivos globales
- Usar nombres ASCII y clases identificables por componente para evitar colisiones

# Ubicación de componentes

- `components/common/`: botones, selectores, sliders, tooltips y otras piezas reutilizables
- `components/controls/`: controles específicos de entrada y navegación
- `components/blink-hud/`: componentes de inspección temporal
- `components/layout/`: organización de las capas y regiones de interfaz
- `animations/`: funciones y presets reutilizables de GSAP

# Apariencia

- Usar colores sólidos en botones y controles, sin bordes decorativos
- Diferenciar estados mediante color y movimiento discreto
- Mantener esquinas redondeadas e iconos simples
- Separar fondo, contenido e icono para animarlos independientemente
- Evitar que la expansión del fondo deforme textos o desplace componentes vecinos
- Centralizar los valores compartidos en variables CSS

# Microinteracciones

- Usar transiciones suaves con rebotes elásticos discretos
- Tomar como referencia `cubic-bezier(0.34, 1.56, 0.64, 1)` y una duración aproximada de 360 ms
- Aplicar una reacción principal por interacción
- Botones: expansión ligera del fondo, manteniendo estable el contenido
- Iconos direccionales: desplazamiento pequeño, rebote y regreso al origen
- Selectores: presentación visual separada del control nativo y movimiento discreto de la flecha
- Selectores segmentados: indicador sólido deslizante detrás de la opción activa
- Sliders: pista fina y crecimiento moderado de pista y tirador durante la interacción
- Checkboxes: aparición del fondo mediante escala y dibujo progresivo de la marca
- Tooltips: opacidad y escala breve, con transiciones de 100 a 160 ms
- Mantener inmediata la actualización del valor durante el arrastre de sliders

# Convivencia con GSAP

- CSS define apariencia, maquetación y microinteracciones locales
- GSAP controla `transform` y `opacity` de los contenedores animados
- No declarar `transition: all` ni transiciones CSS sobre propiedades controladas por GSAP
- Aplicar las microinteracciones a capas internas independientes cuando el contenedor esté animado con GSAP
- Conservar `pointer-events: none` en la capa general de interfaz y `pointer-events: auto` en los controles interactivos

# Accesibilidad

- Limitar los efectos hover a dispositivos compatibles mediante `@media (hover: hover)`
- Mantener el foco de teclado visible, sin confundirlo con un borde decorativo
- Mostrar los tooltips también mediante foco y asociarlos con `aria-describedby`
- Respetar `prefers-reduced-motion`
- Conservar controles nativos y áreas de interacción cómodas
