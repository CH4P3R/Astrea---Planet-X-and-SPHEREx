import { useId, useState } from 'react'
import Select from '../common/Select.jsx'
import useTranslation from '../../i18n/useTranslation.js'
import { comparisonYears } from '../../config/comparison.js'

export default function ComparisonDateSelector({ value, onChange, disabled }) {
  const { t } = useTranslation()
  const id = useId()
  const [currentYear] = useState(() => new Date().getUTCFullYear())
  const options = comparisonYears(currentYear).map((year) => ({ value: String(year), label: String(year) }))
  return <div className="comparison-year">
    <label htmlFor={id}>{t('inspector.compare.year')}</label>
    <Select id={id} label={t('inspector.compare.year')} value={String(value)}
      options={options} disabled={disabled} onChange={(selected) => onChange(Number(selected))} />
  </div>
}
