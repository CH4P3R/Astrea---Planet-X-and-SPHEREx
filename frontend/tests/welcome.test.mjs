import test from 'node:test'
import assert from 'node:assert/strict'
import { saveWelcomeStatus, shouldShowWelcome, welcomeStorageKey, welcomeAssets } from '../src/components/onboarding/welcomeState.js'

test('welcome appears once independently of tutorial completion', () => {
  const values = new Map([['astrea.onboarding.v1', 'skipped']])
  const storage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) }
  assert.equal(shouldShowWelcome(storage), true)
  assert.equal(saveWelcomeStatus(storage), true)
  assert.equal(values.get(welcomeStorageKey), 'seen')
  assert.equal(shouldShowWelcome(storage), false)
  assert.equal(values.get('astrea.onboarding.v1'), 'skipped')
})

test('welcome tolerates missing or blocked storage', () => {
  const blocked = { getItem() { throw new Error('blocked') }, setItem() { throw new Error('blocked') } }
  for (const storage of [undefined, blocked]) {
    assert.equal(shouldShowWelcome(storage), true)
    assert.equal(saveWelcomeStatus(storage), false)
  }
})

test('welcome uses the shared logo from assets', () => {
  assert.equal(welcomeAssets.logo, new URL('../src/assets/astrea-logo.svg', import.meta.url).href)
  assert.equal(welcomeAssets.icon, '/astrea-icono.svg')
})
