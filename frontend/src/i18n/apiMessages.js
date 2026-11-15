// Mensajes estables del contrato HTTP mientras la API no emita codigos de error
export const apiMessages = new Map([
  ['The star catalog could not be retrieved. Please retry.', 'errors.server.catalog'],
  ['This time is outside the available Earth-orientation data. Choose a recent date or refresh IERS data.', 'errors.server.earthOrientation'],
  ['Unknown image. Run an image search first.', 'errors.server.unknownImage'],
  ['Too many archive matches. Narrow start_time/end_time and retry.', 'errors.server.searchTooBroad'],
  ['IRSA timed out. Please retry.', 'errors.server.archiveTimeout'],
  ['IRSA data could not be retrieved. Please retry.', 'errors.server.archive'],
  ['IRSA returned an unsupported or invalid FITS image.', 'errors.server.invalidFits'],
  ["This image's WCS cannot be projected accurately. Try a smaller size.", 'errors.server.mesh'],
  ['The local image cache is unavailable.', 'errors.server.cache'],
  ['The star catalog changed. Reload its metadata and retry.', 'errors.server.catalogChanged'],
  ['No catalog stars match this magnitude limit.', 'errors.server.noStars'],
])
