import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

class ResizeObserver { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver ??= ResizeObserver
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
globalThis.requestAnimationFrame ??= (callback) => setTimeout(() => callback(Date.now()), 0)
globalThis.cancelAnimationFrame ??= (id) => clearTimeout(id)

const replaceState = window.history.replaceState.bind(window.history)

afterEach(() => {
  cleanup()
  replaceState({}, '', '/')
})
