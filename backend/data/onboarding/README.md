# FITS reales para el tutorial

Dos recortes SPHEREx DR1 del campo de la estrella de Barnard, descargados de IRSA
el 15 de noviembre de 2026. Se incluyen en el repositorio, fuera de la caché ignorada.
No son imágenes generadas ni datos simulados.

| Archivo | Observación UTC | Detector | IMAGE | Tamaño del archivo |
| --- | --- | --- | --- | --- |
| `barnard_1.fits` | 2025-08-15 20:45:11.338 | D3 | 68 × 68 | 4.106.880 bytes |
| `barnard_2.fits` | 2025-08-16 03:21:23.723 | D3 | 68 × 68 | 4.106.880 bytes |

Cada FITS conserva IMAGE, FLAGS, VARIANCE, ZODI, EPSF y WCS-WAVE del recorte servido
por IRSA. El tutorial utiliza los cuatro primeros planos mediante los decodificadores
habituales del backend. La imagen mantiene sus píxeles nativos y su WCS.

Centro ICRS solicitado: RA 269,4463°, Dec 4,7679°. Lado del recorte: 7 minutos de arco.
El centro aproxima la posición de Barnard en 2025 a partir de la posición y el movimiento
propio de `backend/targets.yaml`; no se usan sus coordenadas J2000 sin propagar.

`manifest.json` conserva las URL originales, identificadores de observación, consulta,
tiempos de archivo y SHA-256 de cada descarga. El catálogo verifica el SHA-256 antes
de decodificar un FITS local. Las fechas están separadas unas 6,6 horas: son suficientes
para enseñar la secuencia, pero no acreditan movimiento propio visible de Barnard.

## Uso y reproducción

El frontend consulta `/api/v1/images/onboarding` y después utiliza las rutas normales
de metadatos, píxeles, procesamiento y proyección. Solo se ofrecen estas dos observaciones
D3 y esta geometría; otro detector, año o región devuelve una lista vacía. No se sustituye
el archivo ausente por una simulación ni por una consulta remota. La descarga directa
está disponible en `/api/v1/images/onboarding/{id}/fits`.

Para preparar nuevamente los archivos, ejecutar manualmente `python scripts/download_onboarding.py`
desde `backend/`, con su entorno virtual activado. El script reutiliza los FITS existentes;
si falta alguno, descarga ese recorte de IRSA. Requiere Requests y Astropy, ya presentes
en las dependencias del backend. No inicia la aplicación ni un servidor.
