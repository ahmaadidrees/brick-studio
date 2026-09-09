// Real authenticated classroom capacity measurement. Dedicated fixtures only.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
for (const key of ['CLASSROOM_TEST_API', 'CLASSROOM_TEST_TEACHER_EMAIL', 'CLASSROOM_TEST_TEACHER_PASSWORD', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) assert(process.env[key], `Missing ${key}`);
assert.equal(process.env.CLASSROOM_TEST_ALLOW_FIXTURES, 'yes');
const base = process.env.CLASSROOM_TEST_API.replace(/\/$/, '');
const run = `capacity_${Date.now().toString(36)}`;
const students = [], clients = [], connectMs = [], editMs = [], errors = [];
let teacher, classroom, world, poseTimer, failure;
let sentPoses = 0, receivedPoses = 0, totalEdits = 0;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function api(path, token, method = 'GET', body) {
  const response = await fetch(`${base}/classroom/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45_000) });
  const data = await response.json();
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${data.code || ''}`);
  return data;
}
async function batches(items, width, action) { for (let i = 0; i < items.length; i += width) await Promise.all(items.slice(i, i + width).map(action)); }
function connect(auth) {
  return (async () => {
    const start = performance.now();
    const { ticket } = await api(`worlds/${world.id}/live-ticket`, auth.session.accessToken, 'POST');
    const url = new URL(`${base}/worlds/${world.id.replaceAll('-', '')}/connect`);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('ticket', ticket);
    const socket = new WebSocket(url), operations = new Map();
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
          client.send({ type: 'commands', opId, commands: [{ op: 'place', brick: { id: `${run}_${index}_${sequence}`, partId: 'brick_1x1', x: (index % 10) * 2, y: sequence - 1, z: Math.floor(index / 10) * 2, rotation: 0, color: '#ff0000' } }] });
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
    await ready; return client;
  })();
}
function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b), at = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? null;
  return { count: sorted.length, medianMs: at(.5), p95Ms: at(.95), maxMs: at(1) };
}
async function authoritative() {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/brick_worlds?id=eq.${world.id}&select=revision,document`, { headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }, signal: AbortSignal.timeout(30_000) });
  assert.equal(response.status, 200); return (await response.json())[0];
}
const startedAt = new Date().toISOString();
let workloadMs = null, registrationMs = null, persisted = false, allClientsConverged = false, cleanupFailures = 0;
try {
  teacher = await api('auth/teacher-login', null, 'POST', { email: process.env.CLASSROOM_TEST_TEACHER_EMAIL, password: process.env.CLASSROOM_TEST_TEACHER_PASSWORD });
  classroom = (await api('classes', teacher.session.accessToken, 'POST', { name: `Dedicated classroom capacity ${run}` })).class;
  const registrationStart = performance.now();
  await batches(Array.from({ length: 30 }, (_, i) => i), 5, async i => {
    students[i] = await api('auth/register', null, 'POST', { classCode: classroom.code, username: `cap_${Date.now().toString(36)}_${i}`, rosterName: 'Dedicated capacity fixture', password: `Qa!${randomBytes(18).toString('hex')}` });
  });
  registrationMs = performance.now() - registrationStart;
  console.log('PASS 30 dedicated student accounts registered');
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
    await batches(students.filter(Boolean), 3, async student => { try { await api(`classes/${classroom.id}/students/${student.user.id}`, teacher.session.accessToken, 'PATCH', { suspended: true }); } catch { cleanupFailures++; } });
  }
  const report = { run, api: base, startedAt, completedAt: new Date().toISOString(), classId: classroom?.id, worldId: world?.id, studentCount: students.filter(Boolean).length, registrationMs, registrationConcurrency: 5, connectedClients: connectMs.length, connection: distribution(connectMs), editAcknowledgement: distribution(editMs), totalEdits, workloadMs, sentPoses, receivedPoses, errors, persisted, allClientsConverged, cleanupFailures, passed: !failure && cleanupFailures === 0, ...(failure ? { failure } : {}), limitations: ['31 Node WebSocket clients on one machine, not 31 physical Chromebooks', 'No rendered scenes, GPU/frame-rate or real student interaction measured', 'Workload: three concurrent editors at a time, 60 total small edits, 30 clients sending poses at 2Hz', 'Not a saturation/load-to-failure test; no classroom Wi-Fi or geographic distribution simulated'] };
  if (process.env.CLASSROOM_TEST_REPORT) await writeFile(process.env.CLASSROOM_TEST_REPORT, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2)); if (failure || cleanupFailures) process.exitCode = 1;
}
