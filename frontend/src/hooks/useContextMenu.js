import { useCallback, useEffect, useRef, useState } from 'react'

export default function useContextMenu({ persistentIds = [], openDelay = 350, closeDelay = 2000 } = {}) {
  const [active, setActive] = useState(null)
  const persistent = persistentIds.includes(active)
  const [hint, setHint] = useState(null)
  const opening = useRef(null)
  const closing = useRef(null)

  useEffect(() => () => {
    window.clearTimeout(opening.current)
    window.clearTimeout(closing.current)
  }, [])

  useEffect(() => {
    if (persistent) window.clearTimeout(closing.current)
  }, [persistent])

  const keepOpen = useCallback(() => {
    window.clearTimeout(closing.current)
  }, [])

  const cancelPreview = useCallback(() => {
    window.clearTimeout(opening.current)
    setHint(null)
  }, [])

  function preview(id) {
    keepOpen()
    cancelPreview()
    setHint(id)
    if (!persistent) opening.current = window.setTimeout(() => setActive(id), openDelay)
  }

  const open = useCallback((id) => {
    cancelPreview()
    keepOpen()
    setActive(id)
  }, [cancelPreview, keepOpen])

  function leave() {
    cancelPreview()
    keepOpen()
    if (!persistent) closing.current = window.setTimeout(() => setActive(null), closeDelay)
  }

  return { active, hint, keepOpen, cancelPreview, preview, open, leave }
}
