import { describe, expect, it, vi } from 'vitest';
import { ClassroomService, type Caller } from '../src/classroom';

const teacherId = '22222222-2222-4222-8222-222222222222';
const studentId = '11111111-1111-4111-8111-111111111111';
const classId = (i: number) => `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`;
const teacher: Caller = { id: teacherId, username: 'Teacher', rosterName: 'Teacher', role: 'teacher', resetRequired: false, authVersion: 0, sessionId: 'test-session', token: 'test-token' };
const student: Caller = { ...teacher, id: studentId, role: 'student', classId: classId(0) };
type Row = Record<string, any>;

function fixture(classes: Row[], worlds: Row[], memberships: Row[] = []) {
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
    } else if (url.pathname.endsWith('brick_worlds')) {
      if (query.has('owner_id')) {
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
    expect(paths).toHaveLength(4);
    expect(paths.some(url => url.pathname.endsWith('brick_class_codes'))).toBe(false);
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

  it('does not truncate a batch at the provider row limit', async () => {
    const worlds = Array.from({ length: 1001 }, (_, i) => ({ id: `world${i}`, class_id: classId(0), kind: 'class', owner_id: teacherId }));
    const { service, paths } = fixture([{ id: classId(0), teacher_id: teacherId }], worlds);
    expect(await service.listWorlds(teacher)).toHaveLength(1001);
    expect(paths.filter(url => url.searchParams.has('class_id')).map(url => url.searchParams.get('offset'))).toEqual(['0', '1000']);
  });
});
