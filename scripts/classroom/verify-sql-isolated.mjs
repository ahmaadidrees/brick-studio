// Usage: PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node scripts/classroom/verify-sql-isolated.mjs
// Isolated Postgres engine; never connects to a hosted provider.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);`);
for (const file of (await readdir('supabase/migrations')).filter(x => x.endsWith('.sql')).sort()) {
  await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  console.log(`Applied isolated ${file}`);
}
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const teacher = '10000000-0000-4000-8000-000000000001';
const student = '20000000-0000-4000-8000-000000000001';
const session = '30000000-0000-4000-8000-000000000001';
await q('insert into auth.users values ($1),($2)', [teacher, student]);
const [{ id: cls }] = await q("insert into brick_classes(teacher_id,name,login_code) values($1,'Test','TEST') returning id", [teacher]);
await q("insert into brick_students(user_id,class_id,username,username_key,roster_name) values($1,$2,'Builder','builder','Test')", [student, cls]);
await q('insert into brick_sessions(session_id,user_id,auth_version) values($1,$2,1)', [session, student]);
const [{ id: world }] = await q("insert into brick_worlds(owner_id,class_id,kind,title,document) values($1,$2,'group','Test','{}') returning id", [teacher, cls]);
await q('insert into brick_world_members values($1,$2)', [world, student]);
async function authorize(userId = student, sessionId = session, version = 1, teacherAllowed = false) {
  return (await q('select brick_authorize_world($1,$2,$3,$4,$5) as value', [world, userId, sessionId, version, teacherAllowed]))[0].value;
}
assert.equal((await authorize()).userId, student);
assert.equal((await authorize()).role, 'student');
assert.equal((await authorize()).document, undefined);
assert.equal((await authorize(student, session, null)).error, 'session_revoked');
await q('update brick_students set suspended=true where user_id=$1', [student]);
assert.equal((await authorize()).error, 'suspended');
await q('update brick_students set suspended=false,reset_required=true where user_id=$1', [student]);
assert.equal((await authorize()).error, 'password_change_required');
await q('update brick_students set reset_required=false where user_id=$1', [student]);
await q('update brick_classes set collaboration_open=false where id=$1', [cls]);
assert.equal((await authorize()).error, 'class_closed');
await q('update brick_classes set collaboration_open=true where id=$1', [cls]);
const teacherSession = '30000000-0000-4000-8000-000000000002';
await q('insert into brick_teacher_sessions(session_id,user_id) values($1,$2)', [teacherSession, teacher]);
assert.equal((await authorize(teacher, teacherSession, 0, true)).role, 'teacher');
assert.equal((await authorize(teacher, teacherSession, 0, false)).error, 'session_revoked');
await q('update brick_teacher_sessions set revoked=true where session_id=$1', [teacherSession]);
assert.equal((await authorize(teacher, teacherSession, 0, true)).error, 'session_revoked');
const [{ value: batch }] = await q('select brick_authorize_world_batch($1,$2::jsonb) as value', [world, JSON.stringify([
  { userId: student, sessionId: session, authVersion: 1, teacherAllowed: false },
  { userId: teacher, sessionId: teacherSession, authVersion: 0, teacherAllowed: true },
])]);
assert.equal(batch[0].userId, student);
assert.equal(batch[1].error, 'session_revoked');
await assert.rejects(q('select brick_authorize_world_batch($1,$2::jsonb)', [world, JSON.stringify(Array.from({ length: 65 }, () => ({})))]), /Invalid permission batch/);
await assert.rejects(q('select brick_authorize_world_batch($1,null)', [world]), /Invalid permission batch/);
await assert.rejects(q("select brick_authorize_world_batch($1,'{}')", [world]), /Invalid permission batch|array length/);
async function save(revision = 1) {
  return (await q("select brick_commit_world($1,$2,'{}',null,'save',$3,$4,1) as value", [world, revision, student, session]))[0].value;
}
assert.equal((await save()).revision, 2);
assert.equal((await save()).error, 'conflict');
await q('delete from brick_world_members where world_id=$1 and user_id=$2', [world, student]);
assert.equal((await save(2)).error, 'access_revoked');
assert.equal((await authorize()).error, 'not_found');
await q('insert into brick_world_members values($1,$2)', [world, student]);
await q('update brick_students set auth_version=2 where user_id=$1', [student]);
assert.equal((await save(2)).error, 'access_revoked');
assert.equal((await authorize()).error, 'session_revoked');
const lock = '40000000-0000-4000-8000-000000000001';
assert.equal((await q('select brick_acquire_credential_lock($1,$2) as value', [student, lock]))[0].value, true);
assert.equal((await q('select brick_acquire_credential_lock($1,gen_random_uuid()) as value', [student]))[0].value, false);
await q("insert into brick_worlds(owner_id,kind,title,document) select $1,'personal','Quota','{}' from generate_series(1,50)", [student]);
await assert.rejects(q("insert into brick_worlds(owner_id,kind,title,document) values($1,'personal','Overflow','{}')", [student]), /brick_world_quota/);
await db.exec(`insert into auth.users select gen_random_uuid() from generate_series(1,149)`);
await q("insert into brick_students(user_id,class_id,username,username_key,roster_name) select id,$1,'User','u'||row_number() over(),'Test' from auth.users where id not in ($2,$3)", [cls, student, teacher]);
const [{ id: extra }] = await q('insert into auth.users values(gen_random_uuid()) returning id');
await assert.rejects(q("insert into brick_students(user_id,class_id,username,username_key,roster_name) values($1,$2,'Extra','extra','Test')", [extra, cls]), /brick_student_quota/);
for (let i = 0; i < 7; i++) await q("insert into brick_checkpoints(world_id,revision,document,title,reason) values($1,$2,jsonb_build_object('large',repeat('x',1500000)),'Test','test')", [world, i + 10]);
const [{ bytes }] = await q('select sum(octet_length(document::text))::int as bytes from brick_checkpoints where world_id=$1', [world]);
assert.ok(bytes <= 8_000_000);
await assert.rejects(q("update brick_worlds set document=jsonb_build_object('large',repeat('x',2000000)) where id=$1", [world]), /brick_world_document_size/);
for (const role of ['anon', 'authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(q('select * from public.brick_students'), /permission denied/);
  await assert.rejects(q("select public.brick_save_world($1,2,'{}',null,'save')", [world]), /permission denied/);
  await assert.rejects(q("select public.brick_acquire_credential_lock($1,$2)", [student, lock]), /permission denied/);
  await assert.rejects(q('select public.brick_authorize_world($1,$2,$3,1,false)', [world, student, session]), /permission denied/);
  await assert.rejects(q("select public.brick_authorize_world_batch($1,'[]')", [world]), /permission denied/);
  await db.exec('reset role');
}
await db.close();
console.log('PASS: migration execution, valid CAS, stale CAS, single/batch current authorization, suspended/reset/class-closed/removed/revoked denial, teacher allowlist and revocation, batch limit/order, credential lease, student/world quotas, recovery byte cap, oversized document, anonymous/authenticated table and RPC denial. Concurrency and hosted provider behavior require separate proof.');
