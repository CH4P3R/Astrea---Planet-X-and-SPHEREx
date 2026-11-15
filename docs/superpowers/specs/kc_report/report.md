# Espectro sobre la marcha: cómo se va a trabajar y en qué nos basamos

- **Fecha:** 15 de noviembre de 2026
- **Estado:** plan de trabajo. Todavía no hay código del espectro.
- **Alcance:** solo la parte del reto que pide mostrar las 102 bandas infrarrojas y generar espectros sobre la marcha.

## Resumen

Vamos a calcular el espectro en nuestro propio backend, con un endpoint nuevo que mide el brillo del punto elegido en cada exposición de SPHEREx que lo cubre. IRSA ya tiene una herramienta que hace esto, pero no se puede usar desde la app: no tiene API y tarda de minutos a horas por objeto. La usaremos solo para comprobar que nuestros resultados son correctos.

El método de la primera versión es fotometría de apertura, siguiendo el notebook oficial 04. El ajuste de PSF, que es el método de la herramienta oficial y rinde mejor en objetos débiles, queda como segundo paso. Las reglas de calidad (qué píxeles se descartan, qué puntos se marcan como dudosos, en qué unidad se muestra el flujo) las tomamos de la documentación de la herramienta oficial, para que los dos resultados sean comparables.

## Qué pide el reto

El texto del reto dice dos cosas sobre esta parte:

- Pensar de forma creativa cómo mostrar las 102 bandas infrarrojas, por ejemplo sumando por separado los datos de cada uno de los seis detectores para mejorar la relación señal-ruido.
- Un reconocimiento extra si la herramienta genera espectros sobre la marcha.

Un espectro es el brillo de un objeto medido en función de la longitud de onda. En la práctica es un gráfico con la longitud de onda en el eje horizontal y el flujo en el vertical.

## Cómo mide SPHEREx y por qué hacen falta muchas imágenes

SPHEREx no toma un espectro completo de una vez. Cada detector tiene un filtro cuya longitud de onda cambia a lo largo del detector, así que cada píxel de una imagen ve una longitud de onda distinta. Un objeto cae en un solo lugar del detector, y por eso cada imagen lo mide en una sola longitud de onda.

Para tener el espectro completo hay que juntar todas las imágenes en las que el objeto aparece, cada una con el objeto en otra posición del detector. Datos concretos:

- Hay seis detectores, de D1 (0.75–1.09 µm) a D6 (4.42–5.00 µm). La división nominal es de 17 canales por detector, y 6 × 17 da las 102 bandas.
- Un punto del cielo está cubierto normalmente por unas 200 imágenes. Hay menos cerca del plano de la eclíptica y muchas más cerca de los polos eclípticos.
- El resultado suele tener más de 102 mediciones por objeto. El gráfico mostrará todas las que existan, sin forzarlas a 102.
- Cada apuntado del telescopio mide el objeto en dos longitudes de onda a la vez, una en el grupo D1–D3 y otra en el grupo D4–D6. Por eso los archivos de un punto suelen venir en parejas con la misma fecha.
- La resolución no es igual en todos los detectores: D1 a D4 tienen R entre 35 y 41, D5 tiene 112 y D6 tiene 128. Los puntos de D5 y D6 cubren un ancho de longitud de onda más angosto.

## De dónde sale la información

Usamos cuatro fuentes. Las tres primeras son oficiales; la cuarta es un asistente que resume documentación oficial.

| Fuente | Qué aporta |
| --- | --- |
| Notebooks oficiales de IRSA en `notebooks/` | El 01 explica el formato de las imágenes. El 04, sección 12, es un ejemplo completo de espectro de un punto con fotometría de apertura. |
| Página de SPHEREx en IRSA (`irsa.ipac.caltech.edu/Missions/spherex.html`) | Rangos y resolución de cada detector, lista de herramientas y documentos, fechas de las publicaciones de datos. |
| Página de calibraciones espectrales de IRSA | Confirma la división en 17 canales por detector. |
| Asistente de ayuda de la documentación de SPHEREx | Respuestas sobre cómo funciona la herramienta oficial de espectros. Ver la sección siguiente. |

