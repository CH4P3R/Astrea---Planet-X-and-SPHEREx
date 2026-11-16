export const welcomeStorageKey = 'astrea.welcome.v1'

export function shouldShowWelcome(storage) {
  try { return storage?.getItem(welcomeStorageKey) !== 'seen' } catch { return true }
}

export function saveWelcomeStatus(storage) {
  try { storage.setItem(welcomeStorageKey, 'seen'); return true } catch { return false }
}

export const welcomeAssets = {
  logo: new URL('../../assets/astrea-logo.svg', import.meta.url).href,
  icon: `${import.meta.env?.BASE_URL ?? '/'}astrea-icono.svg`,
}
