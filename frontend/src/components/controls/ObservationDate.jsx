import useTranslation from '../../i18n/useTranslation.js'
import { observationTimestamp } from '../../config/comparison.js'

export default function ObservationDate({ value }) {
  const { t, date } = useTranslation()
  const timestamp = observationTimestamp(value)
  if (timestamp === null) return <span>{t('search.results.noDate')}</span>
  return <time dateTime={new Date(timestamp).toISOString()}>{date(timestamp, { dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC' })} · UTC</time>
}
