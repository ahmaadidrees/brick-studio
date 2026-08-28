import type { ConnectLiveRoom } from './liveRoomModel'

/**
 * Integration seam for the realtime lane.
 *
 * The `liveRoomClient` (WebSocket session speaking the frozen messages in
 * `packages/brick-core/src/protocol.ts`) is built in a parallel branch. Once
 * it lands, point this constant at its `ConnectLiveRoom`-shaped entry, e.g.:
 *
 * ```ts
 * import { connectLiveRoom } from '../liveRoomClient'
 * export const defaultConnectLiveRoom: ConnectLiveRoom | undefined = connectLiveRoom
 * ```
 *
 * Until then `LiveWorldPage` renders every pre-connection surface (create,
 * join, share) and an honest "live sync is not wired up yet" session state.
 * Tests and embedders can bypass this file entirely via the `connectRoom`
 * prop on `LiveWorldPage`.
 */
export const defaultConnectLiveRoom: ConnectLiveRoom | undefined = undefined
