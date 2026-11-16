import { useCallback, useEffect, useRef, useState } from 'react'
import { buildShareUrl, parseSkyUrl, syncSkyUrl } from './skyUrl.js'

export default function useSkyUrl({ enabled = true, onRestore = () => {} } = {}) {
  const [initial] = useState(() => enabled ? parseSkyUrl(window.location.href) : { status: 'none' })
  const [warning, setWarning] = useState(() => initial.status === 'invalid' ? 'share.notices.invalid' : '')
  const onRestoreRef = useRef(onRestore)

  useEffect(() => { onRestoreRef.current = onRestore }, [onRestore])

  useEffect(() => {
    if (!enabled) return
    const restore = () => {
      const classification = parseSkyUrl(window.location.href)
      setWarning(classification.status === 'invalid' ? 'share.notices.invalid' : '')
      onRestoreRef.current(classification)
    }
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [enabled])

  const sync = useCallback((search) => {
    if (!enabled) return
    const current = window.location.href
    const next = syncSkyUrl(current, search)
    if (next !== current) {
      try {
        window.history.replaceState(window.history.state, '', next)
      } catch {
        setWarning('share.notices.history')
        return
      }
    }
    setWarning('')
  }, [enabled])

  const shareHref = useCallback((search) => {
    if (!enabled || !search) return ''
    return buildShareUrl(window.location.href, search)
  }, [enabled])

  return { initial, initialSearch: initial.search ?? null, warning, sync, shareHref }
}
