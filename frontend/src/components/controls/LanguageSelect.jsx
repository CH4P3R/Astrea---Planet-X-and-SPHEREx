import Select from '../common/Select.jsx'
import GlobalLine from '../common/GlobalLine.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { languages } from '../../i18n/resources.js'

export default function LanguageSelect() {
  const { t, language, setLanguage } = useTranslation()
  const current = languages.find((option) => option.value === language)
  return <div className="language-region">
    <Select id="language-select" className="language-select" label={t('common.language.label')}
      ariaLabel={t('common.language.current', { language: current.label })}
      value={language} onChange={setLanguage} options={languages} icon={<GlobalLine />}
      avoidSelector="[data-select-obstacle]" />
  </div>
}
