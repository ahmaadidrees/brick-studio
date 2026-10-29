import { useCallback, useEffect, useRef, useState } from 'react'
import { EyeOff, LoaderCircle, RefreshCw, ScanEye, Trash2, Undo2 } from 'lucide-react'
import { Button } from '../../ui'
import type { ClassroomRaceHeroes } from '../../classroom/contracts'
import { ConfirmDialog } from '../../classroom/ConfirmDialog'
import { errorMessage } from '../../classroom/panelShared'
import { shelfClient, type ShelfItem } from '../../classroom/shelfClient'
import type { ClassPageClass, ClassPageClient } from './classPageData'

type Props = {
  client: ClassPageClient
  currentClass: ClassPageClass
  busy: boolean
  /** The page's busy/error wrapper: clears the banners, shows a failure as the page error. */
  run: (work: () => Promise<void>) => void
  onNotice: (message: string) => void
  onError: (message: string) => void
  /** Same as Settings: PATCH /classes/:id, then the page reloads the class it returns. */
  onPatch: (body: Record<string, unknown>, notice?: string) => void
}

/** What "Peek" shows: read from the power file, never run. */
type Peek = { scripts: number; variables: string[]; credits: string[] }

const RACE_OPTIONS: ReadonlyArray<{ value: ClassroomRaceHeroes; label: string; description: string; notice: string }> = [
  { value: 'builtin', label: 'Built-in Heroes only', description: 'Everyone races with the Heroes that come with Brickgineers.', notice: 'Only built-in Heroes can race.' },
  { value: 'shelf', label: 'Built-in and class shelf', description: 'Heroes on this class shelf can race too.', notice: 'Built-in Heroes and Heroes on the class shelf can race.' },
  { value: 'any', label: 'Anything', description: 'Any Hero a student makes can race, even ones that are not on the shelf.', notice: 'Any Hero can race.' },
]

function readPeek(payload: unknown): Peek {
  const file = (payload && typeof payload === 'object' ? payload : {}) as { blocks?: unknown; variables?: unknown; credits?: unknown }
  const blocks = Array.isArray(file.blocks) ? file.blocks : []
  const variables = Array.isArray(file.variables)
    ? file.variables.map(item => (item && typeof item === 'object' ? (item as { name?: unknown }).name : null)).filter((name): name is string => typeof name === 'string' && name.length > 0)
    : []
  const credits = Array.isArray(file.credits) ? file.credits.filter((name): name is string => typeof name === 'string') : []
  return { scripts: blocks.length, variables, credits }
}

/** How often an open Shelf tab checks for new bricks, while the page is on screen. */
export const SHELF_REFRESH_MS = 20_000

const nameId = (item: ShelfItem) => `class-shelf-name-${item.id}`
const usedBy = (uses: number) => `Used by ${uses} ${uses === 1 ? 'classmate' : 'classmates'}`

/**
 * The class shelf: power bricks students shared, the ones waiting for the teacher first, and the two
 * rules that go with it. Makers show as first name and last initial (the Worker sends nothing else).
 */
