import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createBlankLevel, levelToJson } from '@brick-studio/platformer-core/engine/level'
import { RecoverySheet, recoveryWorldUuid } from './RecoverySheet'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../classroom/client', () => ({ browserClassroomClient: { request } }))

const worldId = '12345678-1234-1234-1234-123456789abc'
const summary = { id: 'copy-1', revision: 7, at: Date.UTC(2026, 8, 23, 12) }
const copy = { ...summary, worldId, level: levelToJson(createBlankLevel(40, 20, 'Saved world')) }
const show = () => render(<RecoverySheet open worldId={worldId} worldTitle="My Brick World" onClose={() => {}} />)

afterEach(() => {
  cleanup()
  request.mockReset()
  vi.restoreAllMocks()
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
})

it('expands room IDs to a stable UUID and rejects guest room IDs', () => {
  expect(recoveryWorldUuid('12345678123412341234123456789abc')).toBe(worldId)
  expect(recoveryWorldUuid(worldId)).toBe(worldId)
  expect(recoveryWorldUuid('guest-room')).toBeNull()
})

it('shows loading and an empty message', async () => {
  request.mockResolvedValueOnce({ copies: [], capacity: 5 })
  show()
  expect(screen.getByRole('status')).toHaveTextContent('Looking for recovery copies')
  expect(await screen.findByText('No recovery copies are available for this world.')).toBeInTheDocument()
  expect(request).toHaveBeenCalledWith(`/worlds/${worldId}/platformer-recovery`)
})

it('shows a retry after a list error', async () => {
  request.mockRejectedValueOnce(new Error('Could not connect')).mockResolvedValueOnce({ copies: [summary], capacity: 5 })
  show()
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not load recovery copies')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(await screen.findByText('Version 7')).toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(2)
})

it('downloads a 2D document copy without changing the open world', async () => {
  request.mockResolvedValueOnce({ copies: [summary], capacity: 5 }).mockResolvedValueOnce(copy)
  const blobUrl = vi.fn((_blob: Blob) => 'blob:recovery')
  const revoke = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: blobUrl })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke })
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('my-brick-world-recovery-v7-copy-1.json')
  })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Download copy' }))
  await waitFor(() => expect(click).toHaveBeenCalledOnce())
  expect(request.mock.calls.map((call) => call[0])).toEqual([
    `/worlds/${worldId}/platformer-recovery`,
    `/worlds/${worldId}/platformer-recovery/copy-1`,
  ])
  expect(blobUrl).toHaveBeenCalledOnce()
  expect(revoke).toHaveBeenCalledWith('blob:recovery')
  const blob = blobUrl.mock.calls[0][0] as Blob
  expect(blob.type).toBe('application/json')
  const document = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(JSON.parse(String(reader.result)) as Record<string, unknown>)
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
  expect(document).toMatchObject({ format: 'brickgineers-2d', version: 1, level: { title: 'Saved world' } })
})

it('refuses a copy returned for another world', async () => {
  request.mockResolvedValueOnce({ copies: [summary], capacity: 5 }).mockResolvedValueOnce({ ...copy, worldId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' })
  const blobUrl = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: blobUrl })
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Download copy' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Could not download this copy')
  expect(blobUrl).not.toHaveBeenCalled()
})

it('names the dated copy in confirmation and refreshes only after confirmed removal', async () => {
  request.mockResolvedValueOnce({ copies: [summary], capacity: 5 })
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce({ copies: [], capacity: 5 })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  show()
  const remove = await screen.findByRole('button', { name: 'Remove copy' })
  fireEvent.click(remove)
  expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/saved .*Version 7/))
  expect(request).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Version 7')).toBeInTheDocument()
  fireEvent.click(remove)
  await waitFor(() => expect(request).toHaveBeenCalledWith(`/worlds/${worldId}/platformer-recovery/copy-1`, 'DELETE'))
  expect(await screen.findByText('No recovery copies are available for this world.')).toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(3)
})

it('keeps a copy visible when removal fails', async () => {
  request.mockResolvedValueOnce({ copies: [summary], capacity: 5 }).mockRejectedValueOnce(new Error('Network error'))
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  show()
  fireEvent.click(await screen.findByRole('button', { name: 'Remove copy' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('It is still here')
  expect(screen.getByText('Version 7')).toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(2)
})
