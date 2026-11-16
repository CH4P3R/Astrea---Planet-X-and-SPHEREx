import test from 'node:test'
import assert from 'node:assert/strict'
import { createTranslator, initialLanguage, languageStorageKey, resolveLanguage } from '../src/i18n/core.js'
import { languages, resources } from '../src/i18n/resources.js'
import { apiError, errorMessage, LocalizedError } from '../src/i18n/messages.js'
import { apiMessages } from '../src/i18n/apiMessages.js'

function entries(catalog, prefix = '') {
  return Object.entries(catalog).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === 'string' ? [[path, value]] : entries(value, path)
  })
}

test('all languages have matching keys and interpolation parameters', () => {
  const reference = entries(resources.es)
  for (const { value: language } of languages) {
    const catalog = new Map(entries(resources[language]))
    assert.deepEqual([...catalog.keys()].sort(), reference.map(([key]) => key).sort())
    for (const [key, value] of reference) {
      assert.ok(catalog.get(key).trim(), `${language}: ${key}`)
      assert.deepEqual([...catalog.get(key).matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort(),
        [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort(), `${language}: ${key}`)
    }
  }
})

test('English is the default and saved language preferences are preserved', () => {
  assert.equal(initialLanguage({ getItem: (key) => key === languageStorageKey ? 'es' : null }), 'es')
  assert.equal(initialLanguage({ getItem: () => 'es-MX' }), 'es')
  assert.equal(initialLanguage({ getItem: () => 'unknown' }), 'en')
  assert.equal(initialLanguage({ getItem: () => null }), 'en')
  assert.equal(initialLanguage({ getItem: () => { throw new Error('blocked') } }), 'en')
  assert.equal(initialLanguage(null), 'en')
  assert.equal(resolveLanguage('EN_us'), 'en')
  assert.equal(resolveLanguage('unknown'), undefined)
})

test('plural selection and numeric interpolation use the active language', () => {
  const es = createTranslator('es')
  const en = createTranslator('en')
  assert.equal(es('search.notices.found', { count: 1 }), '1 imagen encontrada en IRSA')
  assert.equal(en('search.notices.found', { count: 1 }), '1 image found in IRSA')
  assert.equal(en('search.notices.found', { count: 0 }), '0 images found in IRSA')
  assert.equal(en('search.notices.foundMore', { count: 20 }), 'More than 20 images found in IRSA')
  assert.equal(es('sky.status.ready', { count: 12000 }), '12.000 estrellas · Hipparcos')
  assert.equal(en('sky.status.ready', { count: 12000 }), '12,000 stars · Hipparcos')
  assert.equal(es('sky.directions.west.short'), 'O')
  assert.equal(en('sky.directions.west.short'), 'W')
})

test('share actions and recoverable warnings are localized', () => {
  const en = createTranslator('en')
  const es = createTranslator('es')
  assert.equal(en('share.actions.copy'), 'Copy link')
  assert.equal(es('share.actions.copy'), 'Copiar enlace')
  assert.equal(en('share.notices.invalid'), 'This shared link has invalid search settings. Correct the coordinates or clear the search.')
  assert.equal(es('share.notices.invalid'), 'Este enlace compartido tiene ajustes de búsqueda no válidos. Corrige las coordenadas o limpia la búsqueda.')
  assert.equal(en('share.notices.history'), 'The address bar could not be updated, but the search still works.')
  assert.equal(es('share.notices.history'), 'No se pudo actualizar la barra de direcciones, pero la búsqueda sigue funcionando.')
})

test('pending notices and nested errors can be translated again without changing state', () => {
  const error = { key: 'errors.image.projection', values: { reason: errorMessage(new LocalizedError('errors.image.gpuLimit', {
    width: 8192, height: 1024, maxTextureSize: 4096,
  })) } }
  assert.match(createTranslator('es')(error), /^No se pudo actualizar la proyección:/)
  assert.match(createTranslator('en')(error), /^Could not update the projection:/)
  assert.match(createTranslator('en')(error), /8,192 × 1,024/)
  assert.equal(error.values.reason.key, 'errors.image.gpuLimit')
})

test('missing translations fall back by key and values remain plain text', () => {
  const t = createTranslator('es', { es: {}, en: { section: { label: 'Hello {{name}}', count: { one: 'One', other: 'Several' } } } })
  assert.equal(t('section.label', { name: '<b>Astrea</b>' }), 'Hello <b>Astrea</b>')
  assert.equal(t('section.count', { count: 2 }), 'Several')
  assert.equal(t('unknown.key'), 'unknown.key')
  assert.equal(t(null), '')
})

test('known API failures keep their cause and have translated messages in both languages', () => {
  for (const [detail, key] of apiMessages) {
    const error = apiError(422, detail)
    assert.equal(error.detail, detail)
    for (const { value } of languages) assert.notEqual(createTranslator(value)(errorMessage(error)), key)
  }
  const unknown = errorMessage(apiError(500, 'Untranslated upstream diagnostic'))
  assert.equal(createTranslator('en')(unknown), 'API error (500). Please try again.')
  assert.equal(errorMessage(new TypeError('Failed to fetch')).key, 'errors.network')
})
