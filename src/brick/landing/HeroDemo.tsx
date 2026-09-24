import { Maximize2, Pause, Play, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

/*
 * The hero's demo: the recorded 3D and 2D clips (scripts/demo) play one after the other. The 3D | 2D pill shows which
 * is on and how far along it is, and jumps on a click; Pause stops the motion (it plays on its own for longer than
 * five seconds); Full screen opens the whole-screen cut with its captions. With reduced motion nothing plays until
 * asked: each clip shows its finished build. The clips (about a megabyte) wait until the page itself has loaded;
 * until then the poster stands in, so they never hold up the first paint.
 */

const MEDIA_BASE = '/brand/media'

const CLIPS = [
  { key: '3d', label: '3D', name: 'Building a rainbow staircase from bricks in 3D, then climbing it as a character' },
  { key: '2d', label: '2D', name: 'Building a 2D world from bricks and a spring, then running and jumping through it' },
] as const

type ClipKey = (typeof CLIPS)[number]['key']

// React does not write `muted` as an attribute, and browsers only autoplay muted video, so set it on the element.
// The clips have no sound anyway.
function mute(el: HTMLVideoElement | null) {
  if (!el) return
  el.defaultMuted = true
  el.muted = true
}

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

export function HeroDemo() {
  const [reduced] = useState(prefersReducedMotion)
  const [view, setView] = useState<ClipKey>('3d')
  const [done, setDone] = useState(0)
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const video = useRef<HTMLVideoElement | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const [fullOpen, setFullOpen] = useState(false)
  const [pageLoaded, setPageLoaded] = useState(() => typeof document !== 'undefined' && document.readyState === 'complete')
  const pills = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => {
    if (pageLoaded) return
    const done = () => setPageLoaded(true)
    window.addEventListener('load', done, { once: true })
    return () => window.removeEventListener('load', done)
  }, [pageLoaded])
  // Whether the hero was playing when full screen opened, so closing it picks up where it was.
  const resume = useRef(false)

  const attach = useCallback((el: HTMLVideoElement | null) => {
    video.current = el
    mute(el)
  }, [])

  useEffect(() => {
    const el = video.current
    if (!el) return
    if (playing) el.play()?.catch(() => setPlaying(false))
    else el.pause()
  }, [playing, view])

  const show = (key: ClipKey) => {
    setDone(0)
    setView(key)
  }
  const next = () => show(view === '3d' ? '2d' : '3d')
  // A radio group: arrow keys move the choice (and focus) between 3D and 2D; Tab reaches only the chosen one.
  const onPillKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const i = CLIPS.findIndex((c) => c.key === view)
    const to = (i + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? CLIPS.length - 1 : 1)) % CLIPS.length
    show(CLIPS[to].key)
    pills.current[to]?.focus()
  }
  const clip = CLIPS.find((c) => c.key === view)!

  const openFull = () => {
    resume.current = playing
    setPlaying(false)
    setFullOpen(true)
  }
  const closeFull = () => dialog.current?.close?.()

  // The full-screen video only exists while its dialog is open, so it loads on demand and starts from the top.
  useEffect(() => {
    if (fullOpen) dialog.current?.showModal?.()
  }, [fullOpen])

  return (
    <figure className="landing-demo">
      {pageLoaded ? (
        <video
          key={view}
          ref={attach}
          className="landing-demo-video"
          aria-label={clip.name}
          playsInline
          preload="metadata"
          autoPlay={playing}
          poster={`${MEDIA_BASE}/demo-${view}-poster.jpg`}
          width={960}
          height={720}
          onTimeUpdate={(event) => {
            const el = event.currentTarget
            if (el.duration) setDone(el.currentTime / el.duration)
          }}
          onEnded={next}
        >
          <source src={`${MEDIA_BASE}/demo-${view}.webm`} type="video/webm" />
          <source src={`${MEDIA_BASE}/demo-${view}.mp4`} type="video/mp4" />
        </video>
      ) : (
        <img className="landing-demo-video" src={`${MEDIA_BASE}/demo-${view}-poster.jpg`} alt={clip.name} width={960} height={720} />
      )}
      <div className="landing-demo-controls">
        <button type="button" className="landing-demo-button" aria-label={playing ? 'Pause the demo' : 'Play the demo'} onClick={() => setPlaying((p) => !p)}>
          {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="landing-demo-button landing-demo-full" onClick={openFull}>
          <Maximize2 size={18} aria-hidden="true" />
          Full screen
        </button>
      </div>
      <div className="landing-demo-switch" role="radiogroup" aria-label="Show the 3D or 2D builder">
        {CLIPS.map((c) => (
          <button
            key={c.key}
            ref={(el) => { pills.current[CLIPS.indexOf(c)] = el }}
            type="button"
            role="radio"
            aria-checked={view === c.key}
            tabIndex={view === c.key ? 0 : -1}
            className={`landing-demo-pill landing-demo-pill-${c.key}`}
            onClick={() => show(c.key)}
            onKeyDown={onPillKey}
          >
            {c.label}
            <span className="landing-demo-progress" aria-hidden="true" style={{ width: view === c.key && !reduced ? `${Math.round(done * 100)}%` : 0 }} />
          </button>
        ))}
      </div>
      <dialog ref={dialog} className="landing-demo-dialog" aria-label="Brickgineers demo" onClose={() => {
        setFullOpen(false)
        if (resume.current) setPlaying(true)
      }}>
        {fullOpen && (
          <video ref={mute} className="landing-demo-dialog-video" controls autoPlay playsInline width={1280} height={720}>
            <source src={`${MEDIA_BASE}/demo-full.mp4`} type="video/mp4" />
          </video>
        )}
        <button type="button" className="landing-demo-close" aria-label="Close" onClick={closeFull} autoFocus>
          <X size={22} aria-hidden="true" />
        </button>
      </dialog>
    </figure>
  )
}
