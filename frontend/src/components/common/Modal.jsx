import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

export default function Modal({ children, header, footer, size = 'small', className = '', labelledBy,
  describedBy, onClose, initialFocusRef, dismissOnBackdrop = true, overlay, blocked = false,
  closing = false, onExited }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  const exitRef = useRef(onExited)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => { exitRef.current = onExited }, [onExited])

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog.showModal()
    return () => {
      dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  useEffect(() => {
    if (blocked) dialogRef.current?.focus({ preventScroll: true })
    else initialFocusRef?.current?.focus({ preventScroll: true })
  }, [blocked, initialFocusRef])

  useEffect(() => {
    if (!closing) return
    const duration = window.getComputedStyle(dialogRef.current).animationDuration
    const milliseconds = Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000)
    const timer = window.setTimeout(() => exitRef.current?.(), milliseconds > 0 ? milliseconds + 50 : 0)
    return () => window.clearTimeout(timer)
  }, [closing])

  return createPortal(<dialog ref={dialogRef} className={`modal ${className}`} data-size={size}
    data-closing={closing || undefined}
    onAnimationEnd={(event) => {
      if (closing && event.target === event.currentTarget
        && event.animationName.endsWith('-exit')) exitRef.current?.()
    }}
    aria-labelledby={labelledBy} aria-describedby={describedBy}
    onCancel={(event) => { event.preventDefault(); if (!blocked) closeRef.current?.() }}
    onClick={(event) => {
      if (blocked || !dismissOnBackdrop || event.target !== event.currentTarget) return
      const bounds = event.currentTarget.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right
        || event.clientY < bounds.top || event.clientY > bounds.bottom) closeRef.current?.()
    }}>
    {header && <header className="modal__header" inert={blocked} aria-hidden={blocked || undefined}>{header}</header>}
    <div className="modal__content" inert={blocked} aria-hidden={blocked || undefined}>{children}</div>
    {footer && <footer className="modal__footer" inert={blocked} aria-hidden={blocked || undefined}>{footer}</footer>}
    {overlay}
  </dialog>, document.body)
}
