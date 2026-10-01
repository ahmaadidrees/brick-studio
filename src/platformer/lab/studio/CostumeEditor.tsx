import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  Eraser,
  PaintBucket,
  Pencil,
  Plus,
  Redo2,
  Slash,
  Square,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { Costume } from '../core/contracts'
import { blankImage, costumeFromImage, type PixelImage } from './pixels'
import { STAGE_ID, useStudio, type StudioStore } from './store'
import { BACKDROP_WORDS, chooseUniqueName, COSTUME_WORDS } from './assets/words'
import {
  cloneImage,
  costumeToPixelImage,
  drawLine,
  drawRect,
  EditHistory,
  floodFill,
  getPixel,
  hexToRgba,
  resizeImage,
  savePixelImageToCostume,
  setPixel,
  TRANSPARENT,
  type ColorRGBA,
  type DrawingTool,
} from './assets/pixelOps'
import { WordPickerModal } from './assets/WordPickerModal'
import './assets/assets.css'

const PALETTE_COLORS = [
  '#000000',
  '#404040',
  '#a0a0a0',
  '#ffffff',
  '#e7473c',
  '#ff8b3d',
  '#ffc93c',
  '#4cae62',
  '#30d5c8',
  '#3e83d7',
  '#7b5cd1',
  '#d44dd6',
  '#f27bb0',
  '#8c624a',
]

