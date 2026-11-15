import { fallbackLanguage, languages, resources } from './resources.js'

export const languageStorageKey = 'astrea.language'

export function resolveLanguage(value) {
  const code = String(value ?? '').toLowerCase().replaceAll('_', '-')
  return languages.find(({ value }) => value === code)?.value
    ?? languages.find(({ value }) => value === code.split('-')[0])?.value
}

export function initialLanguage(storage) {
  try {
    const saved = resolveLanguage(storage?.getItem(languageStorageKey))
    if (saved) return saved
  } catch { /* El almacenamiento puede estar bloqueado */ }
  return fallbackLanguage
}

const lookup = (catalog, key) => key.split('.').reduce((value, part) =>
  value && Object.hasOwn(value, part) ? value[part] : undefined, catalog)

export function createTranslator(language, catalogs = resources) {
  const locale = resolveLanguage(language) ?? fallbackLanguage
  const plurals = new Intl.PluralRules(locale)
  const numbers = new Intl.NumberFormat(locale)
  return function t(message, parameters = {}) {
    if (!message) return ''
    const key = typeof message === 'string' ? message : message.key
    const values = typeof message === 'string' ? parameters : { ...message.values, ...parameters }
    const select = (entry) => typeof entry === 'object' && entry !== null
      ? entry[plurals.select(values.count ?? 0)] ?? entry.other : entry
    const template = select(lookup(catalogs[locale], key)) ?? select(lookup(catalogs[fallbackLanguage], key))
    if (typeof template !== 'string') return key
    return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      const value = values[name]
      if (value == null) return match
      if (typeof value === 'object' && value.key) return t(value)
      return typeof value === 'number' ? numbers.format(value) : String(value)
    })
  }
}