También revisamos un tutorial de NEOSSat, un telescopio canadiense de luz visible. No sirve para esto: tiene una sola banda y no hace fotometría ni espectros.

## Qué le preguntamos al asistente de SPHEREx y qué respondió

IRSA ofrece una "Spectrophotometry Tool" que extrae espectros de las imágenes de SPHEREx. Su documentación no se podía leer de forma automática, así que Kevin le hizo las preguntas al asistente de ayuda de la documentación. Cada respuesta cita la sección del documento oficial de la que sale.

Preguntamos estas cosas porque el notebook 04 no las deja claras: dice que la fotometría "incluye resta de fondo", pero el código que lo hace no está en el repositorio.

| Pregunta | Por qué la hicimos | Respuesta |
| --- | --- | --- |
| ¿Basta con llamar a la herramienta oficial? | Para saber si había que construir algo propio. | No. Es una herramienta interactiva, procesa las imágenes en el momento y tarda de minutos a horas por objeto. Solo corren dos trabajos a la vez. |
| ¿Tiene una API? | Para saber si la app podía pedirle espectros. | No hay ninguna documentada. Las API que existen devuelven imágenes, recortes y sus datos, no espectros. |
| ¿Qué método de fotometría usa, y cómo resta el fondo? | Para que nuestros números se parezcan a los oficiales. | Ajusta un modelo de la forma de la estrella (PSF) con la posición fija. No usa apertura. El fondo es local: lo estima con los píxeles cercanos, sin contar los que están marcados como fuente conocida. No usa un modelo de luz zodiacal. |
| ¿Qué columnas trae la tabla de salida? | Para decidir qué devuelve nuestro endpoint. | Además del espectro trae `flags` (problemas de la medición), `fit_ql` (calidad del ajuste, cerca de 1 es bueno) y `flux_bkg` (fondo usado). La documentación consultada no confirma columnas de error, ancho de banda ni detector. |
| ¿Cómo trata los píxeles marcados? | Para definir qué puntos se descartan y cuáles se marcan. | Ver "Reglas de calidad". |
| ¿Cómo se pasa de MJy/sr a µJy? | Las imágenes vienen en brillo por área y el espectro se muestra en flujo. | Se multiplica por el ángulo sólido del píxel: µJy = MJy/sr × ángulo sólido en sr × 10¹². El ángulo sólido cambia de píxel a píxel; no hay un valor único. |
| ¿Cuántas imágenes cubren un punto? | Para estimar el tiempo de cálculo. | Unas 200, según la zona del cielo. |

El asistente también explicó que su gráfico muestra longitud de onda, flujo en µJy y fecha de cada punto, y que los puntos se pueden colorear por fecha.

Una de sus respuestas no aplica: entendió "102 bandas" como 102 objetos distintos y habló de dividir la petición en seis lotes de 20. Nuestro caso es un solo punto del cielo.

## Decisiones

### El cálculo se hace en nuestro backend

La herramienta oficial no tiene API y es demasiado lenta para algo "sobre la marcha". El backend ya sabe buscar las imágenes de un punto y descargar solo el recorte necesario de cada una, así que la base existe.

### Un endpoint aparte del de imágenes

El visor de imágenes pide una sola observación. El espectro necesita todas las del punto, unas 200. Si compartieran endpoint, cargar una imagen tendría que esperar al espectro. Separados, la imagen se ve de inmediato y el espectro se va llenando.

### Una medición por exposición, sin promediar

Cada exposición produce un punto del gráfico con su longitud de onda, ancho de banda, flujo, error, fecha, detector y avisos de calidad. No se promedian puntos entre sí, porque eso oculta objetos que cambian de brillo y mezcla longitudes de onda distintas.

### Primera versión con fotometría de apertura

Hay dos métodos posibles:

