// Real authenticated classroom capacity measurement. Dedicated fixtures only.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Agent, setGlobalDispatcher, WebSocket } from 'undici';
import { capacityFixtureBrick } from './classroom/capacity-fixture.ts';
// Explicit IPv4 avoids this host's observed intermittent IPv6 route failures.
const dispatcher = new Agent({ connect: { family: 4, timeout: 30_000 } });
setGlobalDispatcher(dispatcher);
for (const key of ['CLASSROOM_TEST_API', 'CLASSROOM_TEST_TEACHER_EMAIL', 'CLASSROOM_TEST_TEACHER_PASSWORD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) assert(process.env[key], `Missing ${key}`);
assert.equal(process.env.CLASSROOM_TEST_ALLOW_FIXTURES, 'yes');
const base = process.env.CLASSROOM_TEST_API.replace(/\/$/, '');
const run = `capacity_${Date.now().toString(36)}`;
const students = [], clients = [], connectMs = [], editMs = [], errors = [];
const fixtureUserIds = new Set();
let teacher, classroom, world, poseTimer, failure;
let sentPoses = 0, receivedPoses = 0, totalEdits = 0;
let transportRetries = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function transportFetch(url, init, retrySafe = true) {
  for (let attempt = 0; ; attempt++) {
    try { return await fetch(url, { ...init, signal: AbortSignal.timeout(45_000) }); }
    catch (error) {
      if (!retrySafe || attempt >= 2) throw error;
      transportRetries++; await pause(500 * (attempt + 1));
    }
  }
}
async function api(path, token, method = 'GET', body) {
  const retrySafe = method === 'GET' || method === 'PATCH' || path.endsWith('/live-ticket') || path === 'auth/login' || path === 'auth/teacher-login';
  const response = await transportFetch(`${base}/classroom/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45_000) }, retrySafe);
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${data.code || ''}`);
  return data;
}
async function batches(items, width, action) { for (let i = 0; i < items.length; i += width) await Promise.all(items.slice(i, i + width).map(item => action(item))); }
function connect(auth, attempt = 0) {
  return (async () => {
    const start = performance.now();
    const { ticket } = await api(`worlds/${world.id}/live-ticket`, auth.session.accessToken, 'POST');
    const url = new URL(`${base}/worlds/${world.id.replaceAll('-', '')}/connect`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('ticket', ticket);
    const socket = new WebSocket(url, { dispatcher }), operations = new Map();
    let welcomeResolve, welcomeReject;
    const ready = new Promise((resolve, reject) => { welcomeResolve = resolve; welcomeReject = reject; });
    const timer = setTimeout(() => welcomeReject(new Error('Timed out waiting for classroom welcome')), 45_000);
    const client = { socket, auth, revision: 0, applies: 0, operations,
      send: message => socket.send(JSON.stringify({ v: 1, ...message })),
      edit(sequence, index) {
        const opId = `${auth.user.id}#${sequence}`, started = performance.now();
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { operations.delete(opId); reject(new Error('Timed out waiting for durable edit acknowledgement')); }, 60_000);
          operations.set(opId, { resolve: () => { clearTimeout(timeout); editMs.push(performance.now() - started); resolve(); }, reject: error => { clearTimeout(timeout); reject(error); } });
          client.send({ type: 'commands', opId, commands: [{ op: 'place', brick: capacityFixtureBrick(index, sequence, run) }] });
        });
      },
    };
    clients.push(client);
    socket.addEventListener('message', event => {
      let message; try { message = JSON.parse(String(event.data)); } catch { welcomeReject(new Error('Non-JSON socket response')); return; }
      if (message.type === 'welcome') { clearTimeout(timer); client.revision = message.revision; connectMs.push(performance.now() - start); welcomeResolve(); }
      if (message.type === 'pose') receivedPoses++;
      if (message.type === 'apply') { client.revision = message.revision; client.applies++; operations.get(message.opId)?.resolve(); operations.delete(message.opId); }
      if (message.type === 'error' || message.type === 'reject') {
        errors.push({ code: message.code, phase: 'socket' });
        const error = new Error(`Socket rejected operation: ${message.code}`);
        if (message.opId) { operations.get(message.opId)?.reject(error); operations.delete(message.opId); }
        else welcomeReject(error);
      }
    });
    socket.addEventListener('error', () => welcomeReject(new Error('Classroom connection failed')));
    socket.addEventListener('close', () => { clearTimeout(timer); welcomeReject(new Error('Classroom connection closed')); for (const pending of operations.values()) pending.reject(new Error('Socket closed before acknowledgement')); operations.clear(); });
    try {
      await ready;
      if (connectMs.length % 5 === 0) console.log(`PROGRESS ${connectMs.length}/31 clients welcomed`);
      return client;
    } catch (error) {
      clearTimeout(timer); socket.close(); clients.splice(clients.indexOf(client), 1);
      if (attempt < 2 && ['Classroom connection failed', 'Classroom connection closed', 'Timed out waiting for classroom welcome'].includes(error.message)) {
        transportRetries++; await pause(500 * (attempt + 1)); return connect(auth, attempt + 1);
      }
      throw error;
    }
  })();
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b), at = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
  return { count: sorted.length, medianMs: at(.5), p95Ms: at(.95), maxMs: at(1) };
}
async function authoritative() {
  const response = await transportFetch(`${process.env.SUPABASE_URL}/rest/v1/brick_worlds?id=eq.${world.id}&select=revision,document`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200); return (await response.json())[0];
}
const startedAt = new Date().toISOString();
let workloadMs = null, registrationMs = null, persisted = false, allClientsConverged = false, cleanupFailures = 0;
try {
  teacher = await api('auth/teacher-login', null, 'POST', { email: process.env.CLASSROOM_TEST_TEACHER_EMAIL, password: process.env.CLASSROOM_TEST_TEACHER_PASSWORD });
  const registrationStart = performance.now();
  if (process.env.CLASSROOM_CAPACITY_REUSE_CLASS) {
    const classes = (await api('classes', teacher.session.accessToken)).classes;
    classroom = classes.find(cls => cls.id === process.env.CLASSROOM_CAPACITY_REUSE_CLASS);
    assert(classroom?.name.startsWith('Dedicated classroom capacity '), 'Only a dedicated capacity fixture class owned by the QA teacher may be reused');
    const roster = (await api(`classes/${classroom.id}/students`, teacher.session.accessToken)).students;
    assert.equal(roster.length, 30); assert(roster.every(student => student.rosterName === 'Dedicated capacity fixture' && student.suspended), 'Fixture reuse requires all30 labeled students already suspended');
    for (const student of roster) fixtureUserIds.add(student.id);
    classroom = (await api(`classes/${classroom.id}`, teacher.session.accessToken, 'PATCH', { collaborationOpen: true })).class;
    await batches(roster.map((student, index) => ({ student, index })), 5, async ({ student, index }) => {
      const password = `Qa!${randomBytes(18).toString('hex')}`;
      const updated = await transportFetch(`${process.env.SUPABASE_URL}/auth/v1/admin/users/${student.id}`, { method: 'PUT', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }), signal: AbortSignal.timeout(30_000) });
      assert.equal(updated.status, 200, 'Dedicated fixture credential refresh failed');
      await api(`classes/${classroom.id}/students/${student.id}`, teacher.session.accessToken, 'PATCH', { suspended: false });
      students[index] = await api('auth/login', null, 'POST', { classCode: classroom.loginCode, username: student.username, password });
    });
  } else {
    classroom = (await api('classes', teacher.session.accessToken, 'POST', { name: `Dedicated classroom capacity ${run}` })).class;
    await batches(Array.from({ length: 30 }, (_, i) => i), 5, async i => {
      students[i] = await api('auth/register', null, 'POST', { classCode: classroom.code, username: `cap_${Date.now().toString(36)}_${i}`, rosterName: 'Dedicated capacity fixture', password: `Qa!${randomBytes(18).toString('hex')}` });
      fixtureUserIds.add(students[i].user.id);
    });
  }
  registrationMs = performance.now() - registrationStart;
  console.log('PASS 30 dedicated student accounts authenticated');
  world = (await api('worlds', teacher.session.accessToken, 'POST', { title: run, kind: 'class', classId: classroom.id, document: { schemaVersion: 2, partLibraryVersion: 1, environmentId: 'classic', customParts: [], bricks: [] } })).world;
  await connect(teacher);
  await batches(students, 3, connect);
  assert.equal(clients.length, 31); assert(clients.every(client => client.socket.readyState === WebSocket.OPEN));
  console.log('PASS 30 students and teacher connected simultaneously');
  const editingClients = students.map(student => clients.find(client => client.auth.user.id === student.user.id));
  poseTimer = setInterval(() => { for (let i = 0; i < editingClients.length; i++) { const client = editingClients[i]; if (client.socket.readyState === WebSocket.OPEN) { client.send({ type: 'pose', x: i % 10, y: 1, z: Math.floor(i / 10), yaw: 0, moving: true, jumping: false }); sentPoses++; } } }, 500);
  const workloadStart = performance.now();
  for (const sequence of [1, 2]) {
    for (let i = 0; i < editingClients.length; i += 3) {
      await Promise.all(editingClients.slice(i, i + 3).map((client, offset) => client.edit(sequence, i + offset)));
      totalEdits += 3; await pause(250);
      if (totalEdits % 15 === 0) console.log(`PROGRESS ${totalEdits}/60 durable edits acknowledged`);
    }
  }
  workloadMs = performance.now() - workloadStart;
  clearInterval(poseTimer);
  await pause(1000);
  const stored = await authoritative();
  assert.equal(stored.revision, world.revision + 60); assert.equal(stored.document.bricks.length, 60);
  const ids = new Set(stored.document.bricks.map(brick => brick.id)); assert.equal(ids.size, 60);
  persisted = true;
  assert(clients.every(client => client.revision === stored.revision && client.applies === 60));
  allClientsConverged = true; assert.equal(errors.length, 0);
  console.log('PASS 60 durable edits persisted and converged across all 31 clients');
} catch (error) { failure = error instanceof Error ? error.message : 'Unknown failure'; }
finally {
  clearInterval(poseTimer); for (const client of clients) client.socket.close();
  if (teacher && classroom) {
    try { await api(`classes/${classroom.id}`, teacher.session.accessToken, 'PATCH', { enrollmentOpen: false, collaborationOpen: false }); } catch { cleanupFailures++; }
    await batches([...fixtureUserIds], 3, async id => { try { await api(`classes/${classroom.id}/students/${id}`, teacher.session.accessToken, 'PATCH', { suspended: true }); } catch { cleanupFailures++; } });
  }
  const report = { run, api: base, startedAt, completedAt: new Date().toISOString(), classId: classroom?.id, worldId: world?.id, studentCount: students.filter(Boolean).length, registrationMs, registrationConcurrency: 5, connectedClients: connectMs.length, connection: distribution(connectMs), editAcknowledgement: distribution(editMs), totalEdits, workloadMs, sentPoses, receivedPoses, errors, persisted, allClientsConverged, cleanupFailures, passed: !failure && cleanupFailures === 0, ...(failure ? { failure } : {}), limitations: ['31 Node WebSocket clients on one machine, not 31 physical Chromebooks', 'No rendered scenes, GPU/frame-rate or real student interaction measured', 'Workload: three concurrent editors at a time, 60 total small edits, 30 clients sending poses at 2Hz', 'Not a saturation/load-to-failure test; no classroom Wi-Fi or geographic distribution simulated'] };
  report.fixtureSetupMode = process.env.CLASSROOM_CAPACITY_REUSE_CLASS ? 'reactivated dedicated fixtures with new temporary test credentials' : 'fresh self-registration';
  report.networkFamily = 'IPv4';
  report.transportRetries = transportRetries;
  if (process.env.CLASSROOM_TEST_REPORT) await writeFile(process.env.CLASSROOM_TEST_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); if (failure || cleanupFailures) process.exitCode = 1;
  await dispatcher.close();
}
