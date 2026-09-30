import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import type { BrickDef } from '../bricks/builtins'
import { blankFrame, fillPixels, paintPixel, TRANSPARENT, type CostumeSet } from '../costumes/model'
import { seedCostumeSet } from '../costumes/seed'
import { costumeFrameCanvas, costumeFrameThumbnail } from '../render/costumes'
import './costume.css'

type Tool = 'pencil' | 'eraser' | 'fill'
const COLORS = ['#26323f', '#ffffff', '#e7473c', '#ff8b3d', '#ffc93c', '#4cae62', '#3e83d7', '#7b5cd1', '#f27bb0', '#8c624a']
const HISTORY_LIMIT = 50

function sameAppearance(a: CostumeSet | null, b: CostumeSet | null) {
  return a === b || !!a && !!b && a.version === b.version && a.width === b.width && a.height === b.height && a.fps === b.fps &&
    a.frames.length === b.frames.length && a.frames.every((frame, i) => frame.id === b.frames[i].id && frame.name === b.frames[i].name && frame.pixels === b.frames[i].pixels)
}

export function CostumePanel({ definition, onChange }: { definition: BrickDef; onChange: (appearance: CostumeSet) => void }) {
  const [draft, setDraft] = useState<CostumeSet | null>(definition.appearance ?? null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(0)
  const [tool, setTool] = useState<Tool>('pencil')
  const [color, setColor] = useState('#e7473c')
  const [playing, setPlaying] = useState(false)
  const [preview, setPreview] = useState(0)
  const [, setHistoryVersion] = useState(0)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const draftRef = useRef(draft)
  const drawing = useRef(false)
  const strokeCheckpointed = useRef(false)
  const undo = useRef<CostumeSet[]>([])
  const redo = useRef<CostumeSet[]>([])
  const loadedId = useRef<string | null>(null)
  const incomingWasSaved = useRef(!!definition.appearance)
  draftRef.current = draft

  useEffect(() => {
    const incoming = definition.appearance ?? null
    const differentBrick = loadedId.current !== definition.id
    const externalChange = incoming ? !sameAppearance(incoming, draftRef.current) : incomingWasSaved.current
    incomingWasSaved.current = !!incoming
    if (!differentBrick && !externalChange) return
    loadedId.current = definition.id
    let active = true
    setSelected(0)
    setPreview(0)
    setPlaying(false)
    setError('')
    undo.current = []
    redo.current = []
    setHistoryVersion((n) => n + 1)
    if (incoming) {
      setDraft(incoming)
      return () => { active = false }
    }
    setDraft(null)
    seedCostumeSet(definition).then((seed) => {
      if (active) setDraft(seed)
    }).catch(() => {
      if (active) setError('Could not load this artwork. Try reopening Costumes.')
    })
    return () => { active = false }
    // A new brick selection starts a new editing history. Local edits drive draft directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition.id, definition.appearance])

  const frame = draft?.frames[selected]
  useEffect(() => {
    if (!draft || !frame) return
    const c = canvasRef.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    c.width = draft.width
    c.height = draft.height
    g.imageSmoothingEnabled = false
    g.clearRect(0, 0, c.width, c.height)
    g.drawImage(costumeFrameCanvas(draft, frame), 0, 0)
  }, [draft, frame])

  useEffect(() => {
    if (!playing || !draft || draft.frames.length < 2) return
    const timer = window.setInterval(() => setPreview((n) => (n + 1) % draft.frames.length), 1000 / draft.fps)
    return () => window.clearInterval(timer)
  }, [playing, draft?.fps, draft?.frames.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const thumbs = useMemo(() => draft?.frames.map((_, i) => costumeFrameThumbnail(draft, i)) ?? [], [draft])

  function publish(next: CostumeSet) {
    draftRef.current = next
    setDraft(next)
    onChange(next)
  }

  function checkpoint() {
    const now = draftRef.current
    if (!now) return
    undo.current = [...undo.current.slice(-(HISTORY_LIMIT - 1)), now]
    redo.current = []
    setHistoryVersion((n) => n + 1)
  }

  function change(next: CostumeSet) {
    if (next === draftRef.current) return
    checkpoint()
    publish(next)
  }

  function travel(direction: 'undo' | 'redo') {
    const source = direction === 'undo' ? undo : redo
    const destination = direction === 'undo' ? redo : undo
    const current = draftRef.current
    const next = source.current.pop()
    if (!next || !current) return
    destination.current.push(current)
    setSelected((i) => Math.min(i, next.frames.length - 1))
    setHistoryVersion((n) => n + 1)
    publish(next)
  }

  function point(event: PointerEvent<HTMLCanvasElement>) {
    const c = event.currentTarget
    const box = c.getBoundingClientRect()
    return { x: Math.floor((event.clientX - box.left) * c.width / box.width), y: Math.floor((event.clientY - box.top) * c.height / box.height) }
  }

  function draw(event: PointerEvent<HTMLCanvasElement>, first: boolean) {
    const set = draftRef.current
    if (!set || !set.frames[selected]) return
    const { x, y } = point(event)
    const ink = tool === 'eraser' ? TRANSPARENT : `${color.slice(1).toLowerCase()}ff`
    if (x < 0 || y < 0 || x >= set.width || y >= set.height) return
    const next = tool === 'fill' ? (first ? fillPixels(set, selected, x, y, ink) : set) : paintPixel(set, selected, x, y, ink)
    if (next === set) return
    if (!strokeCheckpointed.current) {
      checkpoint()
      strokeCheckpointed.current = true
    }
    publish(next)
  }

  function newFrame(duplicate: boolean) {
    const set = draftRef.current
    if (!set || set.frames.length >= 32) return
    const index = selected + 1
    const id = `frame-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    const frame = duplicate
      ? { ...set.frames[selected], id, name: `${set.frames[selected].name} copy` }
      : blankFrame(set, id, `Frame ${set.frames.length + 1}`)
    const frames = set.frames.slice()
    frames.splice(index, 0, frame)
    change({ ...set, frames })
    setSelected(index)
    setPreview(index)
  }

  function removeFrame() {
    const set = draftRef.current
    if (!set || set.frames.length <= 1) return
    change({ ...set, frames: set.frames.filter((_, i) => i !== selected) })
    setSelected(Math.max(0, selected - 1))
    setPreview(0)
  }

  if (!draft || !frame) return <div className="lab-costume-loading" role="status">{error || 'Loading the current artwork…'}</div>

  const previewUrl = playing ? thumbs[preview] : thumbs[selected]
  return <section className="lab-costume-panel" role="tabpanel" aria-label={`${definition.name} costumes`} onKeyDown={(event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      travel(event.shiftKey ? 'redo' : 'undo')
    }
  }}>
    <div className="lab-costume-heading">
      <div><strong>Costumes</strong><span>Draw every frame of {definition.name}. Code can switch or play them.</span></div>
      <div className="lab-costume-history">
        <button type="button" onClick={() => travel('undo')} disabled={!undo.current.length} aria-label="Undo costume edit">Undo</button>
        <button type="button" onClick={() => travel('redo')} disabled={!redo.current.length} aria-label="Redo costume edit">Redo</button>
      </div>
    </div>
    <div className="lab-costume-workspace">
      <div className="lab-costume-editor">
        <div className="lab-costume-tools" role="toolbar" aria-label="Drawing tools">
          {(['pencil', 'eraser', 'fill'] as const).map((choice) => <button key={choice} type="button" className={tool === choice ? 'active' : ''} aria-pressed={tool === choice} onClick={() => setTool(choice)}>{choice === 'fill' ? 'Paint bucket' : choice[0].toUpperCase() + choice.slice(1)}</button>)}
        </div>
        <canvas ref={canvasRef} className="lab-costume-canvas" width={draft.width} height={draft.height} aria-label={`Paint ${frame.name}`} onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture(event.pointerId)
          drawing.current = true
          strokeCheckpointed.current = false
          draw(event, true)
        }} onPointerMove={(event) => {
          if (drawing.current) draw(event, false)
        }} onPointerUp={() => { drawing.current = false }} onPointerCancel={() => { drawing.current = false }} />
        <div className="lab-costume-colors" aria-label="Paint colors">
          {COLORS.map((option) => <button key={option} type="button" className={color === option && tool !== 'eraser' ? 'selected' : ''} style={{ backgroundColor: option }} title={option} aria-label={`Use ${option} paint`} aria-pressed={color === option && tool !== 'eraser'} onClick={() => { setColor(option); setTool('pencil') }} />)}
          <label className="lab-costume-custom-color">Color <input type="color" value={color} onChange={(event) => { setColor(event.target.value); setTool('pencil') }} aria-label="Choose custom paint color" /></label>
        </div>
      </div>
      <div className="lab-costume-side">
        <div className="lab-costume-preview"><span>Preview</span><img src={previewUrl} alt={`${playing ? 'Animated' : frame.name} costume preview`} /></div>
        <label className="lab-costume-fps">Preview frames per second <input type="number" min="1" max="30" step="1" value={draft.fps} onChange={(event) => {
          const fps = Math.round(Number(event.target.value))
          if (fps >= 1 && fps <= 30) change({ ...draft, fps })
        }} /></label>
        <p>Frame blocks set playback speed on the stage.</p>
        <button type="button" onClick={() => { setPreview(selected); setPlaying(!playing) }} disabled={draft.frames.length < 2}>{playing ? 'Stop preview' : 'Play preview'}</button>
        <label className="lab-costume-frame-name">Frame name <input value={frame.name} maxLength={40} onChange={(event) => {
          const frames = draft.frames.slice()
          frames[selected] = { ...frame, name: event.target.value }
          change({ ...draft, frames })
        }} /></label>
        <p>{draft.frames.length} of 32 frames · {draft.width} × {draft.height} pixels</p>
      </div>
    </div>
    <div className="lab-costume-strip-heading"><strong>Sprite sheet</strong><div><button type="button" onClick={() => newFrame(false)} disabled={draft.frames.length >= 32}>+ Frame</button><button type="button" onClick={() => newFrame(true)} disabled={draft.frames.length >= 32}>Duplicate</button><button type="button" onClick={removeFrame} disabled={draft.frames.length <= 1}>Delete</button></div></div>
    <div className="lab-costume-strip" role="list" aria-label="Costume frames">{draft.frames.map((item, i) => <button type="button" role="listitem" key={item.id} className={i === selected ? 'selected' : ''} onClick={() => { setSelected(i); setPreview(i) }} aria-label={`Frame ${i + 1}: ${item.name}`} aria-current={i === selected ? 'true' : undefined}><img src={thumbs[i]} alt="" /><span>{i + 1}. {item.name || 'Untitled'}</span></button>)}</div>
  </section>
}
