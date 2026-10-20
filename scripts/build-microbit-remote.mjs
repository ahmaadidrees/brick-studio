// Builds public/microbit/brickgineers-remote.hex: the vendored MicroPython V2 firmware plus firmware/remote/main.py.
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MicropythonFsHex, microbitBoardId } from '@microbit/microbit-fs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorHex = resolve(root, 'firmware/remote/vendor/micropython-microbit-v2.1.2.hex')
const vendorSha256 = '66fae07b71777e9e3a6b5122a27930b24cc0be5002ab9a67e92494c54a1645ef'
const mainPy = resolve(root, 'firmware/remote/main.py')
const out = resolve(root, 'public/microbit/brickgineers-remote.hex')

const base = readFileSync(vendorHex, 'utf8')
const sha = createHash('sha256').update(readFileSync(vendorHex)).digest('hex')
if (sha !== vendorSha256) throw new Error(`Vendored MicroPython hex has SHA-256 ${sha}, expected ${vendorSha256}`)

const fs = new MicropythonFsHex([{ hex: base, boardId: microbitBoardId.V2 }])
fs.write('main.py', readFileSync(mainPy, 'utf8'))
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, fs.getIntelHex(microbitBoardId.V2))
console.log(`Wrote ${out} (main.py ${fs.size('main.py')} bytes, flash fs ${fs.getStorageUsed()}/${fs.getStorageSize()} used)`)
