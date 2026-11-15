import { useId } from 'react'
import InputField from './InputField.jsx'

export default function RangeField({ label, help, value, displayValue = value, onChange, ...props }) {
  const id = useId()
  return <div className="range-field">
    <InputField {...props} id={id} type="range" label={label} help={help} value={value}
      onChange={(event) => onChange(Number(event.target.value))} />
    <output htmlFor={id}>{displayValue}</output>
  </div>
}
