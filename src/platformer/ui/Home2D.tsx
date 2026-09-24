import { Hammer, LoaderCircle, Play, Plus, Trash2, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { createBlankLevel, type LevelDesign } from '@brick-studio/platformer-core/engine/level'
import { COURSES } from '@brick-studio/platformer-core/levels/courses'
import { browserClassroomClient } from '../../classroom/client'
import type { ClassroomWorld } from '../../classroom/contracts'
import { formatSavedDate } from '../../classroom/panelShared'
import { AppHeader, DimensionSwitch, useClassroomSession } from '../../shell'
import { Button, TextField } from '../../ui'
import { loadBest } from '../game/records'
import { formatTime } from '../render/renderer'
import { Art } from './art'
import { deleteDraft, listDrafts, loadDraft, type Draft } from './drafts'
import { parseRoomRef, playWithFriends } from './rooms'
import { createCloudLevel } from './cloudLevel'
import { levelThumb } from './thumbs'

/**
 * `/2d`: the 2D side of Brickgineers. Start or continue a world, try a starter world, find your worlds (this browser's
 * and, when signed in, your account's), and play with friends. The header matches every other page, with the
 * 3D ⇄ 2D switch in place of page actions.
 */
export function Home2D() {
  const account = useClassroomSession()
  const signedIn = account.status === 'student' || account.status === 'teacher'
  const [drafts, setDrafts] = useState<Draft[]>(listDrafts)
  const [worlds, setWorlds] = useState<ClassroomWorld[] | null>(null)
  const [worldsError, setWorldsError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!signedIn) return
    let cancelled = false
    browserClassroomClient
      .listWorlds()
      .then((list) => !cancelled && setWorlds(list.filter((w) => w.format === '2d')))
      .catch((e: Error) => !cancelled && setWorldsError(e.message))
    return () => {
      cancelled = true
    }
  }, [signedIn])

  const courses = useMemo(
    () =>
      COURSES.map((c) => {
        const level = c.level()
        const best = loadBest(`course:${c.id}`)
        return { c, level, thumb: levelThumb(level, `course:${c.id}:${level.style}`), sub: best >= 0 ? `Best ${formatTime(best)}` : c.blurb }
      }),
    [],
  )
  const me = account.user?.id
  const mine = (worlds ?? []).filter((w) => w.kind === 'personal' && w.ownerId === me)
  const fromClass = (worlds ?? []).filter((w) => !(w.kind === 'personal' && w.ownerId === me))
  const local = drafts
    .map((d) => ({ d, level: loadDraft(d.id) }))
    .filter((x): x is { d: Draft; level: LevelDesign } => x.level !== null)
  const latest = mine[0] ? { href: `/2d/build?world=${encodeURIComponent(mine[0].id)}`, title: mine[0].title } : local[0] ? { href: `/2d/build?draft=${encodeURIComponent(local[0].d.id)}`, title: local[0].d.title } : null

  const friends = (level: LevelDesign) => {
    if (busy || account.status === 'loading') return
    setBusy(true)
    setError('')
    const opening = signedIn
      ? createCloudLevel(level).then(world => { window.location.assign(`/2d/build?world=${encodeURIComponent(world.id)}&share=1`) })
      : playWithFriends(level)
    opening.catch((e: Error) => {
      setError(e.message)
      setBusy(false)
    })
  }
  const remove = (d: Draft) => {
    if (!confirm(`Delete “${d.title}” from this browser? This cannot be undone.`)) return
    deleteDraft(d.id)
    setDrafts(listDrafts())
  }

  return (
    <div className="p2d-page">
      <AppHeader variant="page" title="2D worlds" actions={<DimensionSwitch current="2d" />} />
      <main className="p2d-home" id="p2d-main">
        <section className="p2d-hero" aria-labelledby="p2d-hero-title">
          <div className="p2d-hero-copy">
            <h1 id="p2d-hero-title">Build a 2D world. Then run through it.</h1>
            <p>Place bricks, springs and critters in a side-scrolling world, then play it: alone, with friends, or with your class.</p>
            <div className="p2d-hero-actions">
              <Button href="/2d/build?new=1" variant="primary" size="lg" icon={<Plus size={20} />}>
                Start a new world
              </Button>
              {latest && (
                <Button href={latest.href} size="lg" icon={<Hammer size={20} />}>
                  Continue “{latest.title}”
                </Button>
              )}
            </div>
            <p className="p2d-hero-note">
              Prefer bricks? <a href="/build">Switch to 3D building</a>. {signedIn ? 'Your 2D worlds save to your account, next to your 3D ones.' : 'Sign in to save your worlds to your account and share them with your class.'}
            </p>
          </div>
          <div className="p2d-hero-art" aria-hidden="true">
            <img src={courses[0].thumb} alt="" className={courses[0].level.style === 'cartoon' ? 'p2d-smooth' : undefined} />
          </div>
        </section>

        {error && (
          <p className="p2d-error" role="alert">
            {error}
          </p>
        )}

        <section className="p2d-section" aria-labelledby="p2d-courses">
          <h2 id="p2d-courses">Try a starter world</h2>
          <div className="p2d-cards">
            {courses.map(({ c, level, thumb, sub }) => (
              <LevelCard key={c.id} thumb={thumb} smooth={level.style === 'cartoon'} title={c.title} sub={sub}>
                <Button href={`/2d/play/${c.id}`} variant="primary" size="sm" icon={<Play size={16} />}>
                  Play
                </Button>
                <Button size="sm" icon={<Users size={16} />} disabled={busy} onClick={() => friends(level)}>
                  With friends
                </Button>
              </LevelCard>
            ))}
          </div>
        </section>

        <section className="p2d-section" aria-labelledby="p2d-yours">
          <h2 id="p2d-yours">Your worlds</h2>
          {signedIn && worlds === null && !worldsError && (
            <p className="p2d-muted" role="status">
              <LoaderCircle className="ui-spin" size={16} aria-hidden="true" /> Loading your worlds…
            </p>
          )}
          {worldsError && <p className="p2d-error">{worldsError}</p>}
          <div className="p2d-cards">
            <LevelCard thumb={levelThumb(createBlankLevel(160, 27, 'My world'), 'blank:cartoon')} smooth title="New world" sub="A start, a floor and a flag" badge>
              <Button href="/2d/build?new=1" variant="primary" size="sm" icon={<Plus size={16} />}>
                Start
              </Button>
            </LevelCard>
            {mine.map((w) => (
              <LevelCard key={w.id} title={w.title} sub={`Saved to your account · ${formatSavedDate(w.updatedAt)}${w.visibility !== 'private' ? ' · shared' : ''}`}>
                <Button href={`/2d/build?world=${encodeURIComponent(w.id)}`} variant="primary" size="sm" icon={<Hammer size={16} />}>
                  Open
                </Button>
                {w.visibility !== 'private' && w.classCanEdit && (
                  <Button href={`/2d/w/${w.id.replaceAll('-', '')}`} size="sm" icon={<Users size={16} />}>
                    Build together
                  </Button>
                )}
              </LevelCard>
            ))}
            {local.map(({ d, level }) => (
              <LevelCard key={d.id} thumb={levelThumb(level, `draft:${d.id}:${d.updated}`)} smooth={level.style === 'cartoon'} title={d.title} sub={`This browser only · ${formatSavedDate(new Date(d.updated).toISOString())}`} onDelete={() => remove(d)}>
                <Button href={`/2d/build?draft=${encodeURIComponent(d.id)}`} variant="primary" size="sm" icon={<Hammer size={16} />}>
                  Open
                </Button>
                <Button size="sm" icon={<Users size={16} />} disabled={busy} onClick={() => friends(level)}>
                  With friends
                </Button>
              </LevelCard>
            ))}
          </div>
        </section>

        {signedIn && fromClass.length > 0 && (
          <section className="p2d-section" aria-labelledby="p2d-class">
            <h2 id="p2d-class">From your class</h2>
            <div className="p2d-cards">
              {fromClass.map((w) => (
                <LevelCard key={w.id} title={w.title} sub={`${w.ownerName}${w.canEdit ? ' · build together' : ' · look and play'}`}>
                  <Button href={`/2d/w/${w.id.replaceAll('-', '')}`} variant="primary" size="sm" icon={w.canEdit ? <Users size={16} /> : <Play size={16} />}>
                    {w.canEdit ? 'Join and build' : 'Visit'}
                  </Button>
                </LevelCard>
              ))}
            </div>
          </section>
        )}

        <section className="p2d-section p2d-friends" aria-labelledby="p2d-friends-title">
          <h2 id="p2d-friends-title">Play with friends</h2>
          <p className="p2d-muted">
            Pick “With friends” on a starter or browser world. Signed-in students save an account copy and choose classmates; guests open a room by link. Up to 16 players can build and play together.
            {signedIn && ' To play with your class, share a world from its menu or from My worlds.'}
          </p>
          <JoinBox />
        </section>
      </main>
    </div>
  )
}

