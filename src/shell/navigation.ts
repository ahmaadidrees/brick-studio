import type { ClassroomEntryIntent } from '../routes'

/*
 * Redirect helpers for the flows v2 pages. Pure path builders plus thin
 * `goTo*` wrappers so pages and the editor never spell a route twice. Every
 * navigation goes through `window.location.assign` (pages are separate lazy
 * chunks, there is no client-side router); tests pass their own `navigate`.
 */

export const JOIN_PATH = '/join'
export const WORLDS_PATH = '/worlds'
export const CLASS_PATH = '/class'
export const PROJECTOR_PATH = '/class/projector'

/*
 * "New build" everywhere outside the editor. It has to open the studio on an
 * empty plate rather than reopening whatever is already in this browser, which
 * the editor signals with `?new=1` — but `src/brick/BrickStudioApp.tsx` does
 * not read that flag yet and belongs to another lane, so this points at plain
 * `/build` until it does. Change this one constant then; nothing else.
 */
export const NEW_BUILD_HREF = '/build?new=1'

/** `signin` = returning student, `teacher` = teacher sign-in; omitted = new student (code first). */
export type JoinMode = 'signin' | 'teacher'

export type JoinOptions = {
  mode?: JoinMode
  /** Prefills the class code (invite links and the QR encode this). */
  classCode?: string
  /** Same-origin path to return to after sign-in; anything else is dropped. */
  next?: string
}

export type Navigate = (url: string) => void

const browserNavigate: Navigate = (url) => { window.location.assign(url) }

/** Keeps `next` on this origin: a root-relative path that is not protocol-relative. */
export function safeNextPath(next: string | undefined | null): string | undefined {
  if (!next) return undefined
  const trimmed = next.trim()
  if (!trimmed.startsWith('/') || trimmed.startsWith('//') || /[\\\s]/.test(trimmed) || /^\/[^/]*:/.test(trimmed.split(/[?#]/)[0])) return undefined
  return trimmed
}

/** The current page as a `next` target (path + query + hash). */
export function currentPath(): string {
  const { pathname, search, hash } = window.location
  return `${pathname}${search}${hash}`
}

export function joinPath({ mode, classCode, next }: JoinOptions = {}): string {
  const params = new URLSearchParams()
  if (mode) params.set('mode', mode)
  const code = classCode?.trim().toUpperCase()
  if (code) params.set('classCode', code)
  const safeNext = safeNextPath(next)
  if (safeNext) params.set('next', safeNext)
  const query = params.toString()
  return query ? `${JOIN_PATH}?${query}` : JOIN_PATH
}

export function goToJoin(options: JoinOptions = {}, navigate: Navigate = browserNavigate) {
  navigate(joinPath(options))
}

export function goToWorlds(navigate: Navigate = browserNavigate) {
  navigate(WORLDS_PATH)
}

export function goToClass(navigate: Navigate = browserNavigate) {
  navigate(CLASS_PATH)
}

export function goToProjector(navigate: Navigate = browserNavigate) {
  navigate(PROJECTOR_PATH)
}

/**
 * Where a `/build?classroom=<intent>` entry lands in flows v2. `save` stays in
 * the editor (the in-editor save sheet) and resolves to null; everything else
 * is a page. `join` and `signin` keep the class code when the entry carried
 * one (printed invites and the older sign-in posters both encode it).
 */
export function classroomIntentPath(intent: ClassroomEntryIntent, search = ''): string | null {
  const classCode = () => new URLSearchParams(search).get('classCode') ?? undefined
  switch (intent) {
    case 'save': return null
    case 'worlds': return WORLDS_PATH
    case 'class': return CLASS_PATH
    case 'join': return joinPath({ classCode: classCode() })
    case 'signin': return joinPath({ mode: 'signin', classCode: classCode() })
    case 'teacher': return joinPath({ mode: 'teacher' })
  }
}

/**
 * Redirects for page intents and returns true; returns false for `save` (and
 * the editor then opens its save sheet). Used by W6 when the editor mounts
 * with a `?classroom=` intent.
 */
export function classroomIntentRedirect(intent: ClassroomEntryIntent, navigate: Navigate = browserNavigate, search = typeof window === 'undefined' ? '' : window.location.search): boolean {
  const target = classroomIntentPath(intent, search)
  if (!target) return false
  navigate(target)
  return true
}
