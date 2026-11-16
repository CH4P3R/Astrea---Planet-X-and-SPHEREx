import { useId, useRef } from 'react'
import Modal from '../common/Modal.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { welcomeAssets } from './welcomeState.js'

export default function WelcomeModal({ onTutorial, onExplore, loading = false, overlay, closing = false, onExited }) {
  const { t } = useTranslation()
  const titleId = useId()
  const descriptionId = useId()
  const titleRef = useRef(null)
  return <Modal size="medium" className="welcome-modal" labelledBy={titleId} describedBy={descriptionId}
    blocked={loading || closing} overlay={overlay} closing={closing} onExited={onExited}
    initialFocusRef={titleRef} onClose={onExplore} dismissOnBackdrop={false}
    header={<div className="welcome-brand">
      <img className="welcome-logo" src={welcomeAssets.logo} alt="Astrea" width="1186" height="583" />
    </div>}
    footer={<div className="welcome-actions">
      <button type="button" className="welcome-primary" onClick={onTutorial}>{t('onboarding.intro.tutorial')}</button>
      <button type="button" onClick={onExplore}>{t('onboarding.intro.explore')}</button>
    </div>}>
    <h1 id={titleId} ref={titleRef} tabIndex={-1}>{t('onboarding.intro.title')}</h1>
    <p id={descriptionId} className="welcome-summary">{t('onboarding.intro.summary')}</p>
    <section className="welcome-details" aria-label={t('onboarding.intro.possibilities')}>
      <h2>{t('onboarding.intro.possibilities')}</h2>
      <ul>
        <li>{t('onboarding.intro.sky')}</li>
        <li>{t('onboarding.intro.images')}</li>
        <li>{t('onboarding.intro.compare')}</li>
      </ul>
    </section>
    <p className="welcome-note">{t('onboarding.intro.note')}</p>
  </Modal>
}