| | Apertura (notebook 04) | Ajuste de PSF (herramienta oficial) |
| --- | --- | --- |
| Cómo funciona | Suma el brillo dentro de un círculo centrado en el objeto. | Ajusta la forma conocida de una estrella a los píxeles. |
| Ventaja | Simple y con ejemplo oficial completo. | Coincide con IRSA y separa mejor objetos vecinos. |
| Desventaja | El círculo no recoge toda la luz, así que el flujo sale algo más bajo. | Bastante más trabajo y más formas de fallar. |

Empezamos con apertura para tener un espectro funcionando pronto. El endpoint queda preparado para cambiar de método después sin tocar el frontend. La comparación con IRSA dirá cuánta diferencia hay en la práctica.

Por qué apertura primero:

- **Hay un ejemplo oficial completo.** El notebook 04 saca un espectro de principio a fin con apertura. Para PSF solo está el notebook 03, que enseña a leer el modelo de estrella pero no a ajustar un espectro con él.
- **PSF tiene más pasos donde equivocarse.** El modelo de estrella cambia según la zona del detector y viene en una rejilla más fina que la imagen. Hay que elegir la zona, desplazarlo a la posición exacta del objeto, reducirlo a la rejilla de la imagen y ajustar. Un error en cualquiera de esos pasos da flujos incorrectos sin avisar.
- **El resto del trabajo es el mismo.** Buscar las exposiciones, descargar recortes, leer la longitud de onda, aplicar flags, convertir unidades, caché y gráfico no dependen del método. Cambiar a PSF después es reemplazar una sola función.

Qué se gana si después pasamos a PSF:

- **Objetos débiles.** La apertura suma el ruido de unos 28 píxeles por igual. El ajuste da más peso a los píxeles donde está la luz, así que el punto sale con menos error. Importa para este reto, porque los objetos de interés (enanas marrones frías, candidatos a Planeta X) son débiles.
- **Vecinos cercanos.** El ajuste puede separar dos objetos pegados. La apertura mezcla su luz.
- **Píxeles malos.** Si un píxel descartado cae dentro del círculo, la apertura pierde esa luz. El ajuste la recupera con los píxeles restantes.
- **Flujo total y forma del espectro.** La imagen de una estrella es más ancha en longitudes de onda largas, así que un círculo fijo recoge una fracción algo menor de la luz en D6 que en D1. Eso inclina un poco el espectro. El ajuste no tiene ese sesgo y da el flujo total, comparable con IRSA.
- **Medida de calidad.** El ajuste dice qué tan bien encajó el modelo (el `fit_ql` de IRSA), que sirve para detectar mediciones malas.

Por estas ventajas, PSF es el segundo paso previsto y no algo opcional: los objetos del reto son justo los casos donde la apertura rinde peor. Para una estrella brillante y aislada los dos métodos dan casi lo mismo. Estas ventajas son las generales del método; no hemos medido cuánto pesa cada una en datos de SPHEREx.

Qué brillos se restan: la imagen trae sumados al objeto la luz zodiacal y otros brillos difusos del cielo. Todo eso se quita junto, como un fondo local medido alrededor del objeto. El anillo es la forma de medir ese fondo cuando se usa apertura. Con PSF no hay anillo: el ajuste calcula a la vez el brillo del objeto y el valor del fondo con los mismos píxeles.

Parámetros de la apertura:

- **Radio:** 3 píxeles por defecto, igual en todas las exposiciones, con 4 y 5 como alternativas. Son los tres valores del notebook 04. Un radio fijo evita escalones falsos entre puntos.
- **Centro:** la posición exacta del objeto en cada exposición, con fracciones de píxel. Los píxeles del borde cuentan por la parte que queda dentro del círculo.
- **Fondo:** la mediana de un anillo alrededor del objeto, sin contar los píxeles marcados como fuente conocida. El tamaño del anillo (6 a 9 píxeles) es una propuesta nuestra, no viene de la documentación.
- **Luz zodiacal:** no se resta aparte. El fondo local ya la incluye, y la herramienta oficial tampoco usa un modelo zodiacal.
- **Error:** sale de la extensión `VARIANCE` de cada archivo.

