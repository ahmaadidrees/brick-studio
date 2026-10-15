/**
 * Where the signed-in account is kept in the browser.
 *
 * Every tab shares one sign-in, and closing the browser signs out. The account is kept in localStorage (shared by
 * tabs) next to a random "browser session" id; the same id is in a cookie with no expiry date, which the browser
 * forgets when it closes. A stored account whose id no longer matches the cookie belongs to a closed browser and is
 * removed. Shared classroom computers that restart or log out between students therefore start signed out.
 *
 * Older builds kept the account in this tab's sessionStorage only; that copy is moved here once.
 */

export interface SessionStore<T> {
  read(): T | null
  write(value: T | null): void
  /** Another tab signed in, renewed the sign-in or signed out. */
  onChange(listener: (value: T | null) => void): () => void
  /** Run a sign-in renewal while no other tab is renewing (each renewal key works once). */
  withRenewLock<R>(task: () => Promise<R>): Promise<R>
}

const STORE_KEY = 'brick-studio.classroom-session.v2'
const LEGACY_TAB_KEY = 'brick-studio.classroom-session.v1'
const COOKIE = 'brick_studio_browser'
const LOCK = 'brick-studio.classroom-session.renew'

interface Stored<T> {
  browser: string
  auth: T
}

function readCookie(name: string): string | null {
  try {
    for (const part of document.cookie.split(';')) {
      const [k, ...v] = part.trim().split('=')
      if (k === name) return decodeURIComponent(v.join('='))
    }
  } catch {
    // No cookies (sandboxed frame): the store falls back to memory only.
  }
  return null
}

function writeCookie(name: string, value: string | null) {
  try {
    const secure = location.protocol === 'https:' ? '; Secure' : ''
    // No Expires or Max-Age: a browser-session cookie.
    document.cookie = value === null ? `${name}=; Path=/; Max-Age=0; SameSite=Strict${secure}` : `${name}=${encodeURIComponent(value)}; Path=/; SameSite=Strict${secure}`
  } catch {
    // See readCookie.
  }
}

const randomId = () => {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function browserSessionStore<T>(): SessionStore<T> {
  const parse = (raw: string | null): Stored<T> | null => {
    if (!raw) return null
    try {
      const v = JSON.parse(raw) as Stored<T>
      return v && typeof v === 'object' && typeof v.browser === 'string' && v.auth ? v : null
    } catch {
      return null
    }
  }
  const store: SessionStore<T> = {
    read() {
      let stored: Stored<T> | null = null
      try {
        stored = parse(localStorage.getItem(STORE_KEY))
      } catch {
        return null
      }
      const browser = readCookie(COOKIE)
      if (stored && stored.browser === browser) return stored.auth
      if (stored) {
        // Left over from a browser that has since closed.
        try {
          localStorage.removeItem(STORE_KEY)
        } catch {
          // Nothing to clean.
        }
      }
      // An older build kept the sign-in in this tab only: move it to the shared place once.
      try {
        const legacy = sessionStorage.getItem(LEGACY_TAB_KEY)
        if (legacy) {
          sessionStorage.removeItem(LEGACY_TAB_KEY)
          const auth = JSON.parse(legacy) as T
          store.write(auth)
          return auth
        }
      } catch {
        // Unreadable: signed out.
      }
      return null
    },
    write(value) {
      try {
        if (value === null) {
          localStorage.removeItem(STORE_KEY)
          writeCookie(COOKIE, null)
          return
        }
        const browser = readCookie(COOKIE) ?? randomId()
        writeCookie(COOKIE, browser)
        localStorage.setItem(STORE_KEY, JSON.stringify({ browser, auth: value } satisfies Stored<T>))
      } catch {
        // Storage blocked: the sign-in still works in this tab, in memory.
      }
    },
    onChange(listener) {
      const onStorage = (e: StorageEvent) => {
        if (e.key === STORE_KEY || e.key === null) listener(store.read())
      }
      window.addEventListener('storage', onStorage)
      return () => window.removeEventListener('storage', onStorage)
    },
    withRenewLock(task) {
      const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: LockManager }).locks : undefined
      return locks ? (locks.request(LOCK, task) as Promise<Awaited<ReturnType<typeof task>>>) : task()
    },
  }
  return store
}

/** For tests and environments without storage: keeps the sign-in in memory. */
export function memorySessionStore<T>(): SessionStore<T> {
  let value: T | null = null
  return {
    read: () => value,
    write: (v) => {
      value = v
    },
    onChange: () => () => {},
    withRenewLock: (task) => task(),
  }
}

export const SESSION_STORE_KEYS = { store: STORE_KEY, legacyTab: LEGACY_TAB_KEY, cookie: COOKIE } as const
