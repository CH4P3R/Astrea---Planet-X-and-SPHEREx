import { Html } from '@react-three/drei'
import astreaLogo from '../../assets/astrea-logo.svg'
import { SKY } from '../../config/sky.js'
import useTranslation from '../../i18n/useTranslation.js'

export default function ImageLoadingMarker({ direction, status }) {
  const { t } = useTranslation()
  if (!direction) return null
  const busy = status === 'searching' || status === 'loading'

  return (
    <Html center position={direction.map((value) => value * SKY.radius)}
      zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
      <div className="image-loading-marker" data-active={busy} aria-hidden={!busy}>
        <div className="image-loading-marker__logo" aria-hidden="true"
          style={{ '--astrea-logo-mask': `url("${astreaLogo}")` }} />
        <span role="status" aria-live="polite" aria-atomic="true">
          {busy ? t(status === 'searching' ? 'search.notices.searching' : 'search.notices.loading') : ''}
        </span>
      </div>
    </Html>
  )
}
