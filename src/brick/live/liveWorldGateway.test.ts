import { describe, expect, it, vi } from 'vitest'
import { createBrickStudioDocument } from '../brickDocument'
import type { CreateLiveWorldRequest } from '../liveProtocol'
import {
  createLiveWorldRoom,
  fetchLiveWorldSummary,
  LiveWorldGatewayError,
  resolveLiveServerBaseUrl,
} from './liveWorldGateway'

const request: CreateLiveWorldRequest = {
  title: 'Castle Class',
  document: createBrickStudioDocument([]),
  profile: { displayName: 'Ms. Rivera' },
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function textResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => { throw new Error('not json') },
  } as unknown as Response
}

describe('resolveLiveServerBaseUrl', () => {
  it('prefers the live server variable, trimming trailing slashes', () => {
    expect(resolveLiveServerBaseUrl({ VITE_LIVE_SERVER_URL: 'https://live.example/ ', VITE_RACE_SERVER_URL: 'https://race.example' }))
      .toBe('https://live.example')
  })

  it('falls back to the race worker origin, then localhost', () => {
    expect(resolveLiveServerBaseUrl({ VITE_RACE_SERVER_URL: 'https://race.example/' })).toBe('https://race.example')
    expect(resolveLiveServerBaseUrl({})).toBe('http://localhost:8787')
  })
})

describe('createLiveWorldRoom', () => {
  it('POSTs the typed request to /worlds and returns the room capability pair', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ roomId: 'ROOM1234', ownerToken: 'owner-secret' }))
    const created = await createLiveWorldRoom(request, { baseUrl: 'https://api.example/', fetch: fetcher })
    expect(created).toEqual({ roomId: 'ROOM1234', ownerToken: 'owner-secret' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://api.example/worlds')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual(request)
  })

  it('maps an unreachable service to a friendly typed error', async () => {
    const fetcher = vi.fn(async () => { throw new TypeError('fetch failed') })
    await expect(createLiveWorldRoom(request, { baseUrl: 'https://api.example', fetch: fetcher }))
      .rejects.toMatchObject({ code: 'unreachable', message: expect.stringMatching(/unreachable/i) })
  })

  it('reports a missing /worlds endpoint as not-found', async () => {
    const fetcher = vi.fn(async () => textResponse(404))
    const failure = await createLiveWorldRoom(request, { baseUrl: 'https://api.example', fetch: fetcher }).catch((reason) => reason)
    expect(failure).toBeInstanceOf(LiveWorldGatewayError)
    expect(failure).toMatchObject({ code: 'not-found', status: 404 })
  })

  it('surfaces the service message on rejections when one is provided', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ message: 'This world is too large.' }, 413))
    await expect(createLiveWorldRoom(request, { baseUrl: 'https://api.example', fetch: fetcher }))
      .rejects.toMatchObject({ code: 'rejected', status: 413, message: 'This world is too large.' })
  })

  it('rejects replies that lack the capability pair', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ roomId: 'ROOM1234' }))
    await expect(createLiveWorldRoom(request, { baseUrl: 'https://api.example', fetch: fetcher }))
      .rejects.toMatchObject({ code: 'invalid-response' })
  })
})

describe('fetchLiveWorldSummary', () => {
  it('GETs /worlds/:roomId with an encoded id and tolerantly extracts fields', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => jsonResponse({
      title: 'Castle Class',
      players: [{}, {}, {}],
      mode: 'explore',
      locked: true,
      surprise: 'ignored',
    }))
    const summary = await fetchLiveWorldSummary('ROOM 42', { baseUrl: 'https://api.example', fetch: fetcher })
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.example/worlds/ROOM%2042')
    expect(summary).toEqual({ roomId: 'ROOM 42', title: 'Castle Class', playerCount: 3, mode: 'explore', locked: true })
  })

  it('prefers an explicit playerCount over the players array', async () => {
    const fetcher = vi.fn(async () => jsonResponse({ playerCount: 7, players: [{}] }))
    const summary = await fetchLiveWorldSummary('ROOM1234', { baseUrl: 'https://api.example', fetch: fetcher })
    expect(summary.playerCount).toBe(7)
  })

  it('treats an unrecognizable body as an existing room with unknown details', async () => {
    const fetcher = vi.fn(async () => jsonResponse('hello'))
    const summary = await fetchLiveWorldSummary('ROOM1234', { baseUrl: 'https://api.example', fetch: fetcher })
    expect(summary).toEqual({ roomId: 'ROOM1234', title: null, playerCount: null, mode: null, locked: null })
  })

  it.each([404, 410])('maps status %i to a friendly not-found error', async (status) => {
    const fetcher = vi.fn(async () => textResponse(status))
    await expect(fetchLiveWorldSummary('ROOM1234', { baseUrl: 'https://api.example', fetch: fetcher }))
      .rejects.toMatchObject({ code: 'not-found', message: expect.stringMatching(/ended|not quite right/i) })
  })
})
