import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import I18nProvider from '../../src/i18n/I18nProvider.jsx'
import DownloadComparison from '../../src/export/DownloadComparison.jsx'
import { createComparisonGif, downloadGif } from '../../src/export/comparisonGif.js'

vi.mock('../../src/export/comparisonGif.js', () => ({ createComparisonGif: vi.fn(), downloadGif: vi.fn() }))

const props = { images: [], appearance: { pixels: [], settings: {} }, interval: 0.7, disabled: false }
const view = (options = props) => <I18nProvider><DownloadComparison {...options} /></I18nProvider>
const button = () => screen.getByRole('button', { name: 'Download comparison GIF (up to 20 observations)' })

beforeEach(() => {
  window.localStorage.clear()
  vi.resetAllMocks()
})

it('downloads the encoded GIF and prevents repeated clicks while encoding', async () => {
  let resolve
  createComparisonGif.mockReturnValue(new Promise((done) => { resolve = done }))
  render(view())
  expect(button().querySelector('svg')).toBeTruthy()
  fireEvent.click(button())
  expect(button().disabled).toBe(true)
  fireEvent.click(button())
  expect(createComparisonGif).toHaveBeenCalledTimes(1)
  const blob = new Blob(['gif'], { type: 'image/gif' })
  await act(async () => resolve(blob))
  expect(downloadGif).toHaveBeenCalledWith(blob)
  expect(screen.getByRole('status').textContent).toBe('GIF download started')
})

it('disables export when comparison is not ready', () => {
  render(view({ ...props, disabled: true }))
  expect(button().disabled).toBe(true)
  fireEvent.click(button())
  expect(createComparisonGif).not.toHaveBeenCalled()
})

it('reports encoding failures without downloading', async () => {
  createComparisonGif.mockRejectedValue(new Error('failed'))
  render(view())
  fireEvent.click(button())
  await act(async () => {})
  expect(screen.getByRole('alert').textContent).toBe('Could not create the GIF. Try again.')
  expect(downloadGif).not.toHaveBeenCalled()
})

it('cancels stale exports when observations change', async () => {
  let resolve
  createComparisonGif.mockReturnValue(new Promise((done) => { resolve = done }))
  const { rerender } = render(view())
  fireEvent.click(button())
  const signal = createComparisonGif.mock.calls[0][4]
  rerender(view({ ...props, images: [{}] }))
  expect(signal.aborted).toBe(true)
  await act(async () => resolve(new Blob()))
  expect(downloadGif).not.toHaveBeenCalled()
})
