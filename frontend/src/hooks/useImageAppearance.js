import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_APPEARANCE, DEFAULT_PROCESSING } from '../config/appearance.js'
import { loadPixels } from '../services/images.js'
import { decodePixels, displayRange, normalizePixels } from '../three/core/imageDataUtils.js'
import { errorMessage } from '../i18n/messages.js'

export default function useImageAppearance(primary, secondary) {
  const [settings, setSettings] = useState(DEFAULT_APPEARANCE)
  const [processing, setProcessing] = useState(DEFAULT_PROCESSING)
  const [result, setResult] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const sources = useMemo(() => [primary, secondary].filter(Boolean), [primary, secondary])
  const enabled = Object.values(processing).some(Boolean)
  const key = JSON.stringify([sources.map((image) => image.metadata.id), processing, attempt])
  if (result && result.key !== key) setResult(null)
  const matches = result?.key === key
  const ready = !enabled || (matches && result.status === 'ready')
  const error = enabled && matches ? result.error : ''

  useEffect(() => {
    if (!enabled || !sources.length) return
    const job = new AbortController()
    async function apply() {
      try {
        const pixels = await Promise.all(sources.map(async (image) => {
          const buffer = await loadPixels(image.metadata.id, job.signal, processing)
          return decodePixels(buffer, image.metadata.image).raw
        }))
        if (!job.signal.aborted) setResult({ key, status: 'ready', pixels, error: '' })
      } catch (failure) {
        if (!job.signal.aborted) {
          job.abort()
          setResult({ key, status: 'error', pixels: null, error: errorMessage(failure) })
        }
      }
    }
    apply()
    return () => job.abort()
  }, [sources, processing, enabled, key, attempt])

  const applied = enabled && ready ? result.pixels : null
  const display = useMemo(() => {
    const arrays = applied ?? sources.map((image) => image.pixels.raw)
    const range = displayRange(arrays)
    return { pixels: arrays.map((raw) => normalizePixels(raw, range)), hasData: arrays.every((raw) => raw.some(Number.isFinite)) }
  }, [sources, applied])
  const change = useCallback((name, value) => setSettings((previous) => ({ ...previous, [name]: value })), [])
  const process = useCallback((name, value) => setProcessing((previous) => ({ ...previous, [name]: value })), [])
  const restore = useCallback(() => setSettings(DEFAULT_APPEARANCE), [])
  const retry = useCallback(() => setAttempt((value) => value + 1), [])
  return { settings, processing, change, process, restore, retry, ...display, ready, error,
    loading: enabled && !ready && !error, appliedProcessing: enabled && ready ? processing : DEFAULT_PROCESSING }
}
