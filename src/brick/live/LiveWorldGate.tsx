import { Crown, Link2, Radio, Users } from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { LIVE_MAX_DISPLAY_NAME_LENGTH, LIVE_MAX_PLAYERS } from '../liveProtocol'
import { displayNameError, formatLivePlayerCount, normalizeDisplayName } from './liveRoomModel'

export const LIVE_ROOM_TITLE_MAX_LENGTH = 60
export const LIVE_ROOM_DEFAULT_TITLE = 'Our Brick World'

export type LiveWorldGateSubmit = {
  displayName: string
  /** Room title; only meaningful for `kind: 'create'`. */
  title: string
  /** Seed the room with the local Brick Studio build instead of an empty plate. */
  seedFromCurrentBuild: boolean
}

export type LiveWorldGateProps = {
  kind: 'create' | 'join'
  /** Join only: room title from the join preflight, when the service shares one. */
  roomTitle?: string | null
  /** Join only: current headcount from the preflight, when known. */
  playerCount?: number | null
  /** Join only: this browser holds the owner capability for the room. */
  returningOwner?: boolean
  /** Create only: brick count of the local build offered as the starting world; null hides the choice. */
  seedBrickCount?: number | null
  defaultDisplayName?: string
  defaultTitle?: string
  busy?: boolean
  errorMessage?: string | null
  onSubmit: (value: LiveWorldGateSubmit) => void
}

/** Display-name entry for guests plus room set-up for owners — the only doorway into a live session. */
export function LiveWorldGate({
  kind,
  roomTitle,
  playerCount,
  returningOwner,
  seedBrickCount,
  defaultDisplayName,
  defaultTitle,
  busy,
  errorMessage,
  onSubmit,
}: LiveWorldGateProps) {
  const nameId = useId()
  const nameHintId = useId()
  const titleId = useId()
  const [name, setName] = useState(defaultDisplayName ?? '')
  const [title, setTitle] = useState(defaultTitle ?? LIVE_ROOM_DEFAULT_TITLE)
  const [seedFromCurrentBuild, setSeedFromCurrentBuild] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const creating = kind === 'create'
  const shownError = localError ?? errorMessage ?? null

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    const displayName = normalizeDisplayName(name)
    const problem = displayNameError(displayName)
    if (problem) {
      setLocalError(problem)
      return
    }
    onSubmit({
      displayName,
      title: creating ? (title.trim().slice(0, LIVE_ROOM_TITLE_MAX_LENGTH).trim() || LIVE_ROOM_DEFAULT_TITLE) : '',
      seedFromCurrentBuild: creating && seedBrickCount != null && seedBrickCount > 0 && seedFromCurrentBuild,
    })
  }

  return (
    <section className="live-gate-card">
      <span className="live-eyebrow">{creating ? 'Live rooms' : 'Live room invite'}</span>
      <h1>
        {creating
          ? 'Start a live build room'
          : returningOwner
            ? 'Welcome back, room owner'
            : roomTitle
              ? `Join “${roomTitle}”`
              : 'Join this live room'}
      </h1>
      {creating ? (
        <ul className="live-gate-points">
          <li><Link2 size={14} aria-hidden="true" />Friends join instantly from one shared link — no accounts.</li>
          <li><Users size={14} aria-hidden="true" />Up to {LIVE_MAX_PLAYERS} builders can be in the room together.</li>
          <li><Crown size={14} aria-hidden="true" />You stay in charge of Build/Explore mode and whether new people can join.</li>
        </ul>
      ) : (
        <p className="live-gate-subline">
          <Radio size={14} aria-hidden="true" />
          {playerCount != null
            ? `${formatLivePlayerCount(playerCount)} inside right now.`
            : 'Pick a builder name and hop in.'}
        </p>
      )}
      <form className="live-gate-form" onSubmit={submit}>
        {creating && (
          <div className="live-field">
            <label htmlFor={titleId}>Room name</label>
            <input
              id={titleId}
              value={title}
              maxLength={LIVE_ROOM_TITLE_MAX_LENGTH}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
        )}
        <div className="live-field">
          <label htmlFor={nameId}>Your builder name</label>
          <input
            id={nameId}
            value={name}
            maxLength={LIVE_MAX_DISPLAY_NAME_LENGTH}
            autoFocus={!defaultDisplayName}
            disabled={busy}
            aria-describedby={nameHintId}
            aria-invalid={shownError ? true : undefined}
            onChange={(event) => {
              setName(event.target.value)
              setLocalError(null)
            }}
          />
          <small id={nameHintId}>Everyone in the room sees this name.</small>
        </div>
        {creating && seedBrickCount != null && seedBrickCount > 0 && (
          <fieldset className="live-seed-choice" disabled={busy}>
            <legend>Starting world</legend>
            <label>
              <input
                type="radio"
                name="live-seed"
                checked={seedFromCurrentBuild}
                onChange={() => setSeedFromCurrentBuild(true)}
              />
              <span>My current build <small>({seedBrickCount} {seedBrickCount === 1 ? 'brick' : 'bricks'})</small></span>
            </label>
            <label>
              <input
                type="radio"
                name="live-seed"
                checked={!seedFromCurrentBuild}
                onChange={() => setSeedFromCurrentBuild(false)}
              />
              <span>A fresh empty plate</span>
            </label>
          </fieldset>
        )}
        {shownError && <p className="live-gate-error" role="alert">{shownError}</p>}
        <button className="live-primary-button" type="submit" disabled={busy}>
          {busy
            ? creating ? 'Creating your room…' : 'Joining…'
            : creating ? 'Create my live room' : returningOwner ? 'Rejoin as owner' : 'Join the room'}
        </button>
      </form>
      <a className="live-quiet-link" href="/">Back to Brick Studio</a>
    </section>
  )
}
