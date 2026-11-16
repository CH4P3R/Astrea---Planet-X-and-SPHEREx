import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useTranslation from '../../i18n/useTranslation.js'
import { tourOptions, tourPosition, tourSteps } from './tourState.js'

export default function OnboardingTour({ index, scopeRef, onChange, onFinish, imageReady, loading, error, onLoad }) {
  const { t } = useTranslation()
  const rootRef = useRef(null)
  const cardRef = useRef(null)
  const titleRef = useRef(null)
  const [geometry, setGeometry] = useState(null)
  const step = tourSteps[index]

  useLayoutEffect(() => {
    const highlightedTab = scopeRef.current?.querySelector('[role="tab"][data-highlighted="true"]')
    if (document.activeElement !== highlightedTab) titleRef.current?.focus({ preventScroll: !tourOptions.scrollTo })
    let animation
    const measure = () => {
      const view = window.visualViewport
      const viewport = { width: view?.width ?? window.innerWidth, height: view?.height ?? window.innerHeight }
      const offset = { left: view?.offsetLeft ?? 0, top: view?.offsetTop ?? 0 }
      const bounds = scopeRef.current?.querySelector(step.target)?.getBoundingClientRect()
      const target = bounds && bounds.width > 0 && bounds.height > 0 ? {
        left: Math.max(8, bounds.left - offset.left - 6), top: Math.max(8, bounds.top - offset.top - 6),
        right: Math.min(viewport.width - 8, bounds.right - offset.left + 6),
        bottom: Math.min(viewport.height - 8, bounds.bottom - offset.top + 6),
      } : null
      const visible = target && target.right > target.left && target.bottom > target.top ? target : null
      const card = cardRef.current.getBoundingClientRect()
      const next = { ...tourPosition(visible, card, viewport), target: visible, offset, viewport }
      setGeometry((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      animation = window.requestAnimationFrame(measure)
    }
    animation = window.requestAnimationFrame(measure)
    return () => window.cancelAnimationFrame(animation)
  }, [step, scopeRef])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (document.querySelector('.select-list[data-open="true"]')) return
        event.preventDefault()
        event.stopPropagation()
        onFinish('skipped')
      }
      if (event.key !== 'Tab') return
      const anchor = scopeRef.current?.querySelector(step.target)
      const selector = 'button, select, input, a[href], [tabindex="0"]'
      const controls = [...(anchor?.querySelectorAll(selector) ?? []), ...rootRef.current.querySelectorAll(selector)]
        .filter((element) => !element.matches(':disabled') && element.tabIndex >= 0
          && !element.closest('[inert], [hidden]') && element.getClientRects().length)
      const first = controls[0]
      const last = controls.at(-1)
      const outside = !controls.includes(document.activeElement)
      if (event.shiftKey && (outside || document.activeElement === first || document.activeElement === titleRef.current)) {
        event.preventDefault(); last?.focus({ preventScroll: true })
      } else if (!event.shiftKey && (outside || document.activeElement === last)) {
        event.preventDefault(); first?.focus({ preventScroll: true })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onFinish, scopeRef, step])

  const target = geometry?.target
  const blockers = target ? [
    { left: 0, top: 0, width: '100%', height: target.top },
    { left: 0, top: target.bottom, width: '100%', bottom: 0 },
    { left: 0, top: target.top, width: target.left, height: target.bottom - target.top },
    { left: target.right, right: 0, top: target.top, height: target.bottom - target.top },
  ] : [{ inset: 0 }]
  return createPortal(<div ref={rootRef} className="onboarding-tour" role="dialog" data-inspector-step={Boolean(step.tab)}
    data-ready={Boolean(geometry)}
    aria-labelledby="tour-heading" aria-describedby="tour-description" style={geometry ? {
      left: geometry.offset.left, top: geometry.offset.top, width: geometry.viewport.width, height: geometry.viewport.height,
    } : undefined}>
    {blockers.map((style, key) => <div key={key} className="tour-shield" style={style}
      onPointerDown={(event) => event.preventDefault()} />)}
    <div className={`tour-spotlight${target ? '' : ' is-unanchored'}`} style={target ? {
      left: target.left, top: target.top, width: target.right - target.left, height: target.bottom - target.top,
    } : undefined} />
    <section ref={cardRef} className="tour-card" style={geometry ? { left: geometry.left, top: geometry.top } : undefined}>
      <header>
        <span>{t('onboarding.title')} · {t('onboarding.progress', { current: index + 1, total: tourSteps.length })}</span>
        <div className="tour-heading">
          <h2 id="tour-heading" ref={titleRef} tabIndex={-1}>{t(`onboarding.${step.id}.title`)}</h2>
          {step.tab && <span className="tour-location">{t('onboarding.inspector')}</span>}
        </div>
      </header>
      <div className="tour-description">
        <p id="tour-description" className="tour-summary">{t(`onboarding.${step.id}.summary`)}</p>
        <section aria-labelledby="tour-actions-title">
          <h3 id="tour-actions-title" className="tour-actions-title">{t('onboarding.try')}</h3>
          <ol className="tour-actions">
            {Array.from({ length: step.actionCount ?? 2 }, (_, action) => <li key={action}>
              <strong>{t(`onboarding.${step.id}.actions.${action + 1}.title`)}</strong>
              <span>{t(`onboarding.${step.id}.actions.${action + 1}.description`)}</span>
            </li>)}
          </ol>
        </section>
        <p className="tour-note">{t(`onboarding.${step.id}.note`)}</p>
        {step.tab && loading && <p role="status">{t('onboarding.loading')}</p>}
        {step.tab && error && <p role="alert">{t(error)}</p>}
        {step.tab && !imageReady && !loading && <button type="button" onClick={onLoad}>{t('onboarding.load')}</button>}
      </div>
      <footer>
        <button type="button" onClick={() => onFinish('skipped')}>{t('onboarding.skip')}</button>
        <div>
          <button type="button" disabled={index === 0} onClick={() => onChange(index - 1)}>{t('onboarding.previous')}</button>
          <button type="button" className="tour-next" disabled={Boolean(step.tab && !imageReady)} onClick={() => index === tourSteps.length - 1
            ? onFinish('completed') : onChange(index + 1)}>{t(index === tourSteps.length - 1 ? 'onboarding.finish' : 'onboarding.next')}</button>
        </div>
      </footer>
    </section>
  </div>, document.body)
}
