import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { BRAND_NAME } from '../brand'
import { Button, Dialog } from '../ui'
import BrickStudioApp from './BrickStudioApp'
import { BRICK_STUDIO_LOCAL_STORAGE_KEY, saveLocalBrickStudioProject } from './documentPersistence'
import { loadPublishedWorld, type PublishedWorld } from './publishedWorlds'

/**
 * Read-only viewer for `/world#…` links (board 15). The world opens straight into Explore
 * through BrickStudioApp; "Make a copy" starts a guest remix, which replaces the browser's
 * guest draft only after an explicit confirmation.
 */
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
    return (
      <main className="published-world-state" aria-labelledby="published-world-state-title">
        <h1 id="published-world-state-title">World unavailable</h1>
        <p>{error}</p>
        <a href="/build">Go to builder</a>
      </main>
    )
  }
  if (remixed) return <BrickStudioApp />
  if (!world) {
    return (
      <main className="published-world-state" aria-busy="true" aria-labelledby="published-world-state-title">
        <h1 id="published-world-state-title">Opening this world…</h1>
        <p>Just a moment while {BRAND_NAME} gets things ready.</p>
      </main>
    )
  }

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
      setRemixError('This browser blocked local storage, so the copy could not be saved.')
      return
    }
    // The copy is now the guest draft, so the address must be the builder, not the landing page.
    window.history.replaceState(null, '', '/build')
    setRemixed(true)
  }

  return <>
    <BrickStudioApp publishedWorld={world} onRemix={() => remix()} />
    <Dialog
      open={confirmReplacement}
      onClose={() => { setConfirmReplacement(false); setRemixError('') }}
      title="Replace your guest draft?"
      description="This will replace the build saved in this browser. To keep it, cancel and download your current build first."
      footer={<>
        <Button variant="secondary" onClick={() => { setConfirmReplacement(false); setRemixError('') }}>Cancel</Button>
        <Button variant="danger" icon={<Copy size={16} />} onClick={() => remix(true)}>Replace draft and make a copy</Button>
      </>}
    >
      <p className="published-world-dialog-copy">You are copying <strong>{world.title}</strong> into this browser as your guest build.</p>
      {remixError && <p className="published-world-dialog-error" role="alert">{remixError}</p>}
    </Dialog>
    {!confirmReplacement && remixError && <p className="published-world-remix-error" role="alert">{remixError}</p>}
  </>
}