export function ShelfTab({ client, currentClass, busy, run, onNotice, onError, onPatch }: Props) {
  const shelf = useState(() => shelfClient(client))[0]
  const [items, setItems] = useState<ShelfItem[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [settings, setSettings] = useState<{ needsReview: boolean; raceHeroes: ClassroomRaceHeroes } | null>(null)
  const [peeks, setPeeks] = useState<Record<string, Peek>>({})
  const [deleteTarget, setDeleteTarget] = useState<ShelfItem | null>(null)
  /** The Refresh press being answered (0: none). */
  const [refreshing, setRefreshing] = useState(0)
  // Every list request and every change made here takes a ticket; a list answer older than the newest ticket is
  // dropped, so a slow check can never undo "Put on shelf" or bring back a deleted brick.
  const latest = useRef(0)

  /**
   * 'first': the tab opening (or Try again): a loading line, then the list or an error. 'refresh' (the button) and 'poll'
   * (every SHELF_REFRESH_MS) keep the list and open Peeks on screen and swap in the new list when it comes; a failed
   * poll stays quiet and the next one tries again.
   */
  const fetchList = useCallback(async (mode: 'first' | 'refresh' | 'poll') => {
    const ticket = ++latest.current
    if (mode === 'first') { setLoading(true); setFailed(false); setItems([]); setPeeks({}) }
    if (mode === 'refresh') setRefreshing(ticket)
    try {
      const result = await shelf.list(currentClass.id)
      if (ticket !== latest.current) return
      const next = result.items ?? []
      setItems(next)
      setSettings({ needsReview: result.needsReview, raceHeroes: result.raceHeroes })
      setLoading(false); setFailed(false)
      // A Peek stays open while its brick is still on the list.
      setPeeks(current => Object.fromEntries(Object.entries(current).filter(([id]) => next.some(item => item.id === id))))
    } catch (failure) {
      if (ticket !== latest.current || mode === 'poll') return
      if (mode === 'first') { setFailed(true); setLoading(false) }
      onError(errorMessage(failure))
    } finally {
      setRefreshing(current => (current === ticket ? 0 : current))
    }
  }, [shelf, currentClass.id, onError])
  const load = useCallback(() => { void fetchList('first') }, [fetchList])
  useEffect(() => {
    void fetchList('first')
    // Leaving the tab (or another class): any answer still on its way is old.
    return () => { latest.current++ }
  }, [fetchList])
  // New bricks show up by themselves while the page is on screen, and as soon as the teacher comes back to it.
  useEffect(() => {
    const check = () => { if (document.visibilityState === 'visible') void fetchList('poll') }
    const timer = window.setInterval(check, SHELF_REFRESH_MS)
    document.addEventListener('visibilitychange', check)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', check) }
  }, [fetchList])

  // The class row is the source of truth once the page has it; the list's copy covers an older class payload.
  const needsReview = currentClass.shelfNeedsReview ?? settings?.needsReview ?? true
  const raceHeroes = currentClass.raceHeroes ?? settings?.raceHeroes ?? 'shelf'

  const waiting = items.filter(item => item.status === 'pending')
  const onShelf = items.filter(item => item.status === 'approved')
  const hidden = items.filter(item => item.status === 'hidden')

  const review = (item: ShelfItem, status: 'approved' | 'hidden', message: string) => run(async () => {
    const updated = await shelf.review(currentClass.id, item.id, status)
    latest.current++
    setItems(list => list.map(row => row.id === item.id ? { ...row, ...updated } : row))
    onNotice(message)
  })
  const togglePeek = (item: ShelfItem) => {
    if (peeks[item.id]) { setPeeks(({ [item.id]: _closed, ...rest }) => rest); return }
    run(async () => {
      const full = await shelf.get(currentClass.id, item.id)
      setPeeks(current => ({ ...current, [item.id]: readPeek(full.payload) }))
    })
  }
  const remove = (item: ShelfItem) => run(async () => {
    await shelf.remove(currentClass.id, item.id)
    latest.current++
    setItems(list => list.filter(row => row.id !== item.id))
    onNotice(`“${item.name}” is gone from the shelf.`)
  })

  const peekButton = (item: ShelfItem) => <Button
    variant="quiet"
    size="sm"
    icon={<ScanEye size={16} />}
    disabled={busy}
    aria-expanded={Boolean(peeks[item.id])}
    aria-controls={`class-shelf-peek-${item.id}`}
    aria-describedby={nameId(item)}
    onClick={() => togglePeek(item)}
  >{peeks[item.id] ? 'Close peek' : 'Peek'}</Button>

  const peekPanel = (item: ShelfItem) => {
    const peek = peeks[item.id]
    if (!peek) return null
    return <dl id={`class-shelf-peek-${item.id}`} className="class-shelf-peek" aria-label={`Inside ${item.name}`}>
      <div><dt>Scripts</dt><dd>{peek.scripts} {peek.scripts === 1 ? 'script' : 'scripts'}</dd></div>
      <div><dt>Variables</dt><dd>{peek.variables.length ? peek.variables.join(', ') : 'None'}</dd></div>
      <div><dt>Made by</dt><dd>{peek.credits.length ? peek.credits.join(' → ') : item.by}</dd></div>
    </dl>
  }

  const what = (item: ShelfItem) => item.what ? <p className="class-shelf-what">{item.what}</p> : null

  return <>
    <section className="class-section" aria-labelledby="class-shelf-waiting-title">
      <div className="class-section-head">
        <h2 id="class-shelf-waiting-title" className="class-section-title">Waiting for you</h2>
        <span className={`class-chip class-chip-${needsReview ? 'on' : 'off'}`}>Check first: {needsReview ? 'On' : 'Off'}</span>
        <Button
          variant="quiet"
          size="sm"
          icon={<RefreshCw size={16} className={refreshing ? 'ui-spin' : undefined} />}
          disabled={loading || refreshing !== 0}
          title="The shelf also checks by itself every few seconds"
          onClick={() => void fetchList('refresh')}
        >{refreshing ? 'Checking…' : 'Refresh'}</Button>
      </div>
      {loading
        ? <p role="status" className="class-loading"><LoaderCircle className="ui-spin" size={18} aria-hidden="true" /> Loading the shelf…</p>
        : failed
          ? <div className="class-actions"><p className="class-help">The shelf did not load.</p><Button variant="secondary" size="sm" onClick={load}>Try again</Button></div>
          : waiting.length
            ? <ul className="class-card-row" aria-label="Bricks waiting for you">
              {waiting.map(item => <li key={item.id} className="class-card">
                <div className="class-card-head"><strong id={nameId(item)} className="class-card-title">{item.name}</strong></div>
                <p className="class-card-owner">by {item.by}</p>
                {what(item)}
                {peekPanel(item)}
                <div className="class-card-actions">
                  {peekButton(item)}
                  <Button variant="primary" size="sm" disabled={busy} aria-describedby={nameId(item)} onClick={() => review(item, 'approved', `“${item.name}” is on the shelf. The class can use it now.`)}>Put on shelf</Button>
                  <Button variant="quiet" size="sm" disabled={busy} aria-describedby={nameId(item)} onClick={() => review(item, 'hidden', `“${item.name}” is hidden from the class. You can put it back any time.`)}>Not now</Button>
                </div>
              </li>)}
            </ul>
            : <p className="class-help">{needsReview
              ? 'Nothing waiting. When a student shares a brick, it waits here until you put it on the shelf.'
              : 'Nothing waiting. Checking is off, so students’ bricks go straight onto the shelf.'}</p>}
    </section>

    {!loading && !failed && <section className="class-section" aria-labelledby="class-shelf-on-title">
      <h2 id="class-shelf-on-title" className="class-section-title">On the shelf</h2>
      {onShelf.length
        ? <ul className="class-card-row" aria-label="Bricks on the shelf">
          {onShelf.map(item => <li key={item.id} className="class-card">
            <div className="class-card-head"><strong id={nameId(item)} className="class-card-title">{item.name}</strong></div>
            <p className="class-card-owner">by {item.by} · {usedBy(item.uses)}</p>
            {what(item)}
            {peekPanel(item)}
            <div className="class-card-actions">
              {peekButton(item)}
              <Button variant="quiet" size="sm" icon={<EyeOff size={16} />} disabled={busy} aria-describedby={nameId(item)} onClick={() => review(item, 'hidden', `“${item.name}” is off the shelf. Classmates can’t add it any more.`)}>Hide</Button>
            </div>
          </li>)}
        </ul>
        : <p className="class-help">The shelf is empty. Bricks you put on it show up here for the whole class.</p>}
      {hidden.length > 0 && <>
        <h3 className="class-shelf-hidden-title">Hidden</h3>
        <ul className="class-card-row" aria-label="Hidden bricks">
          {hidden.map(item => <li key={item.id} className="class-card class-card-hidden">
            <div className="class-card-head"><strong id={nameId(item)} className="class-card-title">{item.name}</strong></div>
            <p className="class-card-owner">by {item.by} · Hidden from the class</p>
            {what(item)}
            <div className="class-card-actions">
              <Button variant="quiet" size="sm" icon={<Undo2 size={16} />} disabled={busy} aria-describedby={nameId(item)} onClick={() => review(item, 'approved', `“${item.name}” is back on the shelf.`)}>Put back</Button>
              <Button variant="quiet" size="sm" icon={<Trash2 size={16} />} disabled={busy} aria-describedby={nameId(item)} onClick={() => setDeleteTarget(item)}>Delete</Button>
            </div>
          </li>)}
        </ul>
      </>}
    </section>}

    <section className="class-section" aria-labelledby="class-shelf-settings-title">
      <h2 id="class-shelf-settings-title" className="class-section-title">Shelf settings</h2>
      <div className="class-setting-row">
        <div><div className="class-setting-title"><strong id="class-setting-shelf-review">Check bricks before the class sees them</strong></div><small>{needsReview ? 'A student’s brick waits for you before it goes on the shelf.' : 'Students’ bricks go straight onto the shelf for the class.'}</small></div>
        <button type="button" role="switch" className="classroom-switch" aria-checked={needsReview} aria-labelledby="class-setting-shelf-review" disabled={busy} onClick={() => onPatch({ shelfNeedsReview: !needsReview }, needsReview ? 'Students’ bricks now go straight onto the shelf.' : 'Students’ bricks now wait for you first.')}>
          <span className="classroom-switch-track" aria-hidden="true"><span className="classroom-switch-knob" /></span>
          <span className="classroom-switch-state">{needsReview ? 'On' : 'Off'}</span>
        </button>
      </div>
      <fieldset className="class-setting-row class-radio-group">
        <legend className="class-setting-title"><strong>Which Heroes can race?</strong></legend>
        <div className="class-radio-list">
          {RACE_OPTIONS.map(option => <label key={option.value} className="class-radio">
            <input
              type="radio"
              name={`class-race-heroes-${currentClass.id}`}
              value={option.value}
              checked={raceHeroes === option.value}
              aria-labelledby={`class-race-${option.value}-label`}
              aria-describedby={`class-race-${option.value}-hint`}
              onChange={() => { if (!busy && option.value !== raceHeroes) onPatch({ raceHeroes: option.value }, option.notice) }}
            />
            <span><strong id={`class-race-${option.value}-label`}>{option.label}</strong><small id={`class-race-${option.value}-hint`}>{option.description}</small></span>
          </label>)}
        </div>
        <p className="class-help">Hackable Platformers can’t race yet; this is the rule they’ll follow when they can.</p>
      </fieldset>
    </section>

    <ConfirmDialog
      open={deleteTarget !== null}
      title={`Delete “${deleteTarget?.name ?? ''}”?`}
      description="It comes off the shelf for good. This can’t be undone."
      confirmLabel="Delete"
      cancelLabel="Keep it"
      busy={busy}
      onCancel={() => setDeleteTarget(null)}
      onConfirm={() => { if (deleteTarget) remove(deleteTarget); setDeleteTarget(null) }}
    >
      <p>Copies classmates already snapped onto their own bricks stay in their projects.</p>
    </ConfirmDialog>
  </>
}