export function CostumeEditor({ store }: { store: StudioStore }) {
  const selectedBrickId = useStudio(store, (s) => s.selectedBrickId)
  const isStage = selectedBrickId === STAGE_ID

  const brick = useStudio(store, (s) =>
    s.selectedBrickId === STAGE_ID
      ? s.project.design.stage
      : s.project.design.bricks.find((b) => b.id === s.selectedBrickId)
  )
  const bounds = useStudio(store, (s) => s.project.design.bounds)

  // Level view size for stage backdrops: 480 × 360
  const levelViewWidth = Math.min(bounds.right - bounds.left, 480)
  const levelViewHeight = bounds.top - bounds.bottom

  const costumes: Costume[] = brick?.costumes ?? []
  const [activeCostumeIndex, setActiveCostumeIndex] = useState(0)

  // Editor states
  const [tool, setTool] = useState<DrawingTool>('pencil')
  const [rectFilled, setRectFilled] = useState(true)
  const [colorHex, setColorHex] = useState('#e7473c')
  const [customColor, setCustomColor] = useState('#3a75e2')
  const [zoom, setZoom] = useState(12)
  const [addingCostume, setAddingCostume] = useState(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  // Working image buffer & center
  const [pixelImg, setPixelImg] = useState<PixelImage>(() => blankImage(32, 32))
  const [center, setCenter] = useState<{ x: number; y: number }>({ x: 16, y: 16 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const historyRef = useRef<EditHistory>(new EditHistory(40))
  const isDrawing = useRef(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const isDraggingCenter = useRef(false)
  const currentCostumeRef = useRef<Costume | null>(null)

  // Ensure stage or brick has at least one costume/backdrop
  useEffect(() => {
    if (!brick) return
    if (brick.costumes.length === 0) {
      if (isStage) {
        const defaultBackdrop = costumeFromImage(
          'Sky',
          blankImage(levelViewWidth, levelViewHeight)
        )
        store.setCostumes(selectedBrickId, [defaultBackdrop])
      } else {
        const defaultCostume = costumeFromImage(brick.name, blankImage(32, 32))
        store.setCostumes(selectedBrickId, [defaultCostume])
      }
    }
  }, [brick, isStage, levelViewHeight, levelViewWidth, selectedBrickId, store])

  // Clamp active index
  const safeIndex = Math.max(0, Math.min(activeCostumeIndex, Math.max(0, costumes.length - 1)))
  const currentCostume = costumes[safeIndex] ?? null
  currentCostumeRef.current = currentCostume

  // Load costume into pixel editor when selection or costume changes
  useEffect(() => {
    if (!currentCostume) return
    const img = costumeToPixelImage(currentCostume)
    const newCenter = {
      x: currentCostume.rotationCenterX ?? img.width / 2,
      y: currentCostume.rotationCenterY ?? img.height / 2,
    }
    setPixelImg(img)
    setCenter(newCenter)
    historyRef.current.clear()
    historyRef.current.push(img, newCenter)
    setCanUndo(false)
    setCanRedo(false)

    // Set appropriate initial zoom
    if (isStage) {
      setZoom(1)
    } else {
      setZoom(img.width <= 32 ? 14 : img.width <= 64 ? 8 : 4)
    }
  }, [currentCostume?.asset, currentCostume?.name, isStage])

  // Save current image and center to the store
  const commitChanges = useCallback(
    (newImg: PixelImage, newCenter: { x: number; y: number }) => {
      if (!currentCostumeRef.current) return
      const updatedCostume = savePixelImageToCostume(
        currentCostumeRef.current.name,
        newImg,
        newCenter
      )
      const nextCostumes = [...costumes]
      nextCostumes[safeIndex] = updatedCostume
      store.setCostumes(selectedBrickId, nextCostumes)
    },
    [costumes, safeIndex, selectedBrickId, store]
  )

  // Render to canvas
  const renderCanvas = useCallback(
    (previewImg?: PixelImage) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      const imgToDraw = previewImg || pixelImg
      canvas.width = imgToDraw.width * zoom
      canvas.height = imgToDraw.height * zoom
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false

      // Draw pixels
      for (let y = 0; y < imgToDraw.height; y++) {
        for (let x = 0; x < imgToDraw.width; x++) {
          const color = getPixel(imgToDraw, x, y)
          if (color[3] > 0) {
            ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`
            ctx.fillRect(x * zoom, y * zoom, zoom, zoom)
          }
        }
      }

      // Draw grid lines when zoomed in
      if (zoom >= 6) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
        ctx.lineWidth = 1
        ctx.beginPath()
        for (let x = 0; x <= imgToDraw.width; x++) {
          ctx.moveTo(x * zoom + 0.5, 0)
          ctx.lineTo(x * zoom + 0.5, canvas.height)
        }
        for (let y = 0; y <= imgToDraw.height; y++) {
          ctx.moveTo(0, y * zoom + 0.5)
          ctx.lineTo(canvas.width, y * zoom + 0.5)
        }
        ctx.stroke()
      }
    },
    [pixelImg, zoom]
  )

  useEffect(() => {
    renderCanvas()
  }, [renderCanvas])

  // Helper to convert pointer event coordinates to pixel coordinates
  function getPixelCoords(e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const px = Math.floor(clientX / zoom)
    const py = Math.floor(clientY / zoom)
    return {
      x: Math.max(0, Math.min(px, pixelImg.width - 1)),
      y: Math.max(0, Math.min(py, pixelImg.height - 1)),
    }
  }

  // Pointer event handlers
  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    isDrawing.current = true
    const { x, y } = getPixelCoords(e)
    dragStart.current = { x, y }

    const currentColor: ColorRGBA = tool === 'eraser' ? TRANSPARENT : hexToRgba(colorHex)

    if (tool === 'pencil' || tool === 'eraser') {
      const nextImg = cloneImage(pixelImg)
      setPixel(nextImg, x, y, currentColor)
      setPixelImg(nextImg)
      renderCanvas(nextImg)
    } else if (tool === 'fill') {
      const nextImg = cloneImage(pixelImg)
      floodFill(nextImg, x, y, currentColor)
      setPixelImg(nextImg)
      historyRef.current.push(nextImg, center)
      setCanUndo(historyRef.current.canUndo())
      setCanRedo(historyRef.current.canRedo())
      commitChanges(nextImg, center)
      isDrawing.current = false
    }
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return
    const { x, y } = getPixelCoords(e)
    const currentColor: ColorRGBA = tool === 'eraser' ? TRANSPARENT : hexToRgba(colorHex)

    if (tool === 'pencil' || tool === 'eraser') {
      const nextImg = cloneImage(pixelImg)
      if (dragStart.current) {
        drawLine(nextImg, dragStart.current.x, dragStart.current.y, x, y, currentColor)
      } else {
        setPixel(nextImg, x, y, currentColor)
      }
      dragStart.current = { x, y }
      setPixelImg(nextImg)
      renderCanvas(nextImg)
    } else if (tool === 'line' && dragStart.current) {
      const preview = cloneImage(pixelImg)
      drawLine(preview, dragStart.current.x, dragStart.current.y, x, y, currentColor)
      renderCanvas(preview)
    } else if (tool === 'rectangle' && dragStart.current) {
      const preview = cloneImage(pixelImg)
      drawRect(preview, dragStart.current.x, dragStart.current.y, x, y, currentColor, rectFilled)
      renderCanvas(preview)
    }
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!isDrawing.current) return
    isDrawing.current = false
    const { x, y } = getPixelCoords(e)
    const currentColor: ColorRGBA = tool === 'eraser' ? TRANSPARENT : hexToRgba(colorHex)

    let finalImg = cloneImage(pixelImg)
    if (tool === 'line' && dragStart.current) {
      drawLine(finalImg, dragStart.current.x, dragStart.current.y, x, y, currentColor)
    } else if (tool === 'rectangle' && dragStart.current) {
      drawRect(finalImg, dragStart.current.x, dragStart.current.y, x, y, currentColor, rectFilled)
    }

    setPixelImg(finalImg)
    historyRef.current.push(finalImg, center)
    setCanUndo(historyRef.current.canUndo())
    setCanRedo(historyRef.current.canRedo())
    commitChanges(finalImg, center)
    dragStart.current = null
  }

  // Rotation center drag handler
  function handleCenterPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    isDraggingCenter.current = true
  }

  function handleCenterPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isDraggingCenter.current || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const cx = (e.clientX - rect.left) / zoom
    const cy = (e.clientY - rect.top) / zoom
    const clampedX = Math.max(0, Math.min(Math.round(cx * 2) / 2, pixelImg.width))
    const clampedY = Math.max(0, Math.min(Math.round(cy * 2) / 2, pixelImg.height))
    setCenter({ x: clampedX, y: clampedY })
  }

  function handleCenterPointerUp() {
    if (!isDraggingCenter.current) return
    isDraggingCenter.current = false
    historyRef.current.push(pixelImg, center)
    setCanUndo(historyRef.current.canUndo())
    setCanRedo(historyRef.current.canRedo())
    commitChanges(pixelImg, center)
  }

  function handleResetCenter() {
    const defaultCenter = { x: pixelImg.width / 2, y: pixelImg.height / 2 }
    setCenter(defaultCenter)
    historyRef.current.push(pixelImg, defaultCenter)
    setCanUndo(historyRef.current.canUndo())
    setCanRedo(historyRef.current.canRedo())
    commitChanges(pixelImg, defaultCenter)
  }

  // Undo / Redo
  function handleUndo() {
    const res = historyRef.current.undo(pixelImg, center)
    if (!res) return
    setPixelImg(res.img)
    setCenter(res.center)
    setCanUndo(historyRef.current.canUndo())
    setCanRedo(historyRef.current.canRedo())
    commitChanges(res.img, res.center)
  }

  function handleRedo() {
    const res = historyRef.current.redo(pixelImg, center)
    if (!res) return
    setPixelImg(res.img)
    setCenter(res.center)
    setCanUndo(historyRef.current.canUndo())
    setCanRedo(historyRef.current.canRedo())
    commitChanges(res.img, res.center)
  }

  // Resizing image
  function handleResize(newWidth: number, newHeight: number) {
    const clampedW = Math.max(8, Math.min(128, newWidth))
    const clampedH = Math.max(8, Math.min(128, newHeight))
    const resized = resizeImage(pixelImg, clampedW, clampedH, 'top-left')
    const newCenter = { x: clampedW / 2, y: clampedH / 2 }
    setPixelImg(resized)
    setCenter(newCenter)
    historyRef.current.push(resized, newCenter)
    setCanUndo(historyRef.current.canUndo())
    setCanRedo(historyRef.current.canRedo())
    commitChanges(resized, newCenter)
  }

  // Costume list actions
  function handleAddCostume(pickedWord: string) {
    const existingNames = costumes.map((c) => c.name)
    const name = chooseUniqueName(pickedWord, existingNames)
    const newImg = isStage
      ? blankImage(levelViewWidth, levelViewHeight)
      : blankImage(32, 32)
    const newCostume = costumeFromImage(name, newImg)
    const nextCostumes = [...costumes, newCostume]
    store.setCostumes(selectedBrickId, nextCostumes)
    setActiveCostumeIndex(nextCostumes.length - 1)
    setAddingCostume(false)
  }

  function handleDuplicateCostume(index: number) {
    const source = costumes[index]
    if (!source) return
    const existingNames = costumes.map((c) => c.name)
    const name = chooseUniqueName(`${source.name} copy`, existingNames)
    const img = costumeToPixelImage(source)
    const duplicate = costumeFromImage(name, img, {
      x: source.rotationCenterX,
      y: source.rotationCenterY,
    })
    const nextCostumes = [...costumes]
    nextCostumes.splice(index + 1, 0, duplicate)
    store.setCostumes(selectedBrickId, nextCostumes)
    setActiveCostumeIndex(index + 1)
  }

  function handleDeleteCostume(index: number) {
    if (costumes.length <= 1) return // Keep at least one costume
    const nextCostumes = costumes.filter((_, i) => i !== index)
    store.setCostumes(selectedBrickId, nextCostumes)
    setActiveCostumeIndex(Math.max(0, index - 1))
  }

  function handleMoveCostume(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= costumes.length) return
    const nextCostumes = [...costumes]
    const temp = nextCostumes[index]
    nextCostumes[index] = nextCostumes[targetIndex]
    nextCostumes[targetIndex] = temp
    store.setCostumes(selectedBrickId, nextCostumes)
    setActiveCostumeIndex(targetIndex)
  }

  return (
    <div className="costume-editor-layout">
      {/* Sidebar: Costume / Backdrop List */}
      <aside className="costume-sidebar" aria-label={isStage ? 'Backdrops list' : 'Costumes list'}>
        <div className="costume-sidebar-header">
          <span className="costume-sidebar-title">{isStage ? 'Backdrops' : 'Costumes'}</span>
          <button
            type="button"
            className="asset-btn asset-btn-primary"
            style={{ padding: '6px 10px', minHeight: 36, fontSize: '0.8rem' }}
            onClick={() => setAddingCostume(true)}
            aria-label={isStage ? '+ Add backdrop' : '+ Add costume'}
          >
            <Plus size={16} aria-hidden="true" />
            <span>Add</span>
          </button>
        </div>

        <div className="costume-list" role="list">
          {costumes.map((c, idx) => {
            const isActive = idx === safeIndex
            return (
              <div
                key={`${c.name}-${idx}`}
                role="listitem"
                className={`costume-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveCostumeIndex(idx)}
                aria-label={`${c.name} ${idx + 1}`}
                aria-selected={isActive}
              >
                <div className="costume-item-thumb">
                  {c.asset && <img src={c.asset} alt={c.name} />}
                </div>
                <div className="costume-item-info">
                  <span className="costume-item-name">{c.name}</span>
                  <span className="costume-item-size">
                    {c.width} × {c.height}
                  </span>
                </div>
                <div className="costume-item-actions">
                  <button
                    type="button"
                    className="brick-icon-btn"
                    title="Duplicate"
                    aria-label={`Duplicate ${c.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDuplicateCostume(idx)
                    }}
                  >
                    <Copy size={12} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="brick-icon-btn brick-icon-btn-danger"
                    title="Delete"
                    aria-label={`Delete ${c.name}`}
                    disabled={costumes.length <= 1}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteCostume(idx)
                    }}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                  {idx > 0 && (
                    <button
                      type="button"
                      className="brick-icon-btn"
                      title="Move Up"
                      aria-label={`Move ${c.name} up`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMoveCostume(idx, 'up')
                      }}
                    >
                      <ChevronUp size={12} aria-hidden="true" />
                    </button>
                  )}
                  {idx < costumes.length - 1 && (
                    <button
                      type="button"
                      className="brick-icon-btn"
                      title="Move Down"
                      aria-label={`Move ${c.name} down`}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleMoveCostume(idx, 'down')
                      }}
                    >
                      <ChevronDown size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* Main Workspace: Toolbar + Canvas + Color Palette */}
      <div className="costume-canvas-workspace">
        {/* Toolbar */}
        <div className="costume-toolbar" role="toolbar" aria-label="Drawing tools">
          {/* Drawing Tools */}
          <div className="tool-group">
            <button
              type="button"
              className={`tool-btn ${tool === 'pencil' ? 'active' : ''}`}
              onClick={() => setTool('pencil')}
              aria-label="Pencil tool"
              title="Pencil"
            >
              <Pencil size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
              onClick={() => setTool('eraser')}
              aria-label="Eraser tool"
              title="Eraser"
            >
              <Eraser size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`tool-btn ${tool === 'fill' ? 'active' : ''}`}
              onClick={() => setTool('fill')}
              aria-label="Fill bucket tool"
              title="Fill bucket"
            >
              <PaintBucket size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`tool-btn ${tool === 'line' ? 'active' : ''}`}
              onClick={() => setTool('line')}
              aria-label="Line tool"
              title="Straight line"
            >
              <Slash size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`tool-btn ${tool === 'rectangle' ? 'active' : ''}`}
              onClick={() => setTool('rectangle')}
              aria-label="Rectangle tool"
              title="Rectangle"
            >
              <Square size={20} aria-hidden="true" />
            </button>
            {tool === 'rectangle' && (
              <button
                type="button"
                className="asset-btn"
                style={{ minHeight: 32, padding: '4px 8px', fontSize: '0.75rem' }}
                onClick={() => setRectFilled((f) => !f)}
                aria-label={rectFilled ? 'Switch to outline' : 'Switch to filled'}
              >
                {rectFilled ? 'Filled' : 'Outline'}
              </button>
            )}
          </div>

          {/* Undo / Redo */}
          <div className="tool-group">
            <button
              type="button"
              className="tool-btn"
              onClick={handleUndo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tool-btn"
              onClick={handleRedo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 size={20} aria-hidden="true" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="tool-group">
            <button
              type="button"
              className="tool-btn"
              onClick={() => setZoom((z) => Math.max(1, z - 2))}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <ZoomOut size={20} aria-hidden="true" />
            </button>
            <span style={{ fontSize: '0.8rem', color: '#8d95a5', padding: '0 4px' }}>
              {zoom}x
            </span>
            <button
              type="button"
              className="tool-btn"
              onClick={() => setZoom((z) => Math.min(32, z + 2))}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <ZoomIn size={20} aria-hidden="true" />
            </button>
          </div>

          {/* Rotation Center reset */}
          {!isStage && (
            <div className="tool-group">
              <button
                type="button"
                className="asset-btn"
                style={{ minHeight: 36, padding: '4px 8px', fontSize: '0.8rem' }}
                onClick={handleResetCenter}
                aria-label="Center rotation point"
                title="Reset rotation center to image middle"
              >
                <Crosshair size={16} aria-hidden="true" />
                <span>Center</span>
              </button>
            </div>
          )}

          {/* Image Size selection (bricks only: 8-128 px) */}
          {!isStage && (
            <div className="tool-group" style={{ gap: 4 }}>
              <span style={{ fontSize: '0.8rem', color: '#8d95a5' }}>Size:</span>
              {[16, 24, 32, 48, 64].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`tool-btn ${pixelImg.width === sz && pixelImg.height === sz ? 'active' : ''}`}
                  style={{ minWidth: 32, minHeight: 32, fontSize: '0.75rem' }}
                  onClick={() => handleResize(sz, sz)}
                  aria-label={`${sz} by ${sz} pixels`}
                >
                  {sz}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Canvas Viewport */}
        <div className="costume-viewport">
          <div className="pixel-canvas-wrapper">
            <canvas
              ref={canvasRef}
              className="pixel-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              aria-label="Pixel art canvas"
            />
            {/* Rotation Center Crosshair Handle (bricks only) */}
            {!isStage && (
              <div
                className="rotation-center-handle"
                style={{
                  left: `${center.x * zoom}px`,
                  top: `${center.y * zoom}px`,
                }}
                onPointerDown={handleCenterPointerDown}
                onPointerMove={handleCenterPointerMove}
                onPointerUp={handleCenterPointerUp}
                title="Drag to set rotation center"
                aria-label="Rotation center handle"
              />
            )}
          </div>
        </div>

        {/* Color Palette */}
        <div className="palette-bar" aria-label="Color palette">
          <div className="palette-swatches">
            {PALETTE_COLORS.map((hex) => (
              <button
                key={hex}
                type="button"
                className={`color-swatch ${colorHex === hex ? 'active' : ''}`}
                style={{ backgroundColor: hex }}
                onClick={() => {
                  setColorHex(hex)
                  if (tool === 'eraser') setTool('pencil')
                }}
                aria-label={`Color ${hex}`}
              />
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.8rem', color: '#8d95a5' }}>Custom:</span>
            <input
              type="color"
              className="custom-color-picker"
              value={customColor}
              onChange={(e) => {
                setCustomColor(e.target.value)
                setColorHex(e.target.value)
                if (tool === 'eraser') setTool('pencil')
              }}
              aria-label="Custom color picker"
            />
          </div>
        </div>
      </div>

      {/* Add Costume / Backdrop Modal */}
      {addingCostume && (
        <WordPickerModal
          title={isStage ? 'Pick a name for your backdrop' : 'Pick a name for your costume'}
          words={isStage ? BACKDROP_WORDS : COSTUME_WORDS}
          onSelect={handleAddCostume}
          onClose={() => setAddingCostume(false)}
        />
      )}
    </div>
  )
}
