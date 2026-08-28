import { describe, expect, it } from 'vitest'
import { LIVE_MAX_DISPLAY_NAME_LENGTH, LIVE_MAX_PLAYERS, type LivePlayer } from '../liveProtocol'
import {
  describeLiveConnection,
  displayNameError,
  formatLivePlayerCount,
  liveEditPermission,
  liveGuestLink,
  liveOwnerLocation,
  livePlayerColor,
  LIVE_PLAYER_COLORS,
  normalizeDisplayName,
  parseLiveWorldLocation,
  sortLivePlayers,
} from './liveRoomModel'

describe('parseLiveWorldLocation', () => {
  it('recognizes the create route with and without a trailing slash', () => {
    expect(parseLiveWorldLocation('/live/new', '')).toEqual({ kind: 'create' })
    expect(parseLiveWorldLocation('/live/new/', '')).toEqual({ kind: 'create' })
  })

  it('parses guest links without an owner capability', () => {
    expect(parseLiveWorldLocation('/live/ROOM1234', '')).toEqual({ kind: 'join', roomId: 'ROOM1234' })
  })

  it('reads the owner token from the hash, even among other params', () => {
    expect(parseLiveWorldLocation('/live/ROOM1234', '#owner=secret-1')).toEqual({
      kind: 'join', roomId: 'ROOM1234', ownerToken: 'secret-1',
    })
    expect(parseLiveWorldLocation('/live/ROOM1234', 'a=1&owner=tok&b=2')).toEqual({
      kind: 'join', roomId: 'ROOM1234', ownerToken: 'tok',
    })
  })

  it('decodes escaped room ids and rejects malformed ones', () => {
    expect(parseLiveWorldLocation('/live/My%20Room', '')).toEqual({ kind: 'join', roomId: 'My Room' })
    expect(parseLiveWorldLocation('/live/%zz', '')).toEqual({ kind: 'invalid' })
    expect(parseLiveWorldLocation('/live/%20%20', '')).toEqual({ kind: 'invalid' })
  })

  it('rejects paths outside the live namespace', () => {
    expect(parseLiveWorldLocation('/live/', '')).toEqual({ kind: 'invalid' })
    expect(parseLiveWorldLocation('/live/a/b', '')).toEqual({ kind: 'invalid' })
    expect(parseLiveWorldLocation('/race/ROOM1234', '')).toEqual({ kind: 'invalid' })
  })
})

describe('live links', () => {
  it('builds guest links that never carry the owner capability', () => {
    const link = liveGuestLink('https://bricks.example', 'ROOM 42')
    expect(link).toBe('https://bricks.example/live/ROOM%2042')
    expect(link).not.toContain('owner')
    expect(link).not.toContain('#')
  })

  it('round-trips the owner location through the parser', () => {
    const location = liveOwnerLocation('ROOM1234', 'top-secret')
    const [pathname, hash] = location.split('#')
    expect(parseLiveWorldLocation(pathname, `#${hash}`)).toEqual({
      kind: 'join', roomId: 'ROOM1234', ownerToken: 'top-secret',
    })
  })
})

describe('display names', () => {
  it('collapses whitespace and strips control characters', () => {
    expect(normalizeDisplayName('  Maya   B  ')).toBe('Maya B')
  })

  it('clamps to the protocol budget', () => {
    const long = 'x'.repeat(LIVE_MAX_DISPLAY_NAME_LENGTH + 20)
    expect(normalizeDisplayName(long)).toHaveLength(LIVE_MAX_DISPLAY_NAME_LENGTH)
    expect(normalizeDisplayName('x'.repeat(LIVE_MAX_DISPLAY_NAME_LENGTH))).toHaveLength(LIVE_MAX_DISPLAY_NAME_LENGTH)
  })

  it('flags empty names with kid-friendly guidance', () => {
    expect(displayNameError('')).toMatch(/builder name/i)
    expect(displayNameError('Maya')).toBeNull()
  })
})

describe('liveEditPermission', () => {
  const base = { connection: 'online', mode: 'build', locked: false, isOwner: false } as const

  it('lets any online participant edit in unlocked Build mode', () => {
    expect(liveEditPermission(base)).toEqual({ canEdit: true, reason: null })
    expect(liveEditPermission({ ...base, isOwner: true })).toEqual({ canEdit: true, reason: null })
  })

  it('blocks everyone in Explore with role-specific reasons', () => {
    expect(liveEditPermission({ ...base, mode: 'explore' }).reason).toMatch(/owner switched/i)
    expect(liveEditPermission({ ...base, mode: 'explore', isOwner: true }).reason).toMatch(/switch to build/i)
  })

  it('keeps admitted guests building when the owner locks new joins', () => {
    expect(liveEditPermission({ ...base, locked: true })).toEqual({ canEdit: true, reason: null })
    expect(liveEditPermission({ ...base, locked: true, isOwner: true }).canEdit).toBe(true)
  })

  it('pauses editing while the connection is not online', () => {
    expect(liveEditPermission({ ...base, connection: 'connecting' }).canEdit).toBe(false)
    expect(liveEditPermission({ ...base, connection: 'reconnecting' }).reason).toMatch(/reconnecting/i)
    expect(liveEditPermission({ ...base, connection: 'offline' }).reason).toMatch(/offline/i)
  })
})

describe('describeLiveConnection', () => {
  it('maps every connection state to a labeled tone', () => {
    expect(describeLiveConnection('online', false)).toMatchObject({ label: 'Live', tone: 'ok' })
    expect(describeLiveConnection('online', true)).toMatchObject({ label: 'Syncing…', tone: 'busy' })
    expect(describeLiveConnection('connecting', true)).toMatchObject({ tone: 'busy' })
    expect(describeLiveConnection('reconnecting', false)).toMatchObject({ label: 'Reconnecting…', tone: 'warn' })
    expect(describeLiveConnection('offline', false)).toMatchObject({ label: 'Offline', tone: 'warn' })
  })
})

describe('roster helpers', () => {
  const player = (playerId: string, displayName: string, isOwner = false): LivePlayer => ({
    playerId, isOwner, profile: { displayName },
  })

  it('sorts owner first, then self, then everyone else by name', () => {
    const players = [player('c', 'Zoe'), player('b', 'Ari'), player('a', 'Ms. Rivera', true), player('d', 'Maya')]
    expect(sortLivePlayers(players, 'd').map((entry) => entry.playerId)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('assigns stable palette colors per player id', () => {
    expect(livePlayerColor('player-1')).toBe(livePlayerColor('player-1'))
    expect(LIVE_PLAYER_COLORS).toContain(livePlayerColor('player-1'))
  })

  it('formats the headcount against the protocol player cap', () => {
    expect(formatLivePlayerCount(5)).toBe(`5 of ${LIVE_MAX_PLAYERS} builders`)
  })
})
