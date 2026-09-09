import { describe, expect, it } from 'vitest'
import { fromBrickStudent, fromClassChatStudent, fromTeacher, isSameIdentity } from './index'

const identity = { provider: 'https://example.supabase.co/auth/v1', userId: 'student-one' }
const brickStudent = { user_id: 'student-one', class_id: 'brick-class', suspended: false, reset_required: false }
const brickClass = { id: 'brick-class', teacher_id: 'teacher-one', collaboration_open: true }
const chatStudent = { id: 'student-one', locked_at: null }
const chatMember = { student_id: 'student-one', class_id: 'chat-class', status: 'active' as const, needs_password_reset: false }
const chatClass = { id: 'chat-class', teacher_id: 'teacher-one', is_chat_active: true }

describe('bounded cross-product identity projection', () => {
  it('recognizes a shared provider identity without equating product classes', () => {
    const brick = fromBrickStudent(identity, brickStudent, brickClass)
    const chat = fromClassChatStudent(identity, chatStudent, chatMember, chatClass)
    expect(isSameIdentity(brick, chat)).toBe(true)
    expect(brick.classId).not.toBe(chat.classId)
    expect(brick.product).not.toBe(chat.product)
  })
  it('does not equate identities across provider projects', () => {
    expect(isSameIdentity(identity, { ...identity, provider: 'another-project' })).toBe(false)
    expect(isSameIdentity(identity, { ...identity, userId: 'another-student' })).toBe(false)
  })
  it('rejects guessed profiles and memberships', () => {
    expect(() => fromBrickStudent({ ...identity, userId: 'intruder' }, brickStudent, brickClass)).toThrow()
    expect(() => fromClassChatStudent(identity, chatStudent, { ...chatMember, class_id: 'other' }, chatClass)).toThrow()
    expect(() => fromClassChatStudent(identity, chatStudent, { ...chatMember, student_id: 'other' }, chatClass)).toThrow()
  })
  it.each([
    [{ suspended: true }, 'account-locked'],
    [{ reset_required: true }, 'password-change-required'],
  ] as const)('preserves Brick restrictions %s', (changes, reason) => {
    expect(fromBrickStudent(identity, { ...brickStudent, ...changes }, brickClass)).toMatchObject({ canParticipate: false, restriction: reason })
  })
  it('preserves separate collaboration closures', () => {
    expect(fromBrickStudent(identity, brickStudent, { ...brickClass, collaboration_open: false }).canParticipate).toBe(false)
    expect(fromClassChatStudent(identity, chatStudent, chatMember, chatClass).canParticipate).toBe(true)
  })
  it('preserves ClassChat reset, suspension, account lock and class closure independently', () => {
    expect(fromClassChatStudent(identity, chatStudent, { ...chatMember, needs_password_reset: true }, chatClass).restriction).toBe('password-change-required')
    expect(fromClassChatStudent(identity, chatStudent, { ...chatMember, status: 'suspended' }, chatClass).restriction).toBe('membership-inactive')
    expect(fromClassChatStudent(identity, { ...chatStudent, locked_at: '2026-09-09' }, chatMember, chatClass).restriction).toBe('account-locked')
    expect(fromClassChatStudent(identity, chatStudent, chatMember, { ...chatClass, is_chat_active: false }).restriction).toBe('class-closed')
  })
  it('never inherits teacher approval from another product', () => {
    const teacher = { ...identity, userId: 'teacher-one' }
    expect(fromTeacher(teacher, 'brick-studio', brickClass, true).canParticipate).toBe(true)
    expect(fromTeacher(teacher, 'classchat', chatClass, false)).toMatchObject({ canParticipate: false, restriction: 'approval-required' })
    expect(() => fromTeacher(identity, 'classchat', chatClass, true)).toThrow()
  })
})
