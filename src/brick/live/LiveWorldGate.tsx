import { ArrowLeft, GraduationCap, Play, Users } from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, TextField } from '../../ui'
import { LIVE_MAX_DISPLAY_NAME_LENGTH, LIVE_MAX_PLAYERS } from '../liveProtocol'
import { displayNameError, formatLivePlayerCount, normalizeDisplayName } from './liveRoomModel'

export const LIVE_ROOM_TITLE_MAX_LENGTH = 60
export const LIVE_ROOM_DEFAULT_TITLE = 'Our Brick World'

export type LiveWorldGateSubmit = {
  displayName: string
  /** Room title; only meaningful for `kind: 'create'`. */
  title: string
  /** Seed the room with the local build instead of an empty plate. */
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

/**
 * The only doorway into a guest room (board 11): owners name the room and pick the seed
 * build; recipients enter a name. Guest rooms are temporary and need no account; the
 * classroom sign-in link keeps the account path one tap away without mixing the two.
 */
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
  const seedId = useId()
  const [name, setName] = useState(defaultDisplayName ?? '')
  const [title, setTitle] = useState(defaultTitle ?? LIVE_ROOM_DEFAULT_TITLE)
  const [seedFromCurrentBuild, setSeedFromCurrentBuild] = useState(true)
  const [localError, setLocalError] = useState<string | null>(null)
  const creating = kind === 'create'
  const shownError = localError ?? errorMessage ?? null
  const seedChoice = creating && seedBrickCount != null && seedBrickCount > 0

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
      seedFromCurrentBuild: seedChoice && seedFromCurrentBuild,
    })
  }

  return (
    <section className="live-gate-card" aria-busy={busy || undefined}>
      <span className="live-eyebrow">{creating ? 'Build together' : 'Shared world invite'}</span>
      <h1>
        {creating
          ? 'Build together.'
          : returningOwner
            ? 'Welcome back, room owner.'
            : roomTitle
              ? `Join ${roomTitle}.`
              : 'Join this shared world.'}
      </h1>
      <p className="live-gate-lead">
        {creating
          ? 'Start a shared world from this build.'
          : playerCount != null
            ? `${formatLivePlayerCount(playerCount)} inside right now. Enter your name to join.`
            : 'Enter your name to join this shared world.'}
      </p>
      <form className="live-gate-form" onSubmit={submit}>
        {creating && (
          <TextField
            label="World name"
            value={title}
            maxLength={LIVE_ROOM_TITLE_MAX_LENGTH}
            disabled={busy}
            autoComplete="off"
            onChange={(event) => setTitle(event.target.value)}
          />
        )}
        <TextField
          label="Your name"
          hint="Everyone in the room sees this name."
          value={name}
          maxLength={LIVE_MAX_DISPLAY_NAME_LENGTH}
          autoFocus={!defaultDisplayName}
          disabled={busy}
          autoComplete="nickname"
          error={shownError ?? undefined}
          onChange={(event) => {
            setName(event.target.value)
            setLocalError(null)
          }}
        />
        {seedChoice && (
          <fieldset className="live-seed-choice" disabled={busy}>
            <legend>Starting world</legend>
            <label htmlFor={`${seedId}-current`}>
              <input
                id={`${seedId}-current`}
                type="radio"
                name="live-seed"
                checked={seedFromCurrentBuild}
                onChange={() => setSeedFromCurrentBuild(true)}
              />
              <span>My current build <small>({seedBrickCount} {seedBrickCount === 1 ? 'brick' : 'bricks'})</small></span>
            </label>
            <label htmlFor={`${seedId}-empty`}>
              <input
                id={`${seedId}-empty`}
                type="radio"
                name="live-seed"
                checked={!seedFromCurrentBuild}
                onChange={() => setSeedFromCurrentBuild(false)}
              />
              <span>A fresh empty plate</span>
            </label>
          </fieldset>
        )}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          fullWidth
          icon={creating ? <Play size={18} /> : <Users size={18} />}
          loading={busy}
          loadingLabel={creating ? 'Creating your world…' : 'Joining…'}
        >
          {creating ? 'Create shared world' : returningOwner ? 'Rejoin as owner' : 'Join world'}
        </Button>
        <p className="live-gate-reassurance">
          {creating
            ? `No account needed. Guest rooms are temporary and hold up to ${LIVE_MAX_PLAYERS} builders.`
            : 'You can join as a guest.'}
        </p>
      </form>
      <p className="live-retention-note">
        <strong>Temporary room.</strong> Expires after 2 hours without activity. Download a copy from People before you leave to keep your build.
      </p>
      <div className="live-gate-footer">
        {creating ? (
          <Button variant="secondary" fullWidth icon={<ArrowLeft size={16} />} onClick={() => window.location.assign('/build')}>Keep building</Button>
        ) : (
          <a className="live-gate-classroom" href="/build?classroom=signin">
            <GraduationCap size={18} aria-hidden="true" />
            <span><strong>Classroom sign in</strong><small>Use your teacher’s sign-in code.</small></span>
          </a>
        )}
      </div>
    </section>
  )
}
