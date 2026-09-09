import { useEffect, useRef, useState } from 'react'
import BrickStudioApp from './BrickStudioApp'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY, saveLocalBrickStudioProject } from './documentPersistence'
import { loadPublishedWorld, type PublishedWorld } from './publishedWorlds'

function ReplacementDialog({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} onCancel={onCancel} aria-labelledby="remix-replace-title"
    style={{ maxWidth: 'min(28rem, 90vw)', borderRadius: 16, padding: 24, border: '1px solid #bccbd2' }}>
    {children}
  </dialog>
}

export default function PublishedWorldPage() {
  const [world, setWorld] = useState<PublishedWorld | null>(null)
  const [error, setError] = useState('')
  const [remixError, setRemixError] = useState('')
  const [remixed, setRemixed] = useState(false)
  const [confirmReplacement, setConfirmReplacement] = useState(false)

  useEffect(() => {
    let active = true
    loadPublishedWorld(window.location.hash)
      .then((loaded) => { if (active) setWorld(loaded) })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not open this world.')
      })
    return () => { active = false }
  }, [])

  if (error) {
    return <main className="published-world-state"><h1>World unavailable</h1><p>{error}</p><a href="/">Open Brick Studio</a></main>
  }
  if (remixed) return <BrickStudioApp />
  if (!world) return <main className="published-world-state"><h1>Opening published world…</h1></main>

  const remix = (replaceExisting = false) => {
    setRemixError('')
    try {
      // Reading must succeed before saving: a blocked read is not an empty draft.
      if (!replaceExisting && window.localStorage.getItem(BRICK_STUDIO_LOCAL_STORAGE_KEY) !== null) {
        setConfirmReplacement(true)
        return
      }
      const saved = saveLocalBrickStudioProject(window.localStorage, world.document)
      if (!saved.ok) {
        setRemixError(saved.error.message)
        return
      }
    } catch {
      setRemixError('This browser blocked local storage, so the remix could not be saved.')
      return
    }
    window.history.replaceState(null, '', '/')
    setRemixed(true)
  }

  return <>
    <BrickStudioApp publishedWorld={world} onRemix={() => remix()} />
    {confirmReplacement && <ReplacementDialog onCancel={() => setConfirmReplacement(false)}>
        <h2 id="remix-replace-title">Replace your guest draft?</h2>
        <p>Remixing replaces the build saved in this browser. To keep it, cancel and open Brick Studio in another tab to export it first.</p>
        {remixError && <p role="alert">{remixError}</p>}
        <button type="button" onClick={() => { setConfirmReplacement(false); setRemixError('') }}>Cancel</button>
        <button type="button" onClick={() => remix(true)}>Replace draft and remix</button>
    </ReplacementDialog>}
    {!confirmReplacement && remixError && <p role="alert">{remixError}</p>}
  </>
}
