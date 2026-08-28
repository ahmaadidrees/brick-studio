import assert from 'node:assert/strict'
import test from 'node:test'

// Kept outside Vitest's *.test.* pattern so the repository and Node runners do not collide.
import {
  DEFAULT_LOAD_TIMEOUT_MS,
  DEFAULT_POSES_PER_CLIENT,
  LIVE_LOAD_CLIENTS,
  isProductionVirtualLegosUrl,
  parseLoadOptions,
} from './live-world-load.mjs'

test('parses a staging target with fixed client count and bounded defaults', () => {
  assert.deepEqual(parseLoadOptions({ LIVE_SERVER_URL: 'https://staging-live.example/' }), {
    serverUrl: 'https://staging-live.example',
    allowProduction: false,
    clients: LIVE_LOAD_CLIENTS,
    posesPerClient: DEFAULT_POSES_PER_CLIENT,
    timeoutMs: DEFAULT_LOAD_TIMEOUT_MS,
  })
})

test('accepts bounded traffic overrides', () => {
  const options = parseLoadOptions({
    LIVE_SERVER_URL: 'http://127.0.0.1:8787',
    LOAD_POSES_PER_CLIENT: '5',
    LOAD_TIMEOUT_MS: '30000',
  })
  assert.equal(options.posesPerClient, 5)
  assert.equal(options.timeoutMs, 30_000)
})

test('rejects missing, malformed, credentialed, and non-origin targets', () => {
  assert.throws(() => parseLoadOptions({}), /LIVE_SERVER_URL is required/)
  assert.throws(() => parseLoadOptions({ LIVE_SERVER_URL: 'not a url' }), /valid absolute URL/)
  assert.throws(() => parseLoadOptions({ LIVE_SERVER_URL: 'ws://localhost:8787' }), /http: or https:/)
  assert.throws(() => parseLoadOptions({ LIVE_SERVER_URL: 'https://name:secret@example.com' }), /must not contain credentials/)
  assert.throws(() => parseLoadOptions({ LIVE_SERVER_URL: 'https://example.com/api' }), /bare origin/)
  assert.throws(() => parseLoadOptions({ LIVE_SERVER_URL: 'https://example.com/?key=value' }), /bare origin/)
})

test('refuses production Virtual Legos targets unless explicitly allowed', () => {
  const production = new URL('https://virtual-legos.vercel.app')
  assert.equal(isProductionVirtualLegosUrl(production), true)
  assert.equal(isProductionVirtualLegosUrl(new URL('https://virtual-legos.vercel.app.')), true)
  assert.equal(isProductionVirtualLegosUrl(new URL('https://brick-studio-multiplayer.account.workers.dev')), true)
  assert.throws(
    () => parseLoadOptions({ LIVE_SERVER_URL: production.href }),
    /Refusing to load-test a production Virtual Legos origin/,
  )
  assert.equal(parseLoadOptions({
    LIVE_SERVER_URL: production.href,
    ALLOW_PRODUCTION_LOAD: '1',
  }).allowProduction, true)
})

test('rejects traffic options outside their safety bounds', () => {
  const base = { LIVE_SERVER_URL: 'https://staging-live.example' }
  assert.throws(() => parseLoadOptions({ ...base, LOAD_POSES_PER_CLIENT: '0' }), /between 1 and 10/)
  assert.throws(() => parseLoadOptions({ ...base, LOAD_POSES_PER_CLIENT: 'many' }), /whole number/)
  assert.throws(() => parseLoadOptions({ ...base, LOAD_TIMEOUT_MS: '999' }), /between 1000 and 60000/)
  assert.throws(() => parseLoadOptions({ ...base, LOAD_TIMEOUT_MS: '60001' }), /between 1000 and 60000/)
})
