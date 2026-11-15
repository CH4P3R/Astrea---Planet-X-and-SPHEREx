import { useCallback, useLayoutEffect, useMemo, useState } from 'react'
import { I18nContext } from './context.js'
import { createTranslator, initialLanguage, languageStorageKey, resolveLanguage } from './core.js'

export default function I18nProvider({ children }) {
  const [language, updateLanguage] = useState(() => {
    let storage
    try { storage = window.localStorage } catch { /* Usa el idioma predeterminado */ }
    return initialLanguage(storage)
  })
  const setLanguage = useCallback((value) => {
    const supported = resolveLanguage(value)
    if (supported) updateLanguage(supported)
  }, [])
  const value = useMemo(() => ({
    language, setLanguage,
    t: createTranslator(language),
    number: (value, options) => new Intl.NumberFormat(language, options).format(value),
    date: (value, options) => new Intl.DateTimeFormat(language, options).format(new Date(value)),
  }), [language, setLanguage])

  useLayoutEffect(() => {
    document.documentElement.lang = language
    document.title = value.t('common.appTitle')
    try { window.localStorage.setItem(languageStorageKey, language) } catch { /* Conserva la seleccion en memoria */ }
  }, [language, value])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}
