// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MicropythonFsHex, microbitBoardId } from '@microbit/microbit-fs'

const root = resolve(__dirname, '../..')
const builtHex = resolve(root, 'public/microbit/brickgineers-remote.hex')
const vendorHex = resolve(root, 'firmware/remote/vendor/micropython-microbit-v2.1.2.hex')
const mainPy = readFileSync(resolve(root, 'firmware/remote/main.py'), 'utf8')

describe('brickgineers-remote.hex', () => {
  it('exists', () => {
    expect(existsSync(builtHex)).toBe(true)
  })

  it('parses and contains main.py identical to firmware/remote/main.py', () => {
    const fs = new MicropythonFsHex([{ hex: readFileSync(vendorHex, 'utf8'), boardId: microbitBoardId.V2 }])
    const files = fs.importFilesFromHex(readFileSync(builtHex, 'utf8'), { overwrite: true, formatFirst: true })
    expect(files).toEqual(['main.py'])
    expect(fs.read('main.py')).toBe(mainPy)
  })
})
