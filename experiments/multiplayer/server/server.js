import { DEFAULT_PORT, createBrickRelay } from './relay.js'

const port = Number(process.env.PORT) || DEFAULT_PORT
const relay = createBrickRelay({
  port,
  log: (line) => console.log(`[relay] ${line}`),
})

relay.ready.then(
  (boundPort) => {
    console.log(`Brick Studio relay listening on ws://localhost:${boundPort}`)
    console.log('Start the app with `npm run dev` at the repo root, then open')
    console.log(`two browser tabs at http://localhost:5173/?room=ABC to build together.`)
  },
  (error) => {
    console.error(`Relay failed to start on port ${port}:`, error.message)
    process.exitCode = 1
  },
)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    relay.close().then(() => process.exit(0))
  })
}
