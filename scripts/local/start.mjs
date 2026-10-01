/** Run from any directory: node /path/to/scripts/local/start.mjs [--prepare] [--reset]. Local processes only. */
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createLocalFixture, startLocalFixtureServer } from './fixture-server.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const runtime = resolve(tmpdir(), `brickgineers-local-${createHash('sha256').update(root).digest('hex').slice(0, 12)}`)
const ports = { app: 5185, fixture: 8798, worker: 8799, inspector: 9235 }
const appOrigin = `http://127.0.0.1:${ports.app}`, fixtureOrigin = `http://127.0.0.1:${ports.fixture}`, workerOrigin = `http://127.0.0.1:${ports.worker}`
const stateFile = resolve(runtime, 'classroom-fixture.json')
const assertFree = async (port) => new Promise((done, reject) => {
  const probe = createServer(); probe.once('error', reject); probe.listen(port, '127.0.0.1', () => probe.close(done))
})
if (process.argv.includes('--reset')) {
  // Never replace fixture/DO files underneath a running setup.
  for (const port of Object.values(ports)) await assertFree(port)
  rmSync(runtime, { recursive: true, force: true })
}
mkdirSync(runtime, { recursive: true, mode: 0o700 })
const fixture = createLocalFixture({ stateFile })
fixture.persist()
const configuration = {
  name: 'brickgineers-local-manual-test', main: resolve(root, 'multiplayer/worker/src/index.ts'), compatibility_date: '2026-08-27',
  durable_objects: { bindings: [
    { name: 'RACE_ROOMS', class_name: 'RaceRoom' }, { name: 'WORLD_ROOMS', class_name: 'WorldRoom' },
    { name: 'WORLD_CREATION_LIMITER', class_name: 'WorldCreationLimiter' }, { name: 'PLATFORMER_ROOMS', class_name: 'PlatformerRoom' }] },
  migrations: [{ tag: 'local-v1', new_sqlite_classes: ['RaceRoom', 'WorldRoom', 'WorldCreationLimiter', 'PlatformerRoom'] }],
  vars: { SUPABASE_URL: fixtureOrigin, SUPABASE_SERVICE_ROLE_KEY: 'LOCAL_FIXTURE_DUMMY_KEY', SUPABASE_ANON_KEY: 'LOCAL_FIXTURE_DUMMY_KEY',
    CLASSROOM_TICKET_SECRET: 'LOCAL_ONLY_MANUAL_TEST_TICKET_SECRET_2026_10_01',
    BRICK_TEACHER_IDS: fixture.classroom.db.users.filter(u => u.role === 'teacher').map(u => u.id).join(',') },
}
const configFile = resolve(runtime, 'wrangler.json')
writeFileSync(configFile, JSON.stringify(configuration, null, 2), { mode: 0o600 })
writeFileSync(resolve(runtime, 'accounts.json'), JSON.stringify(fixture.info(), null, 2), { mode: 0o600 })

console.log(`Local manual test setup: ${appOrigin}/join`)
console.log(`Accounts, class code and world IDs: ${runtime}/accounts.json`)
console.log(`State survives restarts in ${runtime}. --reset replaces synthetic data and local rooms.`)
console.log('Provider boundary: fake local accounts/storage; real Worker invites, tickets and Durable Object rooms. No SQL/RLS/OAuth proof.')
if (process.argv.includes('--prepare')) {
  console.log(`Prepared configuration ${configFile}; no servers started.`)
} else {
  const children = []
  let localServer, stopping = false
  const stop = async (code = 0) => {
    if (stopping) return
    stopping = true
    for (const child of children) child.kill('SIGTERM')
    // Vite/Worker sockets can be long-lived; close our API listener before exiting.
    localServer?.server.closeAllConnections()
    await localServer?.close()
    setTimeout(() => { for (const child of children) child.kill('SIGKILL'); process.exit(code) }, 1500).unref()
  }
  process.on('SIGINT', () => void stop()); process.on('SIGTERM', () => void stop())
  try {
    for (const port of Object.values(ports)) await assertFree(port)
    for (const bin of ['vite', 'wrangler']) if (!existsSync(resolve(root, `node_modules/.bin/${bin}`))) throw new Error(`Missing ${bin}; run npm install in the worktree first.`)
    localServer = await startLocalFixtureServer({ port: ports.fixture, workerOrigin, stateFile })
    // Supply a clean child environment. The generated Worker configuration lives outside the repo's .env/.dev.vars files.
    const baseEnv = Object.fromEntries(['PATH', 'HOME', 'TMPDIR', 'USER', 'SHELL', 'LANG'].flatMap(key => process.env[key] ? [[key, process.env[key]]] : []))
    Object.assign(baseEnv, { WRANGLER_SEND_METRICS: 'false', CI: '1' })
    const launch = (bin, args, cwd, env = {}) => {
      const child = spawn(process.execPath, [resolve(root, `node_modules/.bin/${bin}`), ...args], { cwd, env: { ...baseEnv, ...env }, stdio: 'inherit' })
      children.push(child)
      child.once('error', error => { console.error(error.message); void stop(1) })
      child.once('exit', code => { if (!stopping) { console.error(`${bin} stopped (${code}); stopping local setup.`); void stop(code || 1) } })
    }
    launch('wrangler', ['dev', '--local', '--config', configFile, '--ip', '127.0.0.1', '--port', String(ports.worker),
      '--inspector-port', String(ports.inspector), '--persist-to', resolve(runtime, 'worker-state')], runtime)
    // The app needs an HTML public-origin value, and all three service URLs are explicitly localhost.
    launch('vite', ['--host', '127.0.0.1', '--port', String(ports.app), '--strictPort'], root, {
      VITE_PUBLIC_ORIGIN: appOrigin, VITE_CLASSROOM_SERVER_URL: fixtureOrigin, VITE_LIVE_SERVER_URL: workerOrigin, VITE_RACE_SERVER_URL: workerOrigin,
    })
    console.log(`Fixture health: ${fixtureOrigin}/__local/health; accounts: ${fixtureOrigin}/__local/info`)
    console.log('Press Ctrl+C to stop the complete local setup.')
  } catch (error) { console.error(error.message); await stop(1); process.exitCode = 1 }
}
