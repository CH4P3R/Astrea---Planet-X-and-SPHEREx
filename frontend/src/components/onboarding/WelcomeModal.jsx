import { useId } from 'react'
import Modal from '../common/Modal.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { welcomeAssets } from './welcomeState.js'
import LanguageSelect from '../controls/LanguageSelect.jsx'

export default function WelcomeModal({ onTutorial, onExplore, loading = false, visible = true, closing = false, onExited }) {
  const { t } = useTranslation()
  const titleId = useId()
  const descriptionId = useId()
  const blocked = loading || !visible || closing
  return <Modal size="medium" className={`welcome-modal${visible ? '' : ' welcome-modal--concealed'}`} labelledBy={titleId} describedBy={descriptionId}
    blocked={blocked} closing={closing} onExited={onExited}
    onClose={onExplore} dismissOnBackdrop={false}
    header={<>
      <LanguageSelect className="welcome-language" suspended={blocked} />
      <div className="welcome-brand">
        <img className="welcome-logo" src={welcomeAssets.logo} alt="Astrea" width="1186" height="583" />
      </div>
    </>}
    footer={<div className="welcome-actions">
      <button type="button" className="welcome-primary" onClick={onTutorial}>{t('onboarding.intro.tutorial')}</button>
      <button type="button" onClick={onExplore}>{t('onboarding.intro.explore')}</button>
    </div>}>
    <h1 id={titleId}>{t('onboarding.intro.title')}</h1>
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
