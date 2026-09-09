// Actual Worker WebSockets + authoritative Supabase rows. Dedicated fixtures only.
// Same environment contract as verify-classroom-provider.mjs; Node 22+ WebSocket.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
for (const key of ['CLASSROOM_TEST_API', 'CLASSROOM_TEST_TEACHER_EMAIL', 'CLASSROOM_TEST_TEACHER_PASSWORD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) assert(process.env[key], `Missing ${key}`);
assert.equal(process.env.CLASSROOM_TEST_ALLOW_FIXTURES, 'yes', 'Explicit fixture flag required');
const base = process.env.CLASSROOM_TEST_API.replace(/\/$/, '');
const run = `live_${Date.now().toString(36)}`;
const checks = [], sockets = [], students = [];
let teacher, classroom, world;
const doc = { schemaVersion: 2, partLibraryVersion: 1, environmentId: 'classic', customParts: [], bricks: [] };
async function api(path, token, method = 'GET', body, statuses = [200]) {
  const response = await fetch(`${base}/classroom/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(45_000) });
  const raw = await response.text();
  let data;
  try { data = JSON.parse(raw); } catch { throw new Error(`${method} ${path}: HTTP ${response.status}, non-JSON response ${raw.slice(0, 180)}`); }
  assert.ok(statuses.includes(response.status), `${method} ${path}: ${response.status} ${data.code || ''}`);
  return data;
}
async function check(name, action) { await action(); checks.push(name); console.log(`PASS ${name}`); }
function connect(ticket) {
  const url = new URL(`${base}/worlds/${world.id.replaceAll('-', '')}/connect`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('ticket', ticket);
  const socket = new WebSocket(url), messages = [], waiters = new Set();
  let closed;
  function notify() { for (const next of waiters) next(); }
  socket.addEventListener('message', event => { messages.push(JSON.parse(String(event.data))); notify(); });
  socket.addEventListener('close', event => { closed = { code: event.code, reason: event.reason }; notify(); });
  socket.addEventListener('error', () => notify());
  function wait(predicate, label) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { waiters.delete(next); reject(new Error(`Timed out: ${label}`)); }, 45_000);
      function next() {
        try {
          const found = predicate();
          if (found !== undefined) { clearTimeout(timer); waiters.delete(next); resolve(found); }
        } catch (error) { clearTimeout(timer); waiters.delete(next); reject(error); }
      }
      waiters.add(next); next();
    });
  }
  const client = { socket, send: value => socket.send(JSON.stringify({ v: 1, ...value })),
    next: (type, opId) => wait(() => {
      const rejected = messages.find(m => (m.type === 'error' || m.type === 'reject') && (!opId || !m.opId || m.opId === opId));
      if (rejected) throw new Error(`Socket ${type} rejected: ${rejected.code}`);
      const index = messages.findIndex(m => m.type === type && (!opId || m.opId === opId));
      if (index >= 0) return messages.splice(index, 1)[0];
      if (closed) throw new Error(`Socket closed before ${type}: ${closed.code}`);
      return undefined;
    }, `${type} ${opId || ''}`),
    closed: () => wait(() => closed, 'socket revocation'),
  };
  sockets.push(client); return client;
}
async function ticket(student) { return (await api(`worlds/${world.id}/live-ticket`, student.session.accessToken, 'POST')).ticket; }
async function upgradeStatus(ticketValue) {
  const url = new URL(`${base}/worlds/${world.id.replaceAll('-', '')}/connect`);
  url.searchParams.set('ticket', ticketValue);
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      headers: { Upgrade: 'websocket', Connection: 'Upgrade', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64') },
    });
    request.setTimeout(30_000, () => request.destroy(new Error('Upgrade verification timed out')));
    request.on('response', response => { response.resume(); resolve(response.statusCode); });
    request.on('upgrade', (response, socket) => { socket.destroy(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end();
  });
}
async function authoritative() {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/brick_worlds?id=eq.${world.id}&select=id,revision,document`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200);
  const rows = await response.json(); assert.equal(rows.length, 1); return rows[0];
}
let failure;
try {
  teacher = await api('auth/teacher-login', null, 'POST', { email: process.env.CLASSROOM_TEST_TEACHER_EMAIL, password: process.env.CLASSROOM_TEST_TEACHER_PASSWORD });
  classroom = (await api('classes', teacher.session.accessToken, 'POST', { name: `Live verification ${run}` }, [201])).class;
  for (const suffix of ['a', 'b']) students.push(await api('auth/register', null, 'POST', { classCode: classroom.code, username: `${run}_${suffix}`, rosterName: 'Live provider test fixture', password: `Qa!${randomBytes(20).toString('hex')}` }, [201]));
  world = (await api('worlds', teacher.session.accessToken, 'POST', { title: run, kind: 'group', classId: classroom.id, document: doc }, [201])).world;
  for (const student of students) await api(`worlds/${world.id}/members`, teacher.session.accessToken, 'POST', { userId: student.user.id });
  const oldTicket = await ticket(students[0]);
  let a = connect(oldTicket);
  const b = connect(await ticket(students[1]));
  await check('two authenticated sockets receive stable identities and same initial document', async () => {
    const [first, second] = await Promise.all([a.next('welcome'), b.next('welcome')]);
    assert.equal(first.playerId, students[0].user.id); assert.equal(second.playerId, students[1].user.id);
    assert.deepEqual(first.document, doc); assert.deepEqual(second.document, doc);
    assert.equal(first.revision, world.revision); assert.equal(second.revision, world.revision);
  });
  const bricks = [0, 4].map((x, i) => ({ id: `${run}_${i}`, partId: 'brick_1x1', x, y: 0, z: 0, rotation: 0, color: '#ff0000' }));
  await check('concurrent edits broadcast consistently and are committed in authoritative database', async () => {
    const operations = students.map(student => `${student.user.id}#1`);
    a.send({ type: 'commands', opId: operations[0], commands: [{ op: 'place', brick: bricks[0] }] });
    b.send({ type: 'commands', opId: operations[1], commands: [{ op: 'place', brick: bricks[1] }] });
    const [a1, a2, b1, b2] = await Promise.all([a.next('apply', operations[0]), a.next('apply', operations[1]), b.next('apply', operations[0]), b.next('apply', operations[1])]);
    assert.equal(a1.revision, b1.revision); assert.equal(a2.revision, b2.revision);
    assert.deepEqual([a1.revision, a2.revision].sort(), [world.revision + 1, world.revision + 2]);
    const stored = await authoritative();
    assert.equal(stored.revision, world.revision + 2);
    assert.deepEqual(stored.document.bricks.sort((x, y) => x.id.localeCompare(y.id)), bricks);
  });
  await check('teacher password reset revokes active socket and old ticket until password replacement', async () => {
    const resetTicket = await ticket(students[0]), resetTicketIssuedAt = Date.now();
    const temporaryPassword = `Qa!${randomBytes(20).toString('hex')}`;
    await api(`classes/${classroom.id}/students/${students[0].user.id}`, teacher.session.accessToken, 'PATCH', { temporaryPassword });
    assert.equal((await a.closed()).code, 4003);
    assert.ok(Date.now() - resetTicketIssuedAt < 55_000, 'Reset ticket must remain unexpired');
    assert.ok([401, 403, 404].includes(await upgradeStatus(resetTicket)));
    const reset = await api('auth/login', null, 'POST', { classCode: classroom.loginCode, username: students[0].user.username, password: temporaryPassword });
    assert.equal(reset.user.resetRequired, true);
    await api(`worlds/${world.id}/live-ticket`, reset.session.accessToken, 'POST', undefined, [403]);
    students[0] = await api('auth/change-password', reset.session.accessToken, 'POST', { password: `Qa!${randomBytes(20).toString('hex')}` });
    assert.equal(students[0].user.resetRequired, false);
    a = connect(await ticket(students[0]));
    const welcome = await a.next('welcome');
    assert.equal(welcome.document.bricks.length, 2);
    assert.equal((await authoritative()).document.bricks.length, 2);
  });
  await check('removing group member closes active socket and preserves contributions', async () => {
    const removalTicket = await ticket(students[0]), removalTicketIssuedAt = Date.now();
    await api(`worlds/${world.id}/members/${students[0].user.id}`, teacher.session.accessToken, 'DELETE');
    assert.equal((await a.closed()).code, 4003);
    await api(`worlds/${world.id}/live-ticket`, students[0].session.accessToken, 'POST', undefined, [403, 404]);
    assert.ok(Date.now() - removalTicketIssuedAt < 55_000, 'Ticket must remain unexpired to prove membership revocation');
    const status = await upgradeStatus(removalTicket);
    assert.ok([401, 403, 404].includes(status), `Removed member old ticket: ${status}`);
    assert.equal((await authoritative()).document.bricks.length, 2);
  });
  await check('closing class revokes remaining socket and blocks group discovery', async () => {
    await api(`classes/${classroom.id}`, teacher.session.accessToken, 'PATCH', { collaborationOpen: false });
    assert.equal((await b.closed()).code, 4003);
    await api(`worlds/${world.id}/live-ticket`, students[1].session.accessToken, 'POST', undefined, [403, 404]);
    const list = await api('worlds', students[1].session.accessToken);
    assert.ok(!list.worlds.some(item => item.id === world.id));
  });
  await check('reopened class cold socket loads persisted edits', async () => {
    await api(`classes/${classroom.id}`, teacher.session.accessToken, 'PATCH', { collaborationOpen: true });
    const fresh = connect(await ticket(students[1]));
    const welcome = await fresh.next('welcome'), stored = await authoritative();
    assert.equal(welcome.revision, stored.revision); assert.deepEqual(welcome.document, stored.document);
    assert.equal(welcome.document.bricks.length, 2);
  });
} catch (error) { failure = error; }
finally {
  for (const client of sockets) client.socket.close();
  if (teacher && classroom) {
    try {
      await api(`classes/${classroom.id}`, teacher.session.accessToken, 'PATCH', { enrollmentOpen: false, collaborationOpen: false });
      for (const student of students) await api(`classes/${classroom.id}/students/${student.user.id}`, teacher.session.accessToken, 'PATCH', { suspended: true });
    } catch (error) { failure ||= error; }
  }
}
const report = { run, api: base, completedAt: new Date().toISOString(), classId: classroom?.id, worldId: world?.id, success: !failure, checks, limitations: ['No rendered browser, real classroom students, weak-device performance, or classroom-NAT load tested'] };
if (process.env.CLASSROOM_TEST_REPORT) await writeFile(process.env.CLASSROOM_TEST_REPORT, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (failure) { console.error(failure.message); process.exitCode = 1; }
