import '@testing-library/jest-dom/vitest'

type StorageKey = 'localStorage' | 'sessionStorage'
type JsdomGlobal = { jsdom?: { window?: Partial<Record<StorageKey, Storage>> } }

/**
 * Node 25+ ships its own `localStorage`/`sessionStorage` globals (`undefined` unless
 * `--localstorage-file` is set, or Node's in-memory Storage), and vitest's jsdom
 * environment leaves an existing global alone. Suites that touch storage would then
 * only pass on the Node 22 CI runtime. Point both globals at jsdom's Storage, which is
 * exactly what they resolve to under Node 22, so results match across Node versions.
 */
function adoptJsdomStorage(key: StorageKey) {
  const storage = (globalThis as JsdomGlobal).jsdom?.window?.[key]
  if (!storage) return
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key)
  if (descriptor && !descriptor.configurable) return
  // Keep vitest's accessor shape: tests may still assign a stub over the global.
  let override: Storage | undefined
  Object.defineProperty(globalThis, key, {
    configurable: true,
    enumerable: true,
    get: () => override ?? storage,
    set: (value: Storage | undefined) => {
      override = value
    },
  })
}

adoptJsdomStorage('localStorage')
adoptJsdomStorage('sessionStorage')
