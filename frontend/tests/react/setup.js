import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserver
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(Date.now()), 0)
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id)

afterEach(() => {
  cleanup()
  try { window.history.replaceState({}, '', '/') } catch { /* a test may still have a throwing spy installed */ }
})
