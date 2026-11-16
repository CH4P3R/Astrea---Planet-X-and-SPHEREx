import HelpButton from './HelpButton.jsx'

export default function MetadataList({ rows }) {
  return <dl className="metadata-list">
    {rows.map(({ id, label, value, help }) => <div className="metadata-row" key={id}>
      <dt><span>{label}</span>{help && <HelpButton label={label} message={help} />}</dt>
      <dd>{value ?? '—'}</dd>
    </div>)}
  </dl>
}
