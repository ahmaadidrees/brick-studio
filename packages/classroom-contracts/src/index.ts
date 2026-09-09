/** Server-side projection only. Never use a browser-supplied value to authorize access. */
export type ClassroomAccess = {
  provider: string
  userId: string
  product: 'brick-studio' | 'classchat'
  classId: string
  teacherId: string
  role: 'teacher' | 'student'
  canParticipate: boolean
  restriction: 'none' | 'approval-required' | 'membership-inactive' | 'account-locked' | 'password-change-required' | 'class-closed'
}

export type VerifiedIdentity = { provider: string; userId: string }

function identityMatches(identity: VerifiedIdentity, rowUserId: string) {
  if (!identity.provider || !identity.userId || identity.userId !== rowUserId) {
    throw new Error('Verified identity does not match the product profile')
  }
}

export function fromBrickStudent(identity: VerifiedIdentity, student: {
  user_id: string; class_id: string; suspended: boolean; reset_required: boolean
}, classroom: { id: string; teacher_id: string; collaboration_open: boolean }): ClassroomAccess {
  identityMatches(identity, student.user_id)
  if (student.class_id !== classroom.id) throw new Error('Class membership does not match')
  const restriction = student.suspended ? 'account-locked'
    : student.reset_required ? 'password-change-required'
      : !classroom.collaboration_open ? 'class-closed' : 'none'
  return { ...identity, product: 'brick-studio', classId: classroom.id,
    teacherId: classroom.teacher_id, role: 'student', canParticipate: restriction === 'none', restriction }
}

export function fromClassChatStudent(identity: VerifiedIdentity, student: {
  id: string; locked_at: string | null
}, membership: { student_id: string; class_id: string; status: 'active' | 'suspended'; needs_password_reset: boolean },
classroom: { id: string; teacher_id: string; is_chat_active: boolean }): ClassroomAccess {
  identityMatches(identity, student.id)
  if (membership.student_id !== student.id || membership.class_id !== classroom.id) throw new Error('Class membership does not match')
  const restriction = membership.status !== 'active' ? 'membership-inactive'
    : student.locked_at ? 'account-locked'
      : membership.needs_password_reset ? 'password-change-required'
        : !classroom.is_chat_active ? 'class-closed' : 'none'
  return { ...identity, product: 'classchat', classId: classroom.id,
    teacherId: classroom.teacher_id, role: 'student', canParticipate: restriction === 'none', restriction }
}

/** Identity equality is not permission inheritance, class equality, or an account-link operation. */
export function isSameIdentity(a: VerifiedIdentity, b: VerifiedIdentity): boolean {
  return !!a.provider && !!a.userId && a.provider === b.provider && a.userId === b.userId
}

export function fromTeacher(identity: VerifiedIdentity, product: ClassroomAccess['product'], classroom: {
  id: string; teacher_id: string
}, approvedByProduct: boolean): ClassroomAccess {
  identityMatches(identity, classroom.teacher_id)
  return { ...identity, product, classId: classroom.id, teacherId: classroom.teacher_id,
    role: 'teacher', canParticipate: approvedByProduct,
    restriction: approvedByProduct ? 'none' : 'approval-required' }
}
