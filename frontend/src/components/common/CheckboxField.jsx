import '../../styles/components/checkbox-field.css'

export default function CheckboxField({ label, ...inputProps }) {
  return <label className="checkbox-field">
    <input {...inputProps} type="checkbox" />
    <span>{label}</span>
  </label>
}
