import Select from '../common/Select.jsx'
import GlobalLine from '../common/GlobalLine.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { languages } from '../../i18n/resources.js'
import { useId } from 'react'
import Question2Fill from '../common/Question2Fill.jsx'
import Tooltip from '../common/Tooltip.jsx'

export default function LanguageSelect({ onStartTour }) {
  const { t, language, setLanguage } = useTranslation()
  const id = useId()
  const current = languages.find((option) => option.value === language)
  return <div className="language-region" data-image-obstacle>
    {onStartTour && <Tooltip message={t('onboarding.restart')} inline>
      <button type="button" className="tour-launcher" data-tour-launcher aria-label={t('onboarding.restart')} onClick={onStartTour}>
        <Question2Fill />
      </button>
    </Tooltip>}
    <Select id={id} className="language-select" label={t('common.language.label')}
      ariaLabel={t('common.language.current', { language: current.label })}
      value={language} onChange={setLanguage} options={languages} icon={<GlobalLine />}
      avoidSelector="[data-select-obstacle]" />
  </div>
}