### Reglas de calidad

Las tomamos tal cual de la documentación de la herramienta oficial. Hay dos listas.

**Píxeles que no entran en la medición** (11 flags): `SUR_ERROR`, `NONFUNC`, `MISSING_DATA`, `HOT`, `COLD`, `NONLINEAR`, `PERSIST`, `BLOOM`, `SNOWBALL`, `HALO`, `SATELLITE_HALO`.

**Flags que marcan el punto como dudoso** si aparecen a menos de 2.5 píxeles del objeto (19 flags): los 11 anteriores más `TRANSIENT`, `OVERFLOW`, `DICHROIC`, `CROSSTALK`, `GHOST`, `GHOST_FPA`, `GHOST_EXT` y `STREAK`.

Un punto dudoso no se borra. Se muestra con otro estilo y el usuario puede ocultarlo. Los puntos con `DICHROIC` merecen más desconfianza, porque la calibración en esa zona del detector no es buena.

### Unidad y presentación

- El flujo se muestra en µJy, igual que la herramienta oficial, para poder comparar.
- Los puntos se colorean por detector. Colorear por fecha queda como alternativa, que además deja ver objetos variables.
- Cada punto lleva barra de error vertical y una barra horizontal con su ancho de banda real.

## Limitaciones conocidas

- **Diferencia con IRSA.** Con apertura, el flujo saldrá algo más bajo que el oficial. No sabemos cuánto hasta comparar.
- **Objetos que se mueven.** Las exposiciones de un punto están repartidas en meses. Un objeto con movimiento propio alto, como WISE 0855 (unos 8″ por año), o cualquier cuerpo del sistema solar, no está en el mismo lugar en todas. IRSA tiene una herramienta aparte para eso (MOST); no está en esta primera versión.
- **Objetos variables.** El espectro mezcla fechas distintas. Colorear por fecha ayuda a detectarlo.
- **Tiempo de cálculo.** Estimamos entre medio minuto y un minuto la primera vez para un punto típico, con los primeros puntos visibles en uno o dos segundos. La cuenta: cargar un recorte tarda 1.1 s (medido), hay unas 200 exposiciones y se descargan 8 a la vez como en el notebook 04, lo que da unos 30 s. Falta sumar la lectura de la longitud de onda de cada archivo, que no está medida. El total del espectro tampoco está medido; el primer paso del trabajo incluye medirlo con 20 exposiciones.
- **Casos lentos.** Los puntos cerca de los polos eclípticos pueden tener miles de exposiciones y tardar varios minutos. IRSA también puede frenarnos si pedimos demasiado en paralelo. Por eso el resultado se entrega de forma progresiva y se guarda en caché: la segunda consulta del mismo punto sale al instante.
- **Dependencia nueva.** El notebook usa la librería `photutils`, que hoy no está en `backend/requirements.txt`.

## Orden de trabajo

1. Leer la longitud de onda y el ancho de banda del objeto en una exposición.
2. Medir flujo, fondo y error en una exposición, con pruebas sobre imágenes sintéticas de resultado conocido.
3. Endpoint que recorre todas las exposiciones del punto, con caché y entrega progresiva.
4. Validación: correr un mismo objeto en la herramienta de IRSA desde el navegador, descargar su tabla y compararla con la nuestra.
5. Decisión sobre PSF según el paso 4: si con apertura los objetos débiles salen demasiado ruidosos o la diferencia con IRSA es grande, se cambia a ajuste de PSF antes de pulir el gráfico.
6. Gráfico en el frontend.

## Qué falta confirmar

- Cuánta diferencia hay entre nuestra apertura y el ajuste de PSF de IRSA (paso 4).
- El tamaño del anillo de fondo, que es una propuesta nuestra.
- Si la tabla oficial trae columna de error, para comparar también las barras de error.
- Que cada apuntado da dos longitudes de onda porque los grupos D1–D3 y D4–D6 miran el mismo campo. El asistente solo dice "dos longitudes de onda por observación"; el motivo es una deducción nuestra a partir del diseño del instrumento.
