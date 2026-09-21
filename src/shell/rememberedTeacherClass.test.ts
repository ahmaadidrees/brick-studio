import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearRememberedTeacherClass, pickTeacherClassId, readRememberedTeacherClass, rememberTeacherClass,
  REMEMBERED_TEACHER_CLASS_KEY, type ClassStorage,
} from './rememberedTeacherClass'

afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks() })

const CLASSES = [{ id: 'class-1' }, { id: 'class-2' }]

/** A store that throws on every call, the way Safari's private mode does. */
const hostile: ClassStorage = {
  getItem: () => { throw new Error('denied') },
  setItem: () => { throw new Error('denied') },
  removeItem: () => { throw new Error('denied') },
}

describe('remembering', () => {
  it('round-trips the class id through the one documented key', () => {
    rememberTeacherClass('class-2')
    expect(window.localStorage.getItem(REMEMBERED_TEACHER_CLASS_KEY)).toBe('{"classId":"class-2"}')
    expect(readRememberedTeacherClass()).toBe('class-2')

    clearRememberedTeacherClass()
    expect(window.localStorage.getItem(REMEMBERED_TEACHER_CLASS_KEY)).toBeNull()
    expect(readRememberedTeacherClass()).toBeNull()
  })

  it('treats an empty id as forgetting, so nothing stale is left behind', () => {
    rememberTeacherClass('class-1')
    rememberTeacherClass('')
    expect(readRememberedTeacherClass()).toBeNull()
  })

  it('reads nothing from junk, from the wrong shape and from a store that throws', () => {
    window.localStorage.setItem(REMEMBERED_TEACHER_CLASS_KEY, 'not json')
    expect(readRememberedTeacherClass()).toBeNull()
    window.localStorage.setItem(REMEMBERED_TEACHER_CLASS_KEY, '{"classId":7}')
    expect(readRememberedTeacherClass()).toBeNull()
    window.localStorage.setItem(REMEMBERED_TEACHER_CLASS_KEY, 'null')
    expect(readRememberedTeacherClass()).toBeNull()
    expect(readRememberedTeacherClass(hostile)).toBeNull()
  })

  it('never lets a blocked store break the caller', () => {
    expect(() => rememberTeacherClass('class-1', hostile)).not.toThrow()
    expect(() => clearRememberedTeacherClass(hostile)).not.toThrow()
    expect(() => rememberTeacherClass('class-1', null)).not.toThrow()
    expect(readRememberedTeacherClass(null)).toBeNull()
  })
})

describe('pickTeacherClassId', () => {
  it('prefers an explicit request, then the remembered class, then the first', () => {
    rememberTeacherClass('class-2')
    expect(pickTeacherClassId(CLASSES, 'class-1')).toBe('class-1')
    expect(pickTeacherClassId(CLASSES, null)).toBe('class-2')
    clearRememberedTeacherClass()
    expect(pickTeacherClassId(CLASSES, null)).toBe('class-1')
  })

  it('skips ids that name no class this teacher has, so a deleted class leaves no empty page', () => {
    rememberTeacherClass('class-gone')
    expect(pickTeacherClassId(CLASSES, 'also-gone')).toBe('class-1')
    expect(pickTeacherClassId([], null)).toBe('')
  })
})
