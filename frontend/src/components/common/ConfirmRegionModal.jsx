import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import useTranslation from '../../i18n/useTranslation.js'

export default function ConfirmRegionModal({ onConfirm, onCancel }) {
  const { t } = useTranslation()
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    dialog.showModal()
    cancelRef.current.focus()
    return () => {
      dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [])

  return createPortal(
    <dialog ref={dialogRef} className="confirm-region-modal" aria-labelledby={descriptionId}
      onCancel={(event) => { event.preventDefault(); onCancel() }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const bounds = event.currentTarget.getBoundingClientRect()
        if (event.clientX < bounds.left || event.clientX > bounds.right
          || event.clientY < bounds.top || event.clientY > bounds.bottom) onCancel()
      }}>
      <p id={descriptionId}>{t('search.confirmRegion.description')}</p>
      <div className="confirm-region-modal__actions" onKeyDown={(event) => {
        if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const target = event.key === 'Home' ? cancelRef.current
          : event.key === 'End' ? confirmRef.current
            : document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
        target.focus()
      }}>
        <button ref={cancelRef} type="button" onClick={onCancel}>{t('search.confirmRegion.cancel')}</button>
        <button ref={confirmRef} type="button" className="confirm-region-modal__confirm" onClick={onConfirm}>
          {t('search.confirmRegion.confirm')}
        </button>
      </div>
    </dialog>, document.body,
  )
}
