import { describe, expect, it, vi } from 'vitest';
import { ClassroomService, type Caller } from '../src/classroom';

const teacherId = '22222222-2222-4222-8222-222222222222';
const studentId = '11111111-1111-4111-8111-111111111111';
const classId = (i: number) => `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`;
const teacher: Caller = { id: teacherId, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, authVersion: 0, sessionId: 'test-session', token: 'test-token' };
const student: Caller = { ...teacher, id: studentId, role: 'student', classId: classId(0) };
type Row = Record<string, any>;

function fixture(classes: Row[], worlds: Row[], memberships: Row[] = [], students: Row[] = []) {
  const paths: URL[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    paths.push(url);
    const query = url.searchParams;
    let rows: Row[];
    if (url.pathname.endsWith('brick_classes')) {
      rows = query.has('teacher_id')
        ? classes.filter(row => `eq.${row.teacher_id}` === query.get('teacher_id'))
        : classes.filter(row => `eq.${row.id}` === query.get('id'));
    } else if (url.pathname.endsWith('brick_world_members')) {
      rows = memberships.filter(row => `eq.${row.user_id}` === query.get('user_id'));
    } else if (url.pathname.endsWith('brick_class_codes')) {
      expect(query.get('can_enroll')).toBe('eq.true');
      const ids = query.get('class_id')!.slice(4, -1).split(',');
      rows = classes.filter(row => ids.includes(row.id)).map(row => ({ class_id: row.id, code: `CODE${row.id}` }));
    } else if (url.pathname.endsWith('brick_students')) {
      const ids = query.get('class_id')!.slice(4, -1).split(',');
      rows = students.filter(row => ids.includes(row.class_id));
    } else if (url.pathname.endsWith('brick_worlds')) {
      if (query.get('owner_id')?.startsWith('in.(')) {
        // Classmates' shared personal worlds, resolved by owner in bounded batches.
        expect(query.get('kind')).toBe('eq.personal');
        expect(query.get('class_visibility')).toBe('eq.class');
        const owners = query.get('owner_id')!.slice(4, -1).split(',');
        expect(owners.length).toBeLessThanOrEqual(100);
        rows = worlds.filter(row => row.kind === 'personal' && row.class_visibility === 'class' && owners.includes(row.owner_id) && (!query.has('hidden_by_teacher') || !row.hidden_by_teacher));
      } else if (query.has('owner_id')) {
        expect(query.get('kind')).toBe('eq.personal');
        rows = worlds.filter(row => row.kind === 'personal' && `eq.${row.owner_id}` === query.get('owner_id'));
      } else {
        expect(query.get('kind')).toBe('in.(class,group)');
        const ids = query.get('class_id')!.slice(4, -1).split(',');
        rows = worlds.filter(row => ids.includes(row.class_id) && ['class', 'group'].includes(row.kind));
      }
    } else throw new Error(`Unexpected path: ${url.pathname}`);
    const offset = Number(query.get('offset') || 0);
    rows = rows.slice(offset, offset + Number(query.get('limit') || 1000));
    return Response.json(rows);
  });
  return { paths, service: new ClassroomService({ SUPABASE_URL: 'https://supabase.test', SUPABASE_SERVICE_ROLE_KEY: 'test-service', SUPABASE_ANON_KEY: 'test-anon' }, fetcher as typeof fetch) };
}

