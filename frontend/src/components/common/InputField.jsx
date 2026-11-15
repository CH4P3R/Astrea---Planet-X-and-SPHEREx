import { useId } from 'react'
import HelpButton from './HelpButton.jsx'

export default function InputField({ label, help, id, ...inputProps }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  const helpId = `${inputId}-help`
  return <div className="input-field">
    <label htmlFor={inputId}>{label}</label>
    <div className="input-field-control">
      <input {...inputProps} id={inputId}
        aria-describedby={[inputProps['aria-describedby'], helpId].filter(Boolean).join(' ')} />
      <HelpButton id={helpId} label={label} message={help} />
    </div>
  </div>
}
