import { CloudUpload, Download, FileUp, Flag, Footprints, Blocks, MonitorSmartphone, Play, Trash2, Users } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { COURSES } from '@brick-studio/platformer-core/levels/courses'
import { RACE_COURSES } from '@brick-studio/platformer-core/levels/raceCourses'
import { Button, Sheet } from '../ui'
import { raceThumb } from '../platformer/race/raceThumb'
import { levelThumb } from '../platformer/ui/thumbs'
import { playWithFriends } from '../platformer/ui/rooms'
import { createCloudLevel } from '../platformer/ui/cloudLevel'
import { formatSavedDate } from '../classroom/panelShared'
import { PROJECT_FILE_ACCEPT, PROJECT_KIND_LABEL, downloadProjectFile, readProjectFile, type Project, type ProjectKind } from './projectFile'
import { LOCAL_3D_ID, importProject, listLocalProjects, localProject, moveToAccount, removeLocalProject, type LocalProject } from './projects'
import './projects.css'

const KIND_ICON: Record<ProjectKind, typeof Blocks> = { '3d': Blocks, platformer: Footprints, race: Flag }

/** "3D build", "Platformer" or "Race track", on every project card. */
export function KindChip({ kind }: { kind: ProjectKind }) {
  const Icon = KIND_ICON[kind]
  return (
    <span className={`worlds-chip-tag projects-kind-chip projects-kind-${kind}`}>
      <Icon size={14} aria-hidden="true" /> {PROJECT_KIND_LABEL[kind]}
    </span>
  )
}

function localPicture(p: LocalProject): string {
  if (!p.level) return ''
  return p.kind === 'race' ? raceThumb(p.level, `local:${p.id}:${p.updated}`) : levelThumb(p.level, `local:${p.id}:${p.updated}`)
}

interface Feedback {
  onNotice: (message: string) => void
  onError: (message: string) => void
  navigate: (href: string) => void
}

/**
 * Projects kept on this computer only: the 3D build in this browser and the 2D drafts. Signed in, each one can move
 * to the account (and then it is gone from here, so there is never a stale second copy). Removing one asks first.
 */
export function LocalProjectsSection({ signedIn, version, onChanged, onNotice, onError, navigate }: Feedback & { signedIn: boolean; version: number; onChanged: () => void }) {
  // `version` changes when something on the page added or removed a local project.
  const projects = useMemo(() => listLocalProjects(), [version])
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState<LocalProject | null>(null)
  if (projects.length === 0) return null

  const move = async (p: LocalProject) => {
    setBusy(true)
    try {
      await moveToAccount(p)
      onNotice(`“${p.title}” is in your account now. It's no longer only on this computer.`)
      onChanged()
    } catch (error) {
      const code = (error as { code?: string })?.code
      onError(code === 'world_limit' ? 'Your account is full. Remove a project you no longer need, then try again.' : error instanceof Error ? error.message : 'That project could not be moved.')
    } finally {
      setBusy(false)
    }
  }
  const download = (p: LocalProject) => {
    const project = localProject(p)
    if (project) downloadProjectFile(project)
    else onError('That project is no longer on this computer.')
  }
  const moveAll = async () => {
    for (const p of projects) await move(p)
  }

  return (
    <section aria-label="On this computer" className="worlds-section">
      <div className="worlds-section-heading">
        <h2 className="worlds-section-title">On this computer only</h2>
        {signedIn && projects.length > 1 && (
          <Button variant="secondary" size="sm" icon={<CloudUpload size={16} />} disabled={busy} onClick={() => void moveAll()}>
            Move all to my account
          </Button>
        )}
      </div>
      <p className="projects-muted">
        {signedIn ? 'These are only in this browser. Move them to your account to open them anywhere.' : 'These are only in this browser. Sign in to keep them in your account and open them anywhere.'}
      </p>
      <div className="worlds-grid">
        {projects.map((p) => {
          const picture = localPicture(p)
          return (
            <article key={p.id} className="worlds-card" aria-label={p.title}>
              <div className="worlds-card-art" aria-hidden="true">
                {picture ? <img className="projects-local-picture" src={picture} alt="" /> : <MonitorSmartphone size={40} />}
              </div>
              <div className="worlds-card-body">
                <div className="worlds-card-heading">
                  <h3>{p.title}</h3>
                </div>
                <p className="worlds-card-saved">
                  <MonitorSmartphone size={14} aria-hidden="true" /> On this computer only
                  {p.updated ? ` · ${formatSavedDate(new Date(p.updated).toISOString())}` : p.bricks ? ` · ${p.bricks} ${p.bricks === 1 ? 'brick' : 'bricks'}` : ''}
                </p>
                <p className="worlds-card-chips">
                  <KindChip kind={p.kind} />
                </p>
                <div className="worlds-card-actions">
                  <Button href={p.href} variant="primary" size="sm" icon={<Play size={16} />}>
                    Open
                  </Button>
                  {signedIn && (
                    <Button variant="secondary" size="sm" icon={<CloudUpload size={16} />} disabled={busy} onClick={() => void move(p)}>
                      Move to my account
                    </Button>
                  )}
                  <Button variant="quiet" size="sm" iconOnly icon={<Download size={16} />} aria-label={`Download a copy of ${p.title}`} title="Download a copy" onClick={() => download(p)}>
                    Download a copy
                  </Button>
                  <Button variant="quiet" size="sm" iconOnly icon={<Trash2 size={16} />} aria-label={`Remove ${p.title} from this computer`} title="Remove from this computer" onClick={() => setRemoving(p)}>
                    Remove
                  </Button>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      {removing && (
        <Sheet
          open
          variant="dialog"
          size="sm"
          title={`Remove “${removing.title}”?`}
          description="It's only on this computer, so it can't be brought back afterwards. Download a copy first if you might want it."
          onClose={() => setRemoving(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => { download(removing) }}>
                Download a copy
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  removeLocalProject(removing)
                  onNotice(`“${removing.title}” was removed from this computer.`)
                  setRemoving(null)
                  onChanged()
                }}
              >
                Remove
              </Button>
            </>
          }
        >
          <p className="projects-muted">Projects in your account are not affected.</p>
        </Sheet>
      )}
    </section>
  )
}

/**
 * Import a project file: it always becomes a new project (in the account when signed in, on this computer
 * otherwise). A guest's 3D build is the one thing a browser keeps only one of, so replacing it asks first.
 */
export function ImportProjectButton({ signedIn, onError, navigate }: Feedback & { signedIn: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<{ project: Project; current: LocalProject } | null>(null)

  const finish = async (project: Project, replace3d = false) => {
    setBusy(true)
    const result = await importProject(project, { signedIn, replace3d })
    setBusy(false)
    if (result.ok) navigate(result.href)
    else if (result.reason === 'replace-3d') setPending({ project, current: result.current })
    else onError(result.message)
  }
  const pick = async (file: File | undefined) => {
    if (!file) return
    const read = readProjectFile(await file.text(), file.name)
    if (!read.ok) onError(read.message)
    else await finish(read.project)
  }
  return (
    <>
      <Button variant="secondary" icon={<FileUp size={18} />} loading={busy} loadingLabel="Opening…" onClick={() => input.current?.click()}>
        Import a file
      </Button>
      <input
        ref={input}
        type="file"
        accept={PROJECT_FILE_ACCEPT}
        hidden
        aria-label="Import a project file"
        onChange={(event) => {
          void pick(event.currentTarget.files?.[0])
          event.currentTarget.value = ''
        }}
      />
      {pending && (
        <Sheet
          open
          variant="dialog"
          size="sm"
          title="Replace the 3D build on this computer?"
          description="This browser keeps one 3D build when you're not signed in. Download the one that's here first if you want to keep it, or sign in to keep as many as you like."
          onClose={() => setPending(null)}
          footer={
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  const current = localProject(pending.current)
                  if (current) downloadProjectFile(current)
                }}
              >
                Download the current one
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const { project } = pending
                  setPending(null)
                  void finish(project, true)
                }}
              >
                Replace it
              </Button>
            </>
          }
        >
          <p className="projects-muted">The file you picked becomes the 3D build on this computer.</p>
        </Sheet>
      )}
    </>
  )
}