function LevelCard({ thumb, smooth, title, sub, badge, onDelete, children }: { thumb?: string; smooth?: boolean; title: string; sub: string; badge?: boolean; onDelete?: () => void; children: React.ReactNode }) {
  return (
    <article className="p2d-level-card" aria-label={title}>
      <div className="p2d-thumb-box">
        {thumb ? <img className={`p2d-thumb${smooth ? ' p2d-smooth' : ''}`} src={thumb} alt="" draggable={false} /> : <LevelArt />}
        {badge && (
          <span className="p2d-badge" aria-hidden="true">
            <Plus size={28} />
          </span>
        )}
      </div>
      <div className="p2d-level-card-body">
        <div className="p2d-level-card-heading">
          <h3>{title}</h3>
          {onDelete && (
            <Button variant="quiet" size="sm" iconOnly icon={<Trash2 size={16} />} aria-label={`Delete ${title}`} onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
        <p className="p2d-level-card-sub">{sub}</p>
        <div className="p2d-level-card-actions">{children}</div>
      </div>
    </article>
  )
}

/** Card art for account levels (lists carry no documents, so no picture of the level itself). */
export function LevelArt() {
  return (
    <span className="p2d-level-art">
      <Art k="q:0" scale={3} look="cartoon" className="p2d-level-art-block" />
      <Art k="p:1:small:stand:0" scale={3} look="cartoon" className="p2d-level-art-hero" />
    </span>
  )
}

function JoinBox() {
  const [text, setText] = useState('')
  const [bad, setBad] = useState(false)
  return (
    <form
      className="p2d-join"
      onSubmit={(e) => {
        e.preventDefault()
        const id = parseRoomRef(text)
        if (id) window.location.assign(`/2d/r/${id}`)
        else setBad(true)
      }}
    >
      <TextField
        label="Got an invite? Paste the link"
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setBad(false)
        }}
        placeholder="…/2d/r/…"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        error={bad ? 'That doesn’t look like a 2D room link.' : undefined}
      />
      <Button type="submit" variant="primary" disabled={!text.trim()}>
        Join
      </Button>
    </form>
  )
}
