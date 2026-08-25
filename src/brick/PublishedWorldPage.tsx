import { useEffect, useState } from 'react'
import BrickStudioApp from './BrickStudioApp'
import { saveLocalBrickStudioProject } from './documentPersistence'
import { loadPublishedWorld, type PublishedWorld } from './publishedWorlds'
import { createRaceRoom } from './raceClient'

export default function PublishedWorldPage() {
  const [world, setWorld] = useState<PublishedWorld | null>(null)
  const [error, setError] = useState('')
  const [remixed, setRemixed] = useState(false)
  const [startingRace, setStartingRace] = useState(false)

  useEffect(() => {
    let active = true
    try {
      const loaded = loadPublishedWorld(window.location.hash)
      if (active) setWorld(loaded)
    } catch (reason) {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not open this world.')
    }
    return () => { active = false }
  }, [])

  if (error) {
    return <main className="published-world-state"><h1>World unavailable</h1><p>{error}</p><a href="/">Open Brick Studio</a></main>
  }
  if (remixed) return <BrickStudioApp />
  if (!world) return <main className="published-world-state"><h1>Opening published world…</h1></main>

  const remix = () => {
    let saved
    try {
      saved = saveLocalBrickStudioProject(window.localStorage, world.document.bricks)
    } catch {
      setError('This browser blocked local storage, so the remix could not be saved.')
      return
    }
    if (!saved.ok) {
      setError(saved.error.message)
      return
    }
    window.history.replaceState(null, '', '/')
    setRemixed(true)
  }

  const startRace = async () => {
    if (startingRace) return
    setStartingRace(true)
    try {
      const room = await createRaceRoom(world)
      const host = new URLSearchParams({ host: room.hostToken })
      window.location.assign(`/race/${encodeURIComponent(room.roomId)}#${host}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start the race room.')
      setStartingRace(false)
    }
  }

  return <BrickStudioApp publishedWorld={world} onRemix={remix} onStartRace={startRace} />
}