describe('bounded classroom lists', () => {
  it('loads 60 teacher classes and codes in three scoped requests', async () => {
    const classes = Array.from({ length: 60 }, (_, i) => ({ id: classId(i), teacher_id: teacherId }));
    const { service, paths } = fixture([...classes, { id: classId(999), teacher_id: studentId }], []);
    const result = await service.me(teacher);
    expect(result.classes).toHaveLength(60);
    expect(result.classes.every(row => row.code === `CODE${row.id}`)).toBe(true);
    expect(paths).toHaveLength(3);
    expect(paths.filter(url => url.pathname.endsWith('brick_class_codes')).every(url => !url.search.includes(classId(999)))).toBe(true);
  });

  it('lists 60 classes with bounded queries and never includes another owner personal world or foreign class', async () => {
    const classes = Array.from({ length: 60 }, (_, i) => ({ id: classId(i), teacher_id: teacherId, collaboration_open: false }));
    const shared = classes.map((row, i) => ({ id: `world${i}`, class_id: row.id, kind: 'class', owner_id: teacherId }));
    const { service, paths } = fixture([...classes, { id: classId(999), teacher_id: studentId }], [
      ...shared, { id: 'mine', kind: 'personal', owner_id: teacherId },
      { id: 'student-private', kind: 'personal', owner_id: studentId, class_id: classId(0) },
      { id: 'foreign', kind: 'class', class_id: classId(999), owner_id: studentId },
    ]);
    const result = await service.listWorlds(teacher);
    expect(result.map(row => row.id)).toEqual(['mine', ...shared.map(row => row.id)]);
    // mine, classes, two class-world batches, two student batches (no students, so no shared-world query).
    expect(paths).toHaveLength(6);
    expect(paths.some(url => url.pathname.endsWith('brick_class_codes'))).toBe(false);
    expect(paths.filter(url => url.pathname.endsWith('brick_students')).every(url => !url.search.includes(classId(999)))).toBe(true);
  });

  it('students see only their personal, whole-class, and assigned group worlds, without enrollment codes', async () => {
    const cls = { id: classId(0), teacher_id: teacherId, collaboration_open: true };
    const { service, paths } = fixture([cls], [
      { id: 'mine', kind: 'personal', owner_id: studentId },
      { id: 'other-private', kind: 'personal', owner_id: teacherId },
      { id: 'whole', kind: 'class', class_id: cls.id },
      { id: 'assigned', kind: 'group', class_id: cls.id },
      { id: 'unassigned', kind: 'group', class_id: cls.id },
      { id: 'foreign', kind: 'class', class_id: classId(999) },
    ], [{ world_id: 'assigned', user_id: studentId }, { world_id: 'unassigned', user_id: teacherId }]);
    expect((await service.listWorlds(student)).map(row => row.id)).toEqual(['mine', 'whole', 'assigned']);
    expect((await service.me(student)).classes[0]).not.toHaveProperty('code');
    expect((await service.me(student)).classes[0]).toMatchObject({ studentsCanShare: true });
    expect(paths.some(url => url.pathname.endsWith('brick_class_codes'))).toBe(false);
    expect(paths.filter(url => url.pathname.endsWith('brick_world_members'))).toHaveLength(1);
  });

  it('closed collaboration keeps student personal worlds but skips all shared queries', async () => {
    const { service, paths } = fixture([{ id: classId(0), collaboration_open: false }], [
      { id: 'mine', kind: 'personal', owner_id: studentId }, { id: 'whole', kind: 'class', class_id: classId(0) },
    ]);
    expect((await service.listWorlds(student)).map(row => row.id)).toEqual(['mine']);
    expect(paths).toHaveLength(2);
  });

  describe('classmates shared personal worlds', () => {
    const cls = { id: classId(0), teacher_id: teacherId, collaboration_open: true, students_can_share: true };
    const ava = '11111111-1111-4111-8111-00000000000a', ben = '11111111-1111-4111-8111-00000000000b', paused = '11111111-1111-4111-8111-00000000000c';
    const roster = [
      { user_id: studentId, class_id: cls.id, roster_name: 'Sam Rivera', suspended: false },
      { user_id: ava, class_id: cls.id, roster_name: 'Ava Rose', suspended: false },
      { user_id: ben, class_id: cls.id, roster_name: 'Ben Kim', suspended: false },
      { user_id: paused, class_id: cls.id, roster_name: 'Pat Paused', suspended: true },
    ];
    const worlds = [
      { id: 'mine', kind: 'personal', owner_id: studentId, class_visibility: 'class', class_can_edit: true, class_shared_at: '2026-09-15T10:00:00Z' },
      { id: 'ava-look', kind: 'personal', owner_id: ava, class_visibility: 'class', class_can_edit: false, class_shared_at: '2026-09-16T10:00:00Z' },
      { id: 'ben-edit', kind: 'personal', owner_id: ben, class_visibility: 'class', class_can_edit: true, class_shared_at: '2026-09-14T10:00:00Z' },
      { id: 'ben-hidden', kind: 'personal', owner_id: ben, class_visibility: 'class', class_can_edit: true, hidden_by_teacher: true, class_shared_at: '2026-09-13T10:00:00Z' },
      { id: 'ben-private', kind: 'personal', owner_id: ben, class_visibility: 'private' },
      { id: 'paused-shared', kind: 'personal', owner_id: paused, class_visibility: 'class', class_can_edit: false },
      { id: 'whole', kind: 'class', class_id: cls.id, owner_id: teacherId },
    ];
    it('lists shared classmate worlds with the sharing fields, skipping hidden, private and suspended owners', async () => {
      const { service } = fixture([cls], worlds, [], roster);
      const result = await service.listWorlds({ ...student, rosterName: 'Sam Rivera' });
      expect(result.map(row => row.id)).toEqual(['mine', 'whole', 'ava-look', 'ben-edit']);
      expect(result[0]).toMatchObject({ visibility: 'class', canEdit: true, ownerName: 'Sam R.', ownerClassId: cls.id, sharedAt: '2026-09-15T10:00:00Z' });
      expect(result[1]).toMatchObject({ visibility: 'class', canEdit: true, ownerName: 'Teacher', ownerClassId: cls.id, sharedAt: null });
      expect(result[2]).toMatchObject({ visibility: 'class', canEdit: false, classCanEdit: false, ownerName: 'Ava R.', ownerClassId: cls.id, sharedAt: '2026-09-16T10:00:00Z' });
      expect(result[3]).toMatchObject({ visibility: 'class', canEdit: true, classCanEdit: true, ownerName: 'Ben K.' });
      expect(result[1].classCanEdit).toBe(true);
      expect(result.every(row => !('hiddenByTeacher' in row))).toBe(true);
    });
    it('reports private own worlds as private and hides classmates when sharing is off or collaboration closed', async () => {
      const closed = fixture([{ ...cls, students_can_share: false }], worlds, [], roster);
      expect((await closed.service.listWorlds(student)).map(row => row.id)).toEqual(['mine', 'whole']);
      expect(closed.paths.some(url => url.pathname.endsWith('brick_students'))).toBe(false);
      const paused = fixture([{ ...cls, collaboration_open: false }], worlds, [], roster);
      expect((await paused.service.listWorlds(student)).map(row => row.id)).toEqual(['mine']);
      const own = fixture([cls], [{ id: 'quiet', kind: 'personal', owner_id: studentId, class_visibility: 'private', class_can_edit: true }], [], roster);
      // The owner always edits; classCanEdit still reports the sharing setting for the card.
      expect((await own.service.listWorlds(student))[0]).toMatchObject({ id: 'quiet', visibility: 'private', canEdit: true, classCanEdit: true, sharedAt: null });
    });
    it('shows the teacher every shared student world of their classes, hidden ones flagged, never private ones', async () => {
      const { service, paths } = fixture([cls, { id: classId(999), teacher_id: studentId }], worlds, [], roster);
      const result = await service.listWorlds(teacher);
      expect(result.map(row => [row.id, row.hiddenByTeacher])).toEqual([['whole', false], ['mine', false], ['ava-look', false], ['ben-edit', false], ['ben-hidden', true], ['paused-shared', false]]);
      // A hidden world is never editable, even for the teacher who hid it (the save RPC would refuse); an open one is.
      expect(result.find(row => row.id === 'ben-hidden')).toMatchObject({ canEdit: false, classCanEdit: true, ownerName: 'Ben K.', visibility: 'class', ownerClassId: cls.id });
      expect(result.find(row => row.id === 'ben-edit')).toMatchObject({ canEdit: true, classCanEdit: true });
      const closed = fixture([{ ...cls, collaboration_open: false }], worlds, [], roster);
      expect((await closed.service.listWorlds(teacher)).find(row => row.id === 'ben-edit')).toMatchObject({ canEdit: false, classCanEdit: true });
      const off = fixture([{ ...cls, students_can_share: false }], worlds, [], roster);
      expect((await off.service.listWorlds(teacher)).find(row => row.id === 'ben-edit')).toMatchObject({ canEdit: false, classCanEdit: true });
      // A teacher's own personal world has no class; class worlds report their class.
      expect(result.find(row => row.id === 'whole')).toMatchObject({ ownerClassId: cls.id });
      const own = fixture([cls], [{ id: 'mine-t', kind: 'personal', owner_id: teacherId }], [], []);
      expect((await own.service.listWorlds(teacher))[0]).toMatchObject({ id: 'mine-t', ownerClassId: null, ownerName: 'Teacher' });
      expect(paths.filter(url => url.pathname.endsWith('brick_worlds') && url.searchParams.get('owner_id')?.startsWith('in.')).every(url => !url.searchParams.has('hidden_by_teacher'))).toBe(true);
    });
    it('batches shared-world lookups by 100 owners', async () => {
      const many = Array.from({ length: 250 }, (_, i) => ({ user_id: `22222222-2222-4222-8222-${String(i).padStart(12, '0')}`, class_id: cls.id, roster_name: `Kid ${i}`, suspended: false }));
      const { service, paths } = fixture([cls], many.map(row => ({ id: `w-${row.user_id}`, kind: 'personal', owner_id: row.user_id, class_visibility: 'class' })), [], many);
      expect(await service.listWorlds(teacher)).toHaveLength(250);
      expect(paths.filter(url => url.searchParams.get('owner_id')?.startsWith('in.'))).toHaveLength(3);
    });
  });

  it('does not truncate a batch at the provider row limit', async () => {
    const worlds = Array.from({ length: 1001 }, (_, i) => ({ id: `world${i}`, class_id: classId(0), kind: 'class', owner_id: teacherId }));
    const { service, paths } = fixture([{ id: classId(0), teacher_id: teacherId }], worlds);
    expect(await service.listWorlds(teacher)).toHaveLength(1001);
    expect(paths.filter(url => url.pathname.endsWith('brick_worlds') && url.searchParams.has('class_id')).map(url => url.searchParams.get('offset'))).toEqual(['0', '1000']);
  });
});
