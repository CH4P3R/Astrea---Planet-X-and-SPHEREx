import { useId, useRef } from 'react'
import Modal from './Modal.jsx'
import useTranslation from '../../i18n/useTranslation.js'

export default function ConfirmRegionModal({ onConfirm, onCancel }) {
  const { t } = useTranslation()
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  const descriptionId = useId()

  return <Modal className="confirm-region-modal" labelledBy={descriptionId}
    onClose={onCancel} initialFocusRef={cancelRef}
    footer={<div className="confirm-region-modal__actions" onKeyDown={(event) => {
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
      </div>}>
    <p id={descriptionId}>{t('search.confirmRegion.description')}</p>
  </Modal>
}
