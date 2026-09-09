// Real-provider verification. Never use an existing teacher's password reset.
// Requires a dedicated configured test teacher and an explicitly selected API.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const required = ['CLASSROOM_TEST_API', 'CLASSROOM_TEST_TEACHER_EMAIL', 'CLASSROOM_TEST_TEACHER_PASSWORD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY'];
for (const key of required) assert(process.env[key], `Missing ${key}`);
assert(process.env.CLASSROOM_TEST_ALLOW_FIXTURES === 'yes', 'Explicit fixture creation flag required');
const base = process.env.CLASSROOM_TEST_API.replace(/\/$/, '');
const run = `qa_${Date.now().toString(36)}`;
const password = () => `Qa!${randomBytes(20).toString('hex')}`;
const results = [];
async function request(path, { method = 'GET', body, token, statuses = [200] } = {}) {
  const response = await fetch(`${base}/classroom/${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json();
  assert(statuses.includes(response.status), `${method} ${path}: ${response.status} ${data.code ?? 'unexpected response'}`);
  return { status: response.status, data };
}
async function assertAuthoritativeWorld(expected) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/brick_worlds?id=eq.${expected.id}&select=id,owner_id,revision,document`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].owner_id, expected.ownerId);
  assert.equal(rows[0].revision, expected.revision);
  assert.deepEqual(rows[0].document, expected.document);
}
async function check(name, fn) { await fn(); results.push(name); console.log(`PASS ${name}`); }
const teacher = (await request('auth/teacher-login', { method: 'POST', body: { email: process.env.CLASSROOM_TEST_TEACHER_EMAIL, password: process.env.CLASSROOM_TEST_TEACHER_PASSWORD } })).data;
const teacherToken = teacher.session.accessToken;
const classroom = (await request('classes', { method: 'POST', token: teacherToken, body: { name: `Release verification ${run}` }, statuses: [200, 201] })).data.class;
const initialPassword = password();
let student;
let other;
let world;
let currentPassword = initialPassword;
let failure;
const fixtureUsers = new Set();
try {
await check('class-code registration and stable account identity', async () => {
  student = (await request('auth/register', { method: 'POST', body: { classCode: classroom.code, username: run, password: initialPassword, rosterName: 'Release test fixture' }, statuses: [201] })).data;
  fixtureUsers.add(student.user.id);
  assert.equal(student.user.role, 'student');
  assert.equal(student.user.resetRequired, false);
});
other = (await request('auth/register', { method: 'POST', body: { classCode: classroom.code, username: `${run}_b`, password: password(), rosterName: 'Second release test fixture' }, statuses: [201] })).data;
fixtureUsers.add(other.user.id);
const doc = { schemaVersion: 2, partLibraryVersion: 1, environmentId: 'classic', customParts: [], bricks: [] };
await check('durable private world creation', async () => {
  world = (await request('worlds', { method: 'POST', token: student.session.accessToken, body: { title: run, document: doc }, statuses: [201, 200] })).data.world;
  assert.equal(world.ownerId, student.user.id);
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/brick_worlds?id=eq.${world.id}&select=id,revision,document`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  const rows = await response.json();
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].document, doc);
  assert.equal(rows[0].revision, world.revision);
});
await check('private world denies another student and teacher', async () => {
  for (const token of [other.session.accessToken, teacherToken]) await request(`worlds/${world.id}`, { token, statuses: [403, 404] });
});
await check('concurrent saves yield one winner and one revision conflict', async () => {
  const outcomes = await Promise.all(['toy-room', 'sky-island'].map(environmentId => request(`worlds/${world.id}`, { method: 'PUT', token: student.session.accessToken, body: { expectedRevision: world.revision, document: { ...doc, environmentId } }, statuses: [200, 409] })));
  assert.deepEqual(outcomes.map(x => x.status).sort(), [200, 409]);
  world = outcomes.find(x => x.status === 200).data.world;
  assert.equal(world.revision, outcomes.find(x => x.status === 409).data.currentRevision);
  await assertAuthoritativeWorld(world);
});
await check('fresh login reloads authoritative saved document', async () => {
  const fresh = (await request('auth/login', { method: 'POST', body: { classCode: classroom.loginCode, username: run, password: initialPassword } })).data;
  const reopened = (await request(`worlds/${world.id}`, { token: fresh.session.accessToken })).data.world;
  assert.equal(reopened.revision, world.revision);
  assert.deepEqual(reopened.document, world.document);
});
await check('checkpoint restore persists and rejects a stale revision', async () => {
  const checkpoints = (await request(`worlds/${world.id}/checkpoints`, { token: student.session.accessToken })).data.checkpoints;
  assert(checkpoints.length > 0, 'Save must preserve a checkpoint');
  const checkpoint = checkpoints.find(item => item.revision === 1);
  assert(checkpoint, 'Initial document checkpoint must exist');
  const previousRevision = world.revision;
  world = (await request(`worlds/${world.id}/restore`, { method: 'POST', token: student.session.accessToken, body: { checkpointId: checkpoint.id, expectedRevision: previousRevision } })).data.world;
  assert.equal(world.revision, previousRevision + 1);
  assert.deepEqual(world.document, doc);
  await assertAuthoritativeWorld(world);
  await request(`worlds/${world.id}/restore`, { method: 'POST', token: student.session.accessToken, body: { checkpointId: checkpoint.id, expectedRevision: previousRevision }, statuses: [409] });
  const fresh = (await request('auth/login', { method: 'POST', body: { classCode: classroom.loginCode, username: run, password: initialPassword } })).data;
  const reopened = (await request(`worlds/${world.id}`, { token: fresh.session.accessToken })).data.world;
  assert.equal(reopened.revision, world.revision);
  assert.deepEqual(reopened.document, doc);
});
await check('direct browser-role database access denied', async () => {
  for (const token of [process.env.SUPABASE_ANON_KEY, student.session.accessToken]) {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/brick_worlds?select=id`, { headers: { apikey: process.env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    assert([401, 403].includes(response.status), `Direct table access unexpectedly returned ${response.status}`);
  }
});
const temporaryPassword = password();
await check('teacher reset invalidates old bearer and refresh', async () => {
  await request(`classes/${classroom.id}/students/${student.user.id}`, { method: 'PATCH', token: teacherToken, body: { temporaryPassword } });
  await request('me', { token: student.session.accessToken, statuses: [401, 403] });
  await request('auth/refresh', { method: 'POST', body: { refreshToken: student.session.refreshToken }, statuses: [400, 401, 403] });
});
await check('temporary login requires a new password before world access', async () => {
  const reset = (await request('auth/login', { method: 'POST', body: { classCode: classroom.loginCode, username: run, password: temporaryPassword } })).data;
  assert.equal(reset.user.resetRequired, true);
  await request('worlds', { token: reset.session.accessToken, statuses: [403] });
  currentPassword = password();
  student = (await request('auth/change-password', { method: 'POST', token: reset.session.accessToken, body: { password: currentPassword } })).data;
  assert.equal(student.user.resetRequired, false);
  const reopened = (await request(`worlds/${world.id}`, { token: student.session.accessToken })).data.world;
  assert.equal(reopened.ownerId, student.user.id);
});
await check('teacher rename preserves world ownership', async () => {
  const renamed = `${run}_new`;
  await request(`classes/${classroom.id}/students/${student.user.id}`, { method: 'PATCH', token: teacherToken, body: { username: renamed } });
  const roster = (await request(`classes/${classroom.id}/students`, { token: teacherToken })).data.students;
  assert.equal(roster.find(s => s.id === student.user.id).username, renamed);
  await request('auth/login', { method: 'POST', body: { classCode: classroom.loginCode, username: run, password: currentPassword }, statuses: [401] });
  const fresh = (await request('auth/login', { method: 'POST', body: { classCode: classroom.loginCode, username: renamed, password: currentPassword } })).data;
  assert.equal(fresh.user.id, student.user.id);
  assert.equal(fresh.user.username, renamed);
  student = fresh;
  const reopened = (await request(`worlds/${world.id}`, { token: fresh.session.accessToken })).data.world;
  assert.equal(reopened.ownerId, student.user.id);
  assert.deepEqual(reopened.document, world.document);
  await assertAuthoritativeWorld(reopened);
});
await check('close enrollment denies new account creation', async () => {
  await request(`classes/${classroom.id}`, { method: 'PATCH', token: teacherToken, body: { enrollmentOpen: false } });
  await request('auth/register', { method: 'POST', body: { classCode: classroom.code, username: `${run}_c`, password: password(), rosterName: 'Denied fixture' }, statuses: [403, 404] });
});
 } catch (error) {
  failure = error;
} finally {
  // Recover accounts created before a response/check failed, scoped to this new fixture class.
  let rosterCleanupFailure = 0;
  try {
    const roster = (await request(`classes/${classroom.id}/students`, { token: teacherToken })).data.students;
    for (const fixture of roster) fixtureUsers.add(fixture.id);
  } catch { rosterCleanupFailure = 1; }
  // Keep fixture evidence but always attempt every access shutdown, even after failure.
  const cleanup = await Promise.allSettled([
    ...[...fixtureUsers].map(userId => request(`classes/${classroom.id}/students/${userId}`, { method: 'PATCH', token: teacherToken, body: { suspended: true } })),
    request(`classes/${classroom.id}`, { method: 'PATCH', token: teacherToken, body: { enrollmentOpen: false, collaborationOpen: false } }),
  ]);
  const cleanupFailures = rosterCleanupFailure + cleanup.filter(result => result.status === 'rejected').length;
  const report = { run, api: base, completedAt: new Date().toISOString(), classId: classroom.id, worldId: world?.id, checks: results, passed: !failure && !cleanupFailures, cleanupFailures, limitations: ['No browser interactions or real students tested', 'Live sockets and classroom-NAT throughput require separate verification'] };
  if (process.env.CLASSROOM_TEST_REPORT) await writeFile(process.env.CLASSROOM_TEST_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (cleanupFailures) failure ??= new Error(`Fixture access shutdown failed for ${cleanupFailures} operations; inspect class ${classroom.id}`);
}
if (failure) throw failure;
