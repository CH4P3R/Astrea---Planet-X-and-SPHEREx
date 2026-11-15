import { useContext } from 'react'
import { I18nContext } from './context.js'

export default function useTranslation() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useTranslation requires I18nProvider')
  return context
}
