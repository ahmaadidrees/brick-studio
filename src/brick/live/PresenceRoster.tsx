import { Check, Crown, Pencil, Users, X } from 'lucide-react'
import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { LIVE_MAX_DISPLAY_NAME_LENGTH, type LivePlayer } from '../liveProtocol'
import {
  displayNameError,
  formatLivePlayerCount,
  livePlayerColor,
  normalizeDisplayName,
  sortLivePlayers,
} from './liveRoomModel'

export type PresenceRosterProps = {
  players: LivePlayer[]
  selfPlayerId: string | null
  /** Renames the local player via the protocol's `setProfile`; omit to hide the affordance. */
  onRename?: (displayName: string) => void
  /** Overrides the responsive default (collapsed on narrow screens). */
  defaultOpen?: boolean
}

/** Who is in the room right now: owner first, then you, then everyone else. Collapsible so phones keep their canvas. */
export function PresenceRoster({ players, selfPlayerId, onRename, defaultOpen }: PresenceRosterProps) {
  const panelId = useId()
  const renameId = useId()
  const [open, setOpen] = useState(() => defaultOpen ?? !(window.matchMedia?.('(max-width: 620px)').matches ?? false))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [renameError, setRenameError] = useState<string | null>(null)
  const sorted = sortLivePlayers(players, selfPlayerId)

  const submitRename = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const displayName = normalizeDisplayName(draft)
    const problem = displayNameError(displayName)
    if (problem) {
      setRenameError(problem)
      return
    }
    onRename?.(displayName)
    setEditing(false)
    setRenameError(null)
  }

  return (
    <section className="live-roster" aria-label="Builders in this room">
      <button
        type="button"
        className="live-roster-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <Users size={15} aria-hidden="true" />
        <span>{formatLivePlayerCount(players.length)}</span>
      </button>
      {open && (
        <div className="live-roster-panel" id={panelId}>
          {sorted.length === 0 ? (
            <p className="live-roster-empty">Nobody is here yet — copy the invite link to bring your friends in.</p>
          ) : (
            <ul className="live-roster-list">
              {sorted.map((player) => {
                const isSelf = player.playerId === selfPlayerId
                return (
                  <li key={player.playerId} className={isSelf ? 'live-roster-row live-roster-self' : 'live-roster-row'}>
                    {isSelf && editing ? (
                      <form className="live-roster-rename-form" onSubmit={submitRename}>
                        <label className="live-visually-hidden" htmlFor={renameId}>New builder name</label>
                        <input
                          id={renameId}
                          value={draft}
                          maxLength={LIVE_MAX_DISPLAY_NAME_LENGTH}
                          autoFocus
                          onChange={(event) => {
                            setDraft(event.target.value)
                            setRenameError(null)
                          }}
                          aria-invalid={renameError ? true : undefined}
                        />
                        <button type="submit" aria-label="Save my new name"><Check size={14} aria-hidden="true" /></button>
                        <button
                          type="button"
                          aria-label="Keep my current name"
                          onClick={() => {
                            setEditing(false)
                            setRenameError(null)
                          }}
                        ><X size={14} aria-hidden="true" /></button>
                        {renameError && <p className="live-roster-rename-error" role="alert">{renameError}</p>}
                      </form>
                    ) : (
                      <>
                        <span className="live-roster-dot" style={{ background: livePlayerColor(player.playerId) }} aria-hidden="true" />
                        <span className="live-roster-name">{player.profile.displayName || 'Builder'}</span>
                        {player.isOwner && (
                          <span className="live-roster-badge live-roster-owner-badge">
                            <Crown size={11} aria-hidden="true" />Owner
                          </span>
                        )}
                        {isSelf && <span className="live-roster-badge">You</span>}
                        {isSelf && onRename && (
                          <button
                            type="button"
                            className="live-roster-rename"
                            aria-label="Change my builder name"
                            onClick={() => {
                              setDraft(player.profile.displayName)
                              setEditing(true)
                              setRenameError(null)
                            }}
                          ><Pencil size={13} aria-hidden="true" /></button>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