/**
 * Starter courses and tracks to play right away, alone or with friends (making your own copy is in New project).
 * With friends: signed in, a copy goes to the account and opens ready to share with the class; a guest gets a room.
 */
export function StartersSection({ signedIn, onError, navigate }: Feedback & { signedIn: boolean }) {
  const [busy, setBusy] = useState(false)
  const starters = useMemo(
    () => [
      ...COURSES.map((c) => ({ id: c.id, title: c.title, blurb: c.blurb, kind: 'platformer' as const, level: c.level, picture: levelThumb(c.level(), `course:${c.id}`) })),
      ...RACE_COURSES.map((c) => ({ id: c.id, title: c.title, blurb: c.blurb, kind: 'race' as const, level: c.level, picture: raceThumb(c.level(), `race:${c.id}`) })),
    ],
    [],
  )
  const friends = (make: () => Parameters<typeof playWithFriends>[0]) => {
    setBusy(true)
    const opening = signedIn
      ? createCloudLevel(make()).then((world) => navigate(`/2d/build?world=${encodeURIComponent(world.id)}&share=1`))
      : playWithFriends(make())
    opening.catch((error: Error) => {
      onError(error.message)
      setBusy(false)
    })
  }
  return (
    <section aria-label="Starters to play" className="worlds-section">
      <h2 className="worlds-section-title">Starters to play</h2>
      <div className="worlds-grid">
        {starters.map((s) => (
          <article key={s.id} className="worlds-card" aria-label={s.title}>
            <div className="worlds-card-art" aria-hidden="true">
              {s.picture && <img className="projects-local-picture" src={s.picture} alt="" />}
            </div>
            <div className="worlds-card-body">
              <div className="worlds-card-heading">
                <h3>{s.title}</h3>
              </div>
              <p className="worlds-card-owner">{s.blurb}</p>
              <p className="worlds-card-chips">
                <KindChip kind={s.kind} />
              </p>
              <div className="worlds-card-actions">
                <Button href={`/2d/play/${s.id}`} variant="primary" size="sm" icon={<Play size={16} />}>
                  {s.kind === 'race' ? 'Race' : 'Play'}
                </Button>
                <Button variant="secondary" size="sm" icon={<Users size={16} />} disabled={busy} onClick={() => friends(s.level)}>
                  With friends
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

export { LOCAL_3D_ID }
