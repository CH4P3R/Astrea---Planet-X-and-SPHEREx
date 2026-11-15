import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useSelectPosition from '../../hooks/useSelectPosition.js'
import useTranslation from '../../i18n/useTranslation.js'

export default function Select({ id, name, label, ariaLabel, value, onChange, options, icon,
  placeholder, disabled = false, placement = 'auto', avoidSelector, boundaryRef, className = '' }) {
  const { t, language } = useTranslation()
  const generatedId = useId()
  const selectId = id ?? generatedId
  const listId = `${selectId}-list`
  const anchorRef = useRef(null)
  const listRef = useRef(null)
  const typeahead = useRef({ text: '', time: 0 })
  const [open, setOpen] = useState(false)
  const [activeValue, setActiveValue] = useState(value)
  if (disabled && open) setOpen(false)
  const selected = options.find((option) => option.value === value)
  const enabled = options.filter((option) => !option.disabled)
  const active = enabled.find((option) => option.value === activeValue) ?? enabled[0]
  const activeIndex = options.indexOf(active)

  useSelectPosition(anchorRef, listRef, open, { placement, avoidSelector, boundaryRef, options })

  useEffect(() => {
    if (!open) return
    function outside(event) {
      if (!anchorRef.current?.contains(event.target) && !listRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside, true)
    document.addEventListener('focusin', outside)
    return () => {
      document.removeEventListener('pointerdown', outside, true)
      document.removeEventListener('focusin', outside)
    }
  }, [open])

  useLayoutEffect(() => {
    if (open && activeIndex >= 0) {
      listRef.current?.querySelector(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' })
    }
  }, [open, activeIndex])

  function show(last = false) {
    setActiveValue((selected && !selected.disabled ? selected : last ? enabled.at(-1) : enabled[0])?.value)
    typeahead.current = { text: '', time: 0 }
    setOpen(true)
  }

  function choose(option) {
    if (!option || option.disabled || disabled) return
    onChange(option.value)
    setOpen(false)
    anchorRef.current?.focus({ preventScroll: true })
  }

  function onKeyDown(event) {
    if (event.key === 'Tab') { setOpen(false); return }
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      if (!open) show(event.key === 'ArrowUp' || event.key === 'End')
      if (event.key === 'Home' || event.key === 'End') {
        setActiveValue((event.key === 'Home' ? enabled[0] : enabled.at(-1))?.value)
      } else if (open && enabled.length) {
        const index = enabled.indexOf(active)
        const step = event.key === 'ArrowDown' ? 1 : -1
        setActiveValue(enabled[(index + step + enabled.length) % enabled.length].value)
      }
      return
    }
    if (event.key === 'Enter' || (event.key === ' ' && (!typeahead.current.text || Date.now() - typeahead.current.time >= 700))) {
      event.preventDefault()
      if (open) choose(active)
      else show()
      return
    }
    if (event.key.length !== 1) return
    event.preventDefault()
    const now = Date.now()
    const text = (now - typeahead.current.time < 700 ? typeahead.current.text : '') + event.key
    typeahead.current = { text, time: now }
    const query = [...text].every((character) => character === text[0]) ? text[0] : text
    const normalize = (text) => text.toLocaleLowerCase(language).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const start = query.length === 1 ? enabled.indexOf(active) + 1 : 0
    const ordered = [...enabled.slice(start), ...enabled.slice(0, start)]
    const match = ordered.find((option) => normalize(option.label).startsWith(normalize(query)))
    if (match) setActiveValue(match.value)
    setOpen(true)
  }

  return <div className={`custom-select ${className}`}>
    {name && <select className="select-native" name={name} value={value ?? ''} disabled={disabled}
      tabIndex={-1} aria-hidden="true" onChange={(event) => onChange(event.target.value)}>
      <option value="" />
      {options.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>}
    <button ref={anchorRef} id={selectId} type="button" role="combobox" className="select-trigger"
      disabled={disabled} aria-label={ariaLabel ?? label} aria-expanded={open} aria-haspopup="listbox"
      aria-controls={listId} aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      onKeyDown={onKeyDown} onClick={() => open ? setOpen(false) : show()}>
      {icon && <span className="select-icon" aria-hidden="true">{icon}</span>}
      <span className="select-value" lang={selected?.lang}>{selected?.shortLabel ?? selected?.label ?? placeholder ?? t('common.select.placeholder')}</span>
      <svg className="select-chevron" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="m7 10 5 5 5-5z" />
      </svg>
    </button>
    {createPortal(<div ref={listRef} id={listId} role="listbox" aria-label={label}
      className="select-list" data-open={open} aria-hidden={!open} inert={!open}
      onMouseDown={(event) => event.preventDefault()}>
      {options.length ? options.map((option, index) => <div key={option.value} id={`${listId}-${index}`}
        role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
        lang={option.lang} className="select-option" data-index={index} data-active={active?.value === option.value}
        onPointerMove={() => { if (!option.disabled) setActiveValue(option.value) }}
        onClick={() => choose(option)}>
        <span>{option.label}</span>
        <svg className="select-check" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="m9 16.17-4.17-4.17L3.41 13.41 9 19l12-12-1.41-1.41z" />
        </svg>
      </div>) : <div className="select-empty" role="option" aria-disabled="true" aria-selected="false">{t('common.select.empty')}</div>}
    </div>, document.body)}
  </div>
}
