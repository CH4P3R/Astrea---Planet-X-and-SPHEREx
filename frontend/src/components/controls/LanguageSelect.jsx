import Select from '../common/Select.jsx'
import GlobalLine from '../common/GlobalLine.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { languages } from '../../i18n/resources.js'
import { useId } from 'react'
import Question2Fill from '../common/Question2Fill.jsx'
import Tooltip from '../common/Tooltip.jsx'
import InfoRounded from '../common/InfoRounded.jsx'

export default function LanguageSelect({ onStartTour, onOpenAbout, suspended = false, className = 'language-region' }) {
  const { t, language, setLanguage } = useTranslation()
  const id = useId()
  const current = languages.find((option) => option.value === language)
  return <div className={`${className}${onOpenAbout ? ' language-region--about' : ''}`} data-image-obstacle>
    {onStartTour && <Tooltip key={suspended ? 'suspended' : 'ready'} message={t('onboarding.restart')}
      inline hoverOnly open={suspended ? false : undefined}>
      <button type="button" className="tour-launcher" data-tour-launcher aria-label={t('onboarding.restart')} onClick={onStartTour}>
        <Question2Fill />
      </button>
    </Tooltip>}
    <Select id={id} className="language-select" label={t('common.language.label')}
      ariaLabel={t('common.language.current', { language: current.label })}
      value={language} onChange={setLanguage} options={languages} icon={<GlobalLine />} disabled={suspended}
       avoidSelector="[data-select-obstacle]" />
    {onOpenAbout && <Tooltip message={t('onboarding.about.title')} inline open={suspended ? false : undefined}>
      <button type="button" className="about-launcher" data-about-launcher aria-label={t('onboarding.about.title')}
        aria-haspopup="dialog" disabled={suspended} onClick={onOpenAbout}>
        <InfoRounded />
        <span>{t('onboarding.about.button')}</span>
      </button>
    </Tooltip>}
  </div>
}
