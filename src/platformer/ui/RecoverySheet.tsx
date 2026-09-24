import { Download, RotateCw, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { levelFromJson, type LevelJson } from '@brick-studio/platformer-core/engine/level'
import { createPlatformerDocument } from '@brick-studio/platformer-core/document'
import { browserClassroomClient } from '../../classroom/client'
import { Button, Sheet } from '../../ui'

export interface RecoveryCopySummary { id: string; revision: number; at: number }
interface RecoveryCopy extends RecoveryCopySummary { worldId: string; level: LevelJson }

interface Props {
  open: boolean
  worldId: string | null
  worldTitle: string
  onClose: () => void
}

/** Classroom room links omit UUID separators; the account API requires the original world UUID. */
export function recoveryWorldUuid(id: string): string | null {
  const hex = id.toLowerCase().replaceAll('-', '')
  if (!/^[a-f0-9]{32}$/.test(hex)) return null
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function copyDate(at: number): string {
  const date = new Date(at)
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Saved copy'
}

/** Export the existing 2D account-document format; this never loads the copy into the open session. */
export function downloadRecoveryCopy(copy: RecoveryCopy, title: string): void {
  const document = createPlatformerDocument(levelFromJson(copy.level))
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || '2d-world'
  const suffix = copy.id.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 12) || String(copy.at)
  const filename = `${slug}-recovery-v${copy.revision}-${suffix}.json`
  const url = URL.createObjectURL(new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' }))
  try {
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename
    link.hidden = true
    window.document.body.append(link)
    link.click()
    link.remove()
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** Older copies stay here until a person decides what to do with them. The current world is never replaced. */
export function RecoverySheet({ open, worldId, worldTitle, onClose }: Props) {
  const [copies, setCopies] = useState<RecoveryCopySummary[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<{ id: string; action: 'download' | 'remove' } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open || !worldId) return
    let current = true
    setCopies(null)
    setError('')
    browserClassroomClient.request<{ copies: RecoveryCopySummary[]; capacity: number }>(`/worlds/${encodeURIComponent(worldId)}/platformer-recovery`)
      .then(({ copies }) => {
        if (current) setCopies([...copies].sort((a, b) => b.at - a.at))
      })
      .catch(() => {
        if (current) setError('Could not load recovery copies. Check your connection and try again.')
      })
    return () => { current = false }
  }, [open, worldId, attempt])

  const download = async (summary: RecoveryCopySummary) => {
    if (!worldId || busy) return
    setBusy({ id: summary.id, action: 'download' })
    setError('')
    try {
      const copy = await browserClassroomClient.request<RecoveryCopy>(`/worlds/${encodeURIComponent(worldId)}/platformer-recovery/${encodeURIComponent(summary.id)}`)
      if (copy.id !== summary.id || recoveryWorldUuid(copy.worldId) !== worldId) throw new Error('invalid copy')
      downloadRecoveryCopy(copy, worldTitle)
    } catch {
      setError('Could not download this copy. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const remove = async (summary: RecoveryCopySummary) => {
    if (!worldId || busy) return
    if (!window.confirm(`Remove the recovery copy saved ${copyDate(summary.at)} (Version ${summary.revision})? This cannot be undone. Your current world stays as it is.`)) return
    setBusy({ id: summary.id, action: 'remove' })
    setError('')
    try {
      await browserClassroomClient.request<void>(`/worlds/${encodeURIComponent(worldId)}/platformer-recovery/${encodeURIComponent(summary.id)}`, 'DELETE')
      setCopies(null)
      setAttempt((n) => n + 1)
    } catch {
      setError('Could not remove this copy. It is still here. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Recovery copies" description="Download an earlier copy to keep. Copies stay here until you remove them; your open world stays as it is." variant="dialog" size="md" className="p2d-recovery-sheet">
      <div className="p2d-recovery-body">
        {!worldId ? <p role="alert">This world’s recovery copies are unavailable here.</p>
          : copies === null && !error ? <p role="status">Looking for recovery copies…</p>
            : copies?.length === 0 ? <p>No recovery copies are available for this world.</p>
              : copies && <ol className="p2d-recovery-list">
                {copies.map((copy) => <li key={copy.id}>
                  <div><strong>{copyDate(copy.at)}</strong><span>Version {copy.revision}</span></div>
                  <div className="p2d-recovery-actions">
                    <Button size="sm" icon={<Download size={17} />} disabled={busy !== null} onClick={() => void download(copy)}>
                      {busy?.id === copy.id && busy.action === 'download' ? 'Preparing…' : 'Download copy'}
                    </Button>
                    <Button variant="quiet" size="sm" className="p2d-recovery-remove" icon={<Trash2 size={17} />} disabled={busy !== null} onClick={() => void remove(copy)}>
                      {busy?.id === copy.id && busy.action === 'remove' ? 'Removing…' : 'Remove copy'}
                    </Button>
                  </div>
                </li>)}
              </ol>}
        {busy && <p role="status">{busy.action === 'remove' ? 'Removing this copy…' : 'Preparing your download…'}</p>}
        {error && <div className="p2d-recovery-error" role="alert"><p>{error}</p><Button size="sm" icon={<RotateCw size={17} />} onClick={() => setAttempt((n) => n + 1)}>{copies === null ? 'Try again' : 'Refresh copies'}</Button></div>}
      </div>
    </Sheet>
  )
}
