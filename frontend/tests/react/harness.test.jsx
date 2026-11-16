import { useState } from 'react'
import { it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

function Counter() {
  const [count, setCount] = useState(0)

  return <button onClick={() => setCount(count + 1)}>Count: {count}</button>
}

it('updates the DOM after a React interaction', () => {
  render(<Counter />)

  const button = screen.getByRole('button', { name: 'Count: 0' })
  expect(button.textContent).toBe('Count: 0')

  fireEvent.click(button)

  expect(screen.getByRole('button', { name: 'Count: 1' }).textContent).toBe('Count: 1')
})
