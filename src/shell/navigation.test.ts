import { describe, expect, it, vi } from 'vitest'
import { classroomIntentPath, classroomIntentRedirect, goToClass, goToJoin, goToProjector, goToWorlds, joinPath, safeNextPath } from './navigation'

describe('joinPath', () => {
  it('builds the join URL from mode, class code and next', () => {
    expect(joinPath()).toBe('/join')
    expect(joinPath({ mode: 'signin' })).toBe('/join?mode=signin')
    expect(joinPath({ mode: 'teacher', next: '/class' })).toBe('/join?mode=teacher&next=%2Fclass')
    expect(joinPath({ classCode: ' ab7x ' })).toBe('/join?classCode=AB7X')
    expect(joinPath({ mode: 'signin', next: '/worlds?view=class#top' })).toBe('/join?mode=signin&next=%2Fworlds%3Fview%3Dclass%23top')
  })

  it('drops a next that leaves this origin', () => {
    expect(safeNextPath('/worlds')).toBe('/worlds')
    expect(safeNextPath('//evil.example/worlds')).toBeUndefined()
    expect(safeNextPath('https://evil.example')).toBeUndefined()
    expect(safeNextPath('javascript:alert(1)')).toBeUndefined()
    expect(safeNextPath('worlds')).toBeUndefined()
    expect(safeNextPath('')).toBeUndefined()
    expect(joinPath({ next: '//evil.example' })).toBe('/join')
  })
})

describe('goTo helpers', () => {
  it('navigate to the pages', () => {
    const navigate = vi.fn()
    goToJoin({ mode: 'signin', next: '/worlds' }, navigate)
    goToWorlds(navigate)
    goToClass(navigate)
    goToProjector(navigate)
    expect(navigate.mock.calls.map(([url]) => url)).toEqual(['/join?mode=signin&next=%2Fworlds', '/worlds', '/class', '/class/projector'])
  })
})

describe('classroomIntentRedirect', () => {
  it('maps every page intent and keeps save in the editor', () => {
    expect(classroomIntentPath('worlds')).toBe('/worlds')
    expect(classroomIntentPath('class')).toBe('/class')
    expect(classroomIntentPath('join')).toBe('/join')
    expect(classroomIntentPath('join', '?classroom=join&classCode=ab7x')).toBe('/join?classCode=AB7X')
    expect(classroomIntentPath('signin')).toBe('/join?mode=signin')
    expect(classroomIntentPath('teacher')).toBe('/join?mode=teacher')
    expect(classroomIntentPath('save')).toBeNull()
  })

  it('redirects and reports whether it did', () => {
    const navigate = vi.fn()
    expect(classroomIntentRedirect('save', navigate)).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
    expect(classroomIntentRedirect('teacher', navigate)).toBe(true)
    expect(navigate).toHaveBeenCalledWith('/join?mode=teacher')
  })
})
